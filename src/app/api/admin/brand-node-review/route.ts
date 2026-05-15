import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/brand-node-review — open queue 목록.
 *
 * Optional query:
 *   ?reason=low_confidence       — 특정 reason 만
 *   ?status=open|resolved|all    — default open
 *   ?limit=50  ?offset=0
 */
export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const reason = sp.get("reason")
  const status = sp.get("status") ?? "open"
  const limit = Math.min(parseInt(sp.get("limit") ?? "50"), 200)
  const offset = parseInt(sp.get("offset") ?? "0")

  let q = supabase
    .from("brand_node_review_queue")
    .select(
      "id, brand_id, reason, vlm_output, admin_note, resolved_at, resolved_by, created_at",
      {count: "exact"},
    )
    .order("created_at", {ascending: false})
    .range(offset, offset + limit - 1)

  if (status === "open") q = q.is("resolved_at", null)
  else if (status === "resolved") q = q.not("resolved_at", "is", null)
  // status === "all" → 필터 안 함

  if (reason) q = q.eq("reason", reason)

  const {data: rows, count, error} = await q
  if (error) return NextResponse.json({error: error.message}, {status: 500})

  // brand_name 조인
  const brandIds = Array.from(new Set((rows ?? []).map((r) => r.brand_id)))
  let brandMap = new Map<number, {name: string; primary_code: string | null; secondary_code: string | null}>()
  if (brandIds.length > 0) {
    type BrandRow = {
      id: number
      brand_name: string
      primary_style_node_id: number | null
      secondary_style_node_id: number | null
      style_node_confidence: number | string | null
    }
    const {data: brandsRaw} = await supabase
      .from("brand_nodes")
      .select(
        "id, brand_name, primary_style_node_id, secondary_style_node_id, style_node_confidence",
      )
      .in("id", brandIds)
    const brands = (brandsRaw ?? []) as unknown as BrandRow[]

    // 대표 이미지 수 — products.is_brand_representative 카운트
    type RepCountRow = {brand_node_id: number}
    const {data: repCountsRaw} = await supabase
      .from("products")
      .select("brand_node_id")
      .in("brand_node_id", brandIds)
      .eq("is_brand_representative", true)
    const repCountMap = new Map<number, number>()
    for (const r of (repCountsRaw ?? []) as RepCountRow[]) {
      repCountMap.set(r.brand_node_id, (repCountMap.get(r.brand_node_id) ?? 0) + 1)
    }

    // style_node code 조인
    const styleIds = new Set<number>()
    for (const b of brands) {
      if (b.primary_style_node_id) styleIds.add(b.primary_style_node_id)
      if (b.secondary_style_node_id) styleIds.add(b.secondary_style_node_id)
    }
    let styleMap = new Map<number, string>()
    if (styleIds.size > 0) {
      const {data: styles} = await supabase
        .from("style_nodes")
        .select("id, code")
        .in("id", Array.from(styleIds))
      styleMap = new Map(((styles ?? []) as Array<{id: number; code: string}>).map((s) => [s.id, s.code]))
    }

    brandMap = new Map(
      brands.map((b) => [
        b.id,
        {
          name: b.brand_name,
          primary_code: b.primary_style_node_id ? styleMap.get(b.primary_style_node_id) ?? null : null,
          secondary_code: b.secondary_style_node_id ? styleMap.get(b.secondary_style_node_id) ?? null : null,
          confidence: b.style_node_confidence,
          rep_count: repCountMap.get(b.id) ?? 0,
        } as never,
      ]),
    )
  }

  const enriched = (rows ?? []).map((r) => ({
    ...r,
    brand: brandMap.get(r.brand_id) ?? null,
  }))

  return NextResponse.json({queue: enriched, total: count ?? 0})
}
