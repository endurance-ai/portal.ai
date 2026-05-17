import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

// 본 라우트는 옛 /admin/brand-graph 페이지(폐기)와 새 /admin/brand-nodes drawer
// 둘 다 사용했으나, 067 migration 으로 brand_nodes 슬림화 후 새 drawer 전용.
// 향후 /api/admin/brand-nodes/[id]/route.ts 로 이전 예정.

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({error: "missing id"}, {status: 400})

  // 1) brand_nodes — 슬림화된 컬럼만
  type BrandRow = {
    id: number
    brand_name: string
    attributes: Record<string, string[]> | null
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | string | null
    style_node_assigned_model: string | null
    style_node_assigned_at: string | null
    gender_scope: string[] | null
    source_platforms: string[] | null
    price_min_usd: number | string | null
    price_max_usd: number | string | null
  }
  const {data: brandRaw, error: bErr} = await supabase
    .from("brand_nodes")
    .select(
      "id, brand_name, attributes, " +
        "primary_style_node_id, secondary_style_node_id, " +
        "style_node_confidence, style_node_assigned_model, style_node_assigned_at, " +
        "gender_scope, source_platforms, price_min_usd, price_max_usd",
    )
    .eq("id", id)
    .single()
  if (bErr || !brandRaw) {
    return NextResponse.json({error: "not found"}, {status: 404})
  }
  const brand = brandRaw as unknown as BrandRow

  // 2) style_nodes JOIN — primary / secondary
  const nodeIds: number[] = []
  if (brand.primary_style_node_id != null) nodeIds.push(brand.primary_style_node_id)
  if (brand.secondary_style_node_id != null && brand.secondary_style_node_id !== brand.primary_style_node_id) {
    nodeIds.push(brand.secondary_style_node_id)
  }
  type NodeRow = {id: number; code: string; name_en: string}
  const nodeMap = new Map<number, NodeRow>()
  if (nodeIds.length > 0) {
    const {data: nodes} = await supabase
      .from("style_nodes")
      .select("id, code, name_en")
      .in("id", nodeIds)
    for (const n of (nodes ?? []) as NodeRow[]) nodeMap.set(n.id, n)
  }

  // 3) products — samples + stats
  type ProductRow = {
    id: string
    name: string | null
    image_url: string | null
    images: string[] | null
    original_price: number | null
    sale_price: number | null
    source_price: number | null
    source_currency: string | null
    category: string | null
    product_url: string | null
    in_stock: boolean | null
    is_brand_representative: boolean | null
  }
  const {data: products} = await supabase
    .from("products")
    .select(
      "id, name, image_url, images, original_price, sale_price, source_price, source_currency, " +
        "category, product_url, in_stock, is_brand_representative",
    )
    .eq("brand_node_id", id)
    .limit(2000)

  const all = (products ?? []) as unknown as ProductRow[]
  const skuCount = all.length
  const inStockCount = all.filter((p) => p.in_stock).length

  // samples: representative 우선 → 다양한 카테고리
  const repSamples = all.filter((p) => p.is_brand_representative).slice(0, 10)
  const samples: ProductRow[] = [...repSamples]
  if (samples.length < 10) {
    const seen = new Set(samples.map((s) => s.id))
    for (const p of all) {
      if (samples.length >= 10) break
      if (seen.has(p.id)) continue
      const img = p.image_url ?? p.images?.[0]
      if (!img) continue
      samples.push(p)
      seen.add(p.id)
    }
  }

  // 4) similar brand (brand_similar 037 자산, SPEC 5 cutover 후 정리 예정)
  type SimEdge = {similar_brand_id: number; similarity: number | string}
  const {data: simEdges} = await supabase
    .from("brand_similar")
    .select("similar_brand_id, similarity")
    .eq("brand_id", id)
    .order("rank")
    .limit(8)

  const similarResult: Array<{id: number; name: string; similarity: number}> = []
  if (simEdges && simEdges.length > 0) {
    const ids = (simEdges as SimEdge[]).map((e) => e.similar_brand_id)
    const {data: simBrands} = await supabase
      .from("brand_nodes")
      .select("id, brand_name")
      .in("id", ids)
    const brandMap = new Map(((simBrands ?? []) as Array<{id: number; brand_name: string}>).map((b) => [b.id, b]))
    for (const e of simEdges as SimEdge[]) {
      const b = brandMap.get(e.similar_brand_id)
      if (!b) continue
      similarResult.push({id: b.id, name: b.brand_name, similarity: Number(e.similarity)})
    }
  }

  return NextResponse.json({
    brand: {
      id: brand.id,
      name: brand.brand_name,
      attributes: brand.attributes,
      primary_style_node:
        brand.primary_style_node_id != null ? nodeMap.get(brand.primary_style_node_id) ?? null : null,
      secondary_style_node:
        brand.secondary_style_node_id != null ? nodeMap.get(brand.secondary_style_node_id) ?? null : null,
      confidence: brand.style_node_confidence != null ? Number(brand.style_node_confidence) : null,
      classify_model: brand.style_node_assigned_model,
      classified_at: brand.style_node_assigned_at,
      gender_scope: brand.gender_scope,
      source_platforms: brand.source_platforms,
      price_min_usd: brand.price_min_usd != null ? Number(brand.price_min_usd) : null,
      price_max_usd: brand.price_max_usd != null ? Number(brand.price_max_usd) : null,
    },
    stats: {product_count: skuCount, in_stock_count: inStockCount},
    samples: samples.map((p) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url ?? p.images?.[0] ?? null,
      sale_price: p.sale_price,
      source_price: p.source_price,
      source_currency: p.source_currency,
      category: p.category,
      product_url: p.product_url,
    })),
    similar: similarResult,
  })
}
