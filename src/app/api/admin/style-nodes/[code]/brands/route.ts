import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

type Ctx = {params: Promise<{code: string}>}

/**
 * GET /api/admin/style-nodes/[code]/brands
 *   ?role=primary|secondary|both (default both)
 *   ?limit=200&offset=0
 *
 * 해당 style_node 에 분류된 brand 목록 + 대표 product (id + image) + 분류 메타.
 * 분류 품질 검수용. product_id 포함이라 deep link 가능.
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {code} = await ctx.params
  const sp = request.nextUrl.searchParams
  const role = (sp.get("role") ?? "both") as "primary" | "secondary" | "both"
  const limit = Math.min(parseInt(sp.get("limit") ?? "200", 10) || 200, 500)
  const offset = parseInt(sp.get("offset") ?? "0", 10) || 0

  // 1) node id 조회
  const {data: node, error: nErr} = await supabase
    .from("style_nodes")
    .select("id, code, name_en, name_ko")
    .eq("code", code)
    .maybeSingle()
  if (nErr) return NextResponse.json({error: nErr.message}, {status: 500})
  if (!node) return NextResponse.json({error: "node not found"}, {status: 404})

  // 2) brand 조회
  let q = supabase
    .from("brand_nodes")
    .select(
      "id, brand_name, primary_style_node_id, secondary_style_node_id, " +
        "style_node_confidence, style_node_assigned_at, style_node_assigned_model",
      {count: "exact"},
    )
    .order("style_node_confidence", {ascending: false, nullsFirst: false})
    .range(offset, offset + limit - 1)

  if (role === "primary") {
    q = q.eq("primary_style_node_id", node.id)
  } else if (role === "secondary") {
    q = q.eq("secondary_style_node_id", node.id)
  } else {
    q = q.or(`primary_style_node_id.eq.${node.id},secondary_style_node_id.eq.${node.id}`)
  }

  type BrandRow = {
    id: number
    brand_name: string
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | null
    style_node_assigned_at: string | null
    style_node_assigned_model: string | null
  }
  const {data: brandsRaw, count, error: bErr} = await q
  if (bErr) return NextResponse.json({error: bErr.message}, {status: 500})
  const brands = (brandsRaw ?? []) as unknown as BrandRow[]

  // 3) 각 brand 의 representative product (is_brand_representative=true) bulk 로드
  type RepRow = {id: string; brand_node_id: number; images: string[] | null}
  const brandIds = brands.map((b) => b.id)
  const repByBrand = new Map<number, Array<{product_id: string; image_url: string}>>()
  if (brandIds.length > 0) {
    const {data: reps, error: rErr} = await supabase
      .from("products")
      .select("id, brand_node_id, images")
      .in("brand_node_id", brandIds)
      .eq("is_brand_representative", true)
      .order("brand_node_id")
      .limit(brandIds.length * 5)
    if (rErr) return NextResponse.json({error: rErr.message}, {status: 500})
    for (const r of (reps ?? []) as RepRow[]) {
      const url = r.images?.[0]
      if (!url) continue
      const arr = repByBrand.get(r.brand_node_id) ?? []
      if (arr.length < 5) arr.push({product_id: r.id, image_url: url})
      repByBrand.set(r.brand_node_id, arr)
    }
  }

  const result = brands.map((b) => ({
    ...b,
    representatives: repByBrand.get(b.id) ?? [],
  }))

  return NextResponse.json({
    node,
    role,
    total: count ?? 0,
    brands: result,
  })
}
