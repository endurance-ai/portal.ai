import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0)
  const search = searchParams.get("search")?.trim() || ""
  const category = searchParams.get("category") || ""
  const platform = searchParams.get("platform") || ""
  const brand = searchParams.get("brand") || ""
  const styleNode = searchParams.get("styleNode") || ""
  const colorFamily = searchParams.get("colorFamily") || ""
  const aiStatus = searchParams.get("aiStatus") || "all"
  const stockStatus = searchParams.get("stockStatus") || "all"
  const sort = searchParams.get("sort") || "newest"

  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // --- Strategy: AI field filters → get product_ids from PAI first ---
  const needsAiInclude = styleNode || colorFamily || aiStatus === "analyzed"
  const needsAiExclude = aiStatus === "unanalyzed"

  let aiIncludeIds: Set<string> | null = null
  let aiExcludeIds: Set<string> | null = null

  if (needsAiInclude) {
    let aiQuery = supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")

    if (styleNode) aiQuery = aiQuery.eq("style_node", styleNode)
    if (colorFamily) aiQuery = aiQuery.eq("color_family", colorFamily)

    const { data: aiRows, error: aiErr } = await aiQuery
    if (aiErr) return NextResponse.json({ error: aiErr.message }, { status: 500 })

    aiIncludeIds = new Set((aiRows ?? []).map((r) => r.product_id))

    if (aiIncludeIds.size === 0) {
      return NextResponse.json({ products: [], total: 0, page, totalPages: 0 })
    }
  }

  if (needsAiExclude) {
    const { data: aiRows, error: aiErr } = await supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")

    if (aiErr) return NextResponse.json({ error: aiErr.message }, { status: 500 })
    aiExcludeIds = new Set((aiRows ?? []).map((r) => r.product_id))
  }

  // --- Build products query ---
  // When we have aiIncludeIds, we can't use .in() for large sets (URL limit).
  // Instead, fetch a larger batch and filter client-side.
  const usePostFilter = (aiIncludeIds !== null && aiIncludeIds.size > 100) || aiExcludeIds !== null
  const fetchSize = usePostFilter ? Math.min(aiIncludeIds?.size ?? 2000, 2000) : PAGE_SIZE

  let query = supabase
    .from("products")
    .select(
      "id, brand, name, price, image_url, platform, category, in_stock, style_node, gender, created_at",
      { count: "exact" }
    )

  if (stockStatus === "in_stock") query = query.eq("in_stock", true)
  else if (stockStatus === "out_of_stock") query = query.eq("in_stock", false)

  if (search) query = query.or(`brand.ilike.%${search}%,name.ilike.%${search}%`)
  if (category) query = query.eq("category", category)
  if (platform) query = query.eq("platform", platform)
  if (brand) query = query.ilike("brand", `%${brand}%`)

  // For small includeId sets, use .in() directly (fast)
  if (aiIncludeIds !== null && aiIncludeIds.size <= 100) {
    query = query.in("id", [...aiIncludeIds])
  }

  switch (sort) {
    case "price_asc": query = query.order("price", { ascending: true, nullsFirst: false }); break
    case "price_desc": query = query.order("price", { ascending: false, nullsFirst: false }); break
    case "brand_asc": query = query.order("brand", { ascending: true }); break
    default: query = query.order("created_at", { ascending: false }); break
  }

  if (usePostFilter) {
    query = query.range(0, fetchSize - 1)
  } else {
    query = query.range(from, to)
  }

  const { data: products, count, error: productsErr } = await query
  if (productsErr) return NextResponse.json({ error: productsErr.message }, { status: 500 })

  if (!products?.length) {
    return NextResponse.json({ products: [], total: 0, page, totalPages: 0 })
  }

  // --- Post-filter by AI ID sets ---
  let filtered = products
  if (aiIncludeIds !== null && aiIncludeIds.size > 100) {
    filtered = filtered.filter((p) => aiIncludeIds!.has(p.id))
  }
  if (aiExcludeIds !== null) {
    filtered = filtered.filter((p) => !aiExcludeIds!.has(p.id))
  }

  // --- Batch-fetch AI data (chunks of 200) ---
  const filteredIds = filtered.map((p) => p.id)
  const aiMap: Record<string, {
    category: string | null; subcategory: string | null; fit: string | null;
    fabric: string | null; color_family: string | null; style_node: string | null;
    mood_tags: string[] | null; confidence: number | null;
  }> = {}

  for (let i = 0; i < filteredIds.length; i += 200) {
    const chunk = filteredIds.slice(i, i + 200)
    const { data: aiRows } = await supabase
      .from("product_ai_analysis")
      .select("product_id, category, subcategory, fit, fabric, color_family, style_node, mood_tags, confidence")
      .eq("version", "v1")
      .in("product_id", chunk)

    for (const row of aiRows ?? []) {
      aiMap[row.product_id] = row
    }
  }

  // --- Merge ---
  let result = filtered.map((p) => {
    const ai = aiMap[p.id] ?? null
    return {
      id: p.id,
      brand: p.brand,
      name: p.name,
      price: p.price,
      imageUrl: p.image_url,
      platform: p.platform,
      category: p.category,
      inStock: p.in_stock,
      ai: ai ? {
        category: ai.category,
        subcategory: ai.subcategory,
        fit: ai.fit,
        fabric: ai.fabric,
        colorFamily: ai.color_family,
        styleNode: ai.style_node,
        moodTags: ai.mood_tags,
        confidence: ai.confidence,
      } : null,
    }
  })

  // --- Paginate ---
  const total = usePostFilter ? result.length : (count ?? 0)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (usePostFilter) {
    const start = page * PAGE_SIZE
    result = result.slice(start, start + PAGE_SIZE)
  }

  return NextResponse.json({ products: result, total, page, totalPages })
}
