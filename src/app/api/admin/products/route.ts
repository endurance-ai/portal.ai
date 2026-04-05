import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  // Auth check
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

  // --- Step 1: Build products query ---
  let query = supabase
    .from("products")
    .select(
      "id, brand, name, price, image_url, platform, category, in_stock, style_node, gender, created_at",
      { count: "exact" }
    )

  if (stockStatus === "in_stock") query = query.eq("in_stock", true)
  else if (stockStatus === "out_of_stock") query = query.eq("in_stock", false)

  if (search) {
    query = query.or(`brand.ilike.%${search}%,name.ilike.%${search}%`)
  }
  if (category) query = query.eq("category", category)
  if (platform) query = query.eq("platform", platform)
  if (brand) query = query.ilike("brand", `%${brand}%`)

  switch (sort) {
    case "price_asc": query = query.order("price", { ascending: true, nullsFirst: false }); break
    case "price_desc": query = query.order("price", { ascending: false, nullsFirst: false }); break
    case "brand_asc": query = query.order("brand", { ascending: true }); break
    default: query = query.order("created_at", { ascending: false }); break
  }

  // Fetch more than PAGE_SIZE when we need post-filtering
  const needsPostFilter = aiStatus !== "all" || styleNode || colorFamily
  const fetchLimit = needsPostFilter ? 500 : PAGE_SIZE
  const from = needsPostFilter ? 0 : page * PAGE_SIZE
  const to = from + fetchLimit - 1

  query = query.range(from, to)

  const { data: products, count, error: productsErr } = await query
  if (productsErr) return NextResponse.json({ error: productsErr.message }, { status: 500 })

  if (!products?.length) {
    return NextResponse.json({ products: [], total: 0, page, totalPages: 0 })
  }

  // --- Step 2: Batch-fetch AI data ---
  const productIds = products.map((p) => p.id)
  const aiByProductId: Record<string, {
    category: string | null
    subcategory: string | null
    fit: string | null
    fabric: string | null
    color_family: string | null
    style_node: string | null
    mood_tags: string[] | null
    confidence: number | null
  }> = {}

  // Supabase .in() has URL length limits, so batch in chunks of 200
  for (let i = 0; i < productIds.length; i += 200) {
    const chunk = productIds.slice(i, i + 200)
    const { data: aiRows } = await supabase
      .from("product_ai_analysis")
      .select("product_id, category, subcategory, fit, fabric, color_family, style_node, mood_tags, confidence")
      .eq("version", "v1")
      .in("product_id", chunk)

    for (const row of aiRows ?? []) {
      aiByProductId[row.product_id] = row
    }
  }

  // --- Step 3: Merge and filter ---
  let result = products.map((p) => {
    const ai = aiByProductId[p.id] ?? null
    return {
      id: p.id,
      brand: p.brand,
      name: p.name,
      price: p.price,
      imageUrl: p.image_url,
      platform: p.platform,
      category: p.category,
      inStock: p.in_stock,
      ai: ai
        ? {
            category: ai.category,
            subcategory: ai.subcategory,
            fit: ai.fit,
            fabric: ai.fabric,
            colorFamily: ai.color_family,
            styleNode: ai.style_node,
            moodTags: ai.mood_tags,
            confidence: ai.confidence,
          }
        : null,
    }
  })

  // Post-filter by AI status
  if (aiStatus === "analyzed") {
    result = result.filter((p) => p.ai !== null)
  } else if (aiStatus === "unanalyzed") {
    result = result.filter((p) => p.ai === null)
  }

  // Post-filter by AI fields
  if (styleNode) {
    result = result.filter((p) => p.ai?.styleNode === styleNode)
  }
  if (colorFamily) {
    result = result.filter((p) => p.ai?.colorFamily === colorFamily)
  }

  // Paginate post-filtered results
  const total = needsPostFilter ? result.length : (count ?? 0)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const pageStart = needsPostFilter ? page * PAGE_SIZE : 0
  const pageEnd = pageStart + PAGE_SIZE
  const pagedResult = needsPostFilter ? result.slice(pageStart, pageEnd) : result

  return NextResponse.json({ products: pagedResult, total, page, totalPages })
}
