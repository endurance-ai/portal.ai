import {NextRequest, NextResponse} from "next/server"
import {createSupabaseServer} from "@/lib/supabase-server"
import {supabase} from "@/lib/supabase"

const PAGE_SIZE = 20
const CHUNK_SIZE = 150 // Supabase .in() safe batch size

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0)
  // PostgREST 필터 인젝션 방지: 특수문자 제거
  const sanitize = (s: string) => s.replace(/[.,()\\]/g, "")
  const search = sanitize(searchParams.get("search")?.trim() || "")
  const category = searchParams.get("category") || ""
  const subcategory = searchParams.get("subcategory") || ""
  const platform = searchParams.get("platform") || ""
  const brand = sanitize(searchParams.get("brand") || "")
  const styleNode = searchParams.get("styleNode") || ""
  const colorFamily = searchParams.get("colorFamily") || ""
  const aiStatus = searchParams.get("aiStatus") || "all"
  const stockStatus = searchParams.get("stockStatus") || "all"
  const sort = searchParams.get("sort") || "newest"

  // --- Determine sort column ---
  let orderCol = "created_at"
  let orderAsc = false
  switch (sort) {
    case "price_asc": orderCol = "price"; orderAsc = true; break
    case "price_desc": orderCol = "price"; orderAsc = false; break
    case "brand_asc": orderCol = "brand"; orderAsc = true; break
  }

  // --- AI filter: get product_ids from PAI ---
  const needsAiInclude = styleNode || colorFamily || subcategory || aiStatus === "analyzed"
  const needsAiExclude = aiStatus === "unanalyzed"

  let aiProductIds: string[] | null = null

  if (needsAiInclude) {
    let aiQuery = supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")
    if (styleNode) aiQuery = aiQuery.eq("style_node", styleNode)
    if (colorFamily) aiQuery = aiQuery.eq("color_family", colorFamily)
    if (subcategory) aiQuery = aiQuery.eq("subcategory", subcategory)

    const { data: aiRows, error: aiErr } = await aiQuery
    if (aiErr) return NextResponse.json({ error: aiErr.message }, { status: 500 })
    aiProductIds = (aiRows ?? []).map((r) => r.product_id)

    if (aiProductIds.length === 0) {
      return NextResponse.json({ products: [], total: 0, page, totalPages: 0 })
    }
  }

  let aiExcludeSet: Set<string> | null = null
  if (needsAiExclude) {
    const { data: aiRows, error: aiErr } = await supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")
    if (aiErr) return NextResponse.json({ error: aiErr.message }, { status: 500 })
    aiExcludeSet = new Set((aiRows ?? []).map((r) => r.product_id))
  }

  // --- Fetch products ---
  // Strategy: if we have AI product_ids, fetch those products in chunks
  // Otherwise, normal paginated query

  const detailStatus = searchParams.get("detailStatus") || "all" // all | with_desc | no_desc
  const reviewStatus = searchParams.get("reviewStatus") || "all" // all | with_reviews | no_reviews

  type ProductRow = {
    id: string; brand: string; name: string; price: number | null;
    image_url: string | null; platform: string; category: string | null;
    in_stock: boolean; style_node: string | null; gender: string[] | null;
    created_at: string;
    description: string | null; material: string | null;
    review_count: number | null;
  }

  let allProducts: ProductRow[] = []
  let totalCount = 0

  if (aiProductIds !== null) {
    // Fetch products by AI-filtered IDs in chunks
    for (let i = 0; i < aiProductIds.length; i += CHUNK_SIZE) {
      const chunk = aiProductIds.slice(i, i + CHUNK_SIZE)
      let q = supabase
        .from("products")
        .select("id, brand, name, price, image_url, platform, category, in_stock, style_node, gender, created_at, description, material, review_count")
        .in("id", chunk)

      if (stockStatus === "in_stock") q = q.eq("in_stock", true)
      else if (stockStatus === "out_of_stock") q = q.eq("in_stock", false)
      if (search) q = q.or(`brand.ilike.%${search}%,name.ilike.%${search}%,platform.ilike.%${search}%`)
      if (category) q = q.eq("category", category)

      if (platform) q = q.eq("platform", platform)
      if (brand) q = q.ilike("brand", `%${brand}%`)
      if (detailStatus === "with_desc") q = q.not("description", "is", null)
      else if (detailStatus === "no_desc") q = q.is("description", null)
      if (reviewStatus === "with_reviews") q = q.gt("review_count", 0)
      else if (reviewStatus === "no_reviews") q = q.or("review_count.is.null,review_count.eq.0")

      const { data } = await q
      if (data) allProducts.push(...data)
    }

    // Sort in memory
    allProducts.sort((a, b) => {
      const aVal = a[orderCol as keyof ProductRow]
      const bVal = b[orderCol as keyof ProductRow]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (aVal < bVal) return orderAsc ? -1 : 1
      if (aVal > bVal) return orderAsc ? 1 : -1
      return 0
    })

    totalCount = allProducts.length
  } else {
    // Normal paginated query
    let query = supabase
      .from("products")
      .select(
        "id, brand, name, price, image_url, platform, category, in_stock, style_node, gender, created_at, description, material, review_count",
        { count: "exact" }
      )

    if (stockStatus === "in_stock") query = query.eq("in_stock", true)
    else if (stockStatus === "out_of_stock") query = query.eq("in_stock", false)
    if (search) query = query.or(`brand.ilike.%${search}%,name.ilike.%${search}%,platform.ilike.%${search}%`)
    if (category) query = query.eq("category", category)
    if (platform) query = query.eq("platform", platform)
    if (brand) query = query.ilike("brand", `%${brand}%`)
    if (detailStatus === "with_desc") query = query.not("description", "is", null)
    else if (detailStatus === "no_desc") query = query.is("description", null)
    if (reviewStatus === "with_reviews") query = query.gt("review_count", 0)
    else if (reviewStatus === "no_reviews") query = query.or("review_count.is.null,review_count.eq.0")

    query = query.order(orderCol, { ascending: orderAsc, nullsFirst: false })

    // If excluding AI products, fetch more and post-filter
    if (aiExcludeSet) {
      query = query.range(0, 1999)
    } else {
      const from = page * PAGE_SIZE
      query = query.range(from, from + PAGE_SIZE - 1)
    }

    const { data, count, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    allProducts = data ?? []
    totalCount = count ?? 0

    // Post-filter: exclude AI-analyzed products
    if (aiExcludeSet) {
      allProducts = allProducts.filter((p) => !aiExcludeSet!.has(p.id))
      totalCount = allProducts.length
    }
  }

  // --- Paginate ---
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const pageStart = (aiProductIds !== null || aiExcludeSet !== null) ? page * PAGE_SIZE : 0
  const pageProducts = (aiProductIds !== null || aiExcludeSet !== null)
    ? allProducts.slice(pageStart, pageStart + PAGE_SIZE)
    : allProducts

  // --- Batch-fetch AI data for current page ---
  const ids = pageProducts.map((p) => p.id)
  const aiMap: Record<string, {
    category: string | null; subcategory: string | null; fit: string | null;
    fabric: string | null; color_family: string | null; style_node: string | null;
    mood_tags: string[] | null; confidence: number | null;
  }> = {}

  if (ids.length > 0) {
    const { data: aiRows } = await supabase
      .from("product_ai_analysis")
      .select("product_id, category, subcategory, fit, fabric, color_family, style_node, mood_tags, confidence")
      .eq("version", "v1")
      .in("product_id", ids)

    for (const row of aiRows ?? []) {
      aiMap[row.product_id] = row
    }
  }

  // --- Format response ---
  const result = pageProducts.map((p) => {
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
      hasDescription: !!p.description,
      hasMaterial: !!p.material,
      reviewCount: p.review_count ?? 0,
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

  return NextResponse.json({ products: result, total: totalCount, page, totalPages })
}
