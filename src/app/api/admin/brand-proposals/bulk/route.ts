import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

interface BulkBody {
  ids: string[]
  action: "approve" | "reject"
}

const MAX_BULK = 200

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const body = (await request.json()) as BulkBody
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({error: "no ids"}, {status: 400})
  }
  if (body.ids.length > MAX_BULK) {
    return NextResponse.json(
      {error: `too many ids (max ${MAX_BULK})`},
      {status: 400}
    )
  }
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({error: "invalid action"}, {status: 400})
  }

  // 거절은 단순 업데이트
  if (body.action === "reject") {
    const {error} = await supabase
      .from("brand_attribute_proposals")
      .update({status: "rejected", reviewed_at: new Date().toISOString()})
      .in("id", body.ids)
    if (error) {
      console.error("[brand-proposals/bulk] reject failed:", error)
      return NextResponse.json({error: "internal error"}, {status: 500})
    }
    return NextResponse.json({ok: true, count: body.ids.length})
  }

  // 승인 — brand_nodes.attributes 머지 + status='approved'
  //
  // 비원자성 회피 전략 (Supabase JS 가 multi-row 트랜잭션 미지원):
  //   1. 대상 proposal fetch
  //   2. brand_id 별 그룹핑
  //   3. 모든 brand_nodes UPDATE 시도
  //   4. 한 건이라도 실패 시 status 업데이트 skip + 500 반환
  //   → 사용자가 재시도 시 이미 머지된 brand 는 다시 머지(attributes idempotent)
  //     status 는 여전히 pending 이라 다음 요청에서 재처리 가능
  const {data: props, error: e1} = await supabase
    .from("brand_attribute_proposals")
    .select("id, brand_id, field, proposed_values")
    .in("id", body.ids)
    .eq("status", "pending")
  if (e1) {
    console.error("[brand-proposals/bulk] proposal fetch failed:", e1)
    return NextResponse.json({error: "internal error"}, {status: 500})
  }
  if (!props || props.length === 0) {
    return NextResponse.json({ok: true, count: 0})
  }

  const byBrand = new Map<string, Array<{field: string; values: string[]}>>()
  for (const p of props) {
    if (!byBrand.has(p.brand_id)) byBrand.set(p.brand_id, [])
    byBrand.get(p.brand_id)!.push({field: p.field, values: p.proposed_values})
  }

  const brandIds = Array.from(byBrand.keys())
  const {data: brands, error: e2} = await supabase
    .from("brand_nodes")
    .select("id, attributes")
    .in("id", brandIds)
  if (e2) {
    console.error("[brand-proposals/bulk] brand_nodes fetch failed:", e2)
    return NextResponse.json({error: "internal error"}, {status: 500})
  }

  // 모든 brand_nodes UPDATE — 실패한 brand_id 수집
  const failedBrandIds: string[] = []
  let merged = 0
  for (const b of brands ?? []) {
    const updates = byBrand.get(b.id) ?? []
    if (updates.length === 0) continue
    const newAttrs: Record<string, string[]> = {
      ...((b.attributes as Record<string, string[]>) ?? {}),
    }
    for (const u of updates) {
      newAttrs[u.field] = u.values
    }
    const {error} = await supabase
      .from("brand_nodes")
      .update({attributes: newAttrs})
      .eq("id", b.id)
    if (error) {
      console.error(`[brand-proposals/bulk] brand_nodes update failed (${b.id}):`, error)
      failedBrandIds.push(b.id)
    } else {
      merged += updates.length
    }
  }

  // 한 건이라도 실패 시 status 업데이트 skip — 재시도 가능 상태 유지
  if (failedBrandIds.length > 0) {
    return NextResponse.json(
      {
        error: "partial merge failure — please retry",
        merged,
        failedBrandIds,
      },
      {status: 500}
    )
  }

  // 모든 머지 성공 시에만 status='approved'
  const {error: e3} = await supabase
    .from("brand_attribute_proposals")
    .update({
      status: "approved",
      applied_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    })
    .in("id", body.ids)
    .eq("status", "pending")
  if (e3) {
    console.error("[brand-proposals/bulk] status update failed:", e3)
    return NextResponse.json(
      {error: "internal error", partialMerged: merged},
      {status: 500}
    )
  }

  return NextResponse.json({ok: true, count: body.ids.length, merged})
}
