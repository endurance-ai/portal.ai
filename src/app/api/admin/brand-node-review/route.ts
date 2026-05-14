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
    const {data: brands} = await supabase
      .from("brand_nodes")
      .select(
        "id, brand_name, primary_style_node_id, secondary_style_node_id, style_node_confidence, representative_image_urls",
      )
      .in("id", brandIds)

    // style_node code 조인
    const styleIds = new Set<number>()
    for (const b of brands ?? []) {
      if (b.primary_style_node_id) styleIds.add(b.primary_style_node_id)
      if (b.secondary_style_node_id) styleIds.add(b.secondary_style_node_id)
    }
    let styleMap = new Map<number, string>()
    if (styleIds.size > 0) {
      const {data: styles} = await supabase
        .from("style_nodes")
        .select("id, code")
        .in("id", Array.from(styleIds))
      styleMap = new Map((styles ?? []).map((s) => [s.id, s.code]))
    }

    brandMap = new Map(
      (brands ?? []).map((b) => [
        b.id,
        {
          name: b.brand_name,
          primary_code: b.primary_style_node_id ? styleMap.get(b.primary_style_node_id) ?? null : null,
          secondary_code: b.secondary_style_node_id ? styleMap.get(b.secondary_style_node_id) ?? null : null,
          confidence: b.style_node_confidence,
          rep_count: (b.representative_image_urls ?? []).length,
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
