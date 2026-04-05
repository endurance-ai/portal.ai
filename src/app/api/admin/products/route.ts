import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  // Auth check (cookie-based)
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0)
  const search = searchParams.get("search")
  const category = searchParams.get("category")
  const platform = searchParams.get("platform")
  const brand = searchParams.get("brand")
  const styleNode = searchParams.get("styleNode")
  const colorFamily = searchParams.get("colorFamily")
  const aiStatus = searchParams.get("aiStatus") || "all"
  const stockStatus = searchParams.get("stockStatus") || "all" // all | in_stock | out_of_stock
  const sort = searchParams.get("sort") || "newest"

  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // --- Step 1: Resolve AI-based filters to product_id sets ---
  let includeIds: string[] | null = null
  let excludeIds: string[] | null = null

  const needsAiFilter = styleNode || colorFamily || aiStatus === "analyzed"

  if (needsAiFilter) {
    let aiQuery = supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")

    if (styleNode) aiQuery = aiQuery.eq("style_node", styleNode)
    if (colorFamily) aiQuery = aiQuery.eq("color_family", colorFamily)

    const { data: aiRows, error: aiErr } = await aiQuery
    if (aiErr) return NextResponse.json({ error: aiErr.message }, { status: 500 })

    includeIds = (aiRows ?? []).map((r) => r.product_id)

    // If no AI results match, return empty immediately
    if (includeIds.length === 0) {
      return NextResponse.json({ products: [], total: 0, page, totalPages: 0 })
    }
  }

  if (aiStatus === "unanalyzed") {
    // Get all product_ids that HAVE AI data
    const { data: allAiRows, error: allAiErr } = await supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")

    if (allAiErr) return NextResponse.json({ error: allAiErr.message }, { status: 500 })

    excludeIds = (allAiRows ?? []).map((r) => r.product_id)
  }

  // --- Step 2: Main products query ---
  let query = supabase
    .from("products")
    .select(
      "id, brand, name, price, image_url, platform, category, in_stock, style_node, gender, created_at",
      { count: "exact" }
    )

  // Stock filter (default: show all)
  if (stockStatus === "in_stock") query = query.eq("in_stock", true)
  else if (stockStatus === "out_of_stock") query = query.eq("in_stock", false)

  // Apply text search
  if (search) {
    query = query.or(`brand.ilike.%${search}%,name.ilike.%${search}%`)
  }

  if (category) query = query.eq("category", category)
  if (platform) query = query.eq("platform", platform)
  if (brand) query = query.ilike("brand", `%${brand}%`)

  // Apply AI-derived ID filters
  if (includeIds !== null) {
    query = query.in("id", includeIds)
  }

  // For large excludeIds lists, handle in client; otherwise use .not().in()
  if (excludeIds !== null && excludeIds.length > 0 && excludeIds.length <= 5000) {
    query = query.not("id", "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`)
  }

  // Apply sort
  switch (sort) {
    case "price_asc":
      query = query.order("price", { ascending: true, nullsFirst: false })
      break
    case "price_desc":
      query = query.order("price", { ascending: false, nullsFirst: false })
      break
    case "brand_asc":
      query = query.order("brand", { ascending: true })
      break
    case "newest":
    default:
      query = query.order("created_at", { ascending: false })
      break
  }

  query = query.range(from, to)

  const { data: products, count, error: productsErr } = await query
  if (productsErr) return NextResponse.json({ error: productsErr.message }, { status: 500 })

  let filteredProducts = products ?? []

  // Client-side exclusion for large excludeIds sets
  if (excludeIds !== null && excludeIds.length > 5000) {
    const excludeSet = new Set(excludeIds)
    filteredProducts = filteredProducts.filter((p) => !excludeSet.has(p.id))
  }

  // --- Step 3: Batch-fetch AI data for result products ---
  const productIds = filteredProducts.map((p) => p.id)
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

  if (productIds.length > 0) {
    const { data: aiRows } = await supabase
      .from("product_ai_analysis")
      .select("product_id, category, subcategory, fit, fabric, color_family, style_node, mood_tags, confidence")
      .eq("version", "v1")
      .in("product_id", productIds)

    for (const row of aiRows ?? []) {
      aiByProductId[row.product_id] = row
    }
  }

  // --- Step 4: Merge and format response ---
  let result = filteredProducts.map((p) => {
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

  // Post-filter: strictly enforce AI status + stock status after merge
  if (aiStatus === "analyzed") {
    result = result.filter((p) => p.ai !== null)
  } else if (aiStatus === "unanalyzed") {
    result = result.filter((p) => p.ai === null)
  }

  // If post-filtering changed count, use filtered length
  const needsPostFilterCount = aiStatus !== "all"
  const total = needsPostFilterCount ? result.length : (count ?? 0)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return NextResponse.json({ products: result, total, page, totalPages })
}
