import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

interface BulkBody {
  ids: string[]
  action: "approve" | "reject"
}

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const body = (await request.json()) as BulkBody
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({error: "no ids"}, {status: 400})
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
    if (error) return NextResponse.json({error: error.message}, {status: 500})
    return NextResponse.json({ok: true, count: body.ids.length})
  }

  // 승인: brand_nodes.attributes 에 머지 + status='approved'
  // 1. 대상 proposal 들 fetch
  const {data: props, error: e1} = await supabase
    .from("brand_attribute_proposals")
    .select("id, brand_id, field, proposed_values")
    .in("id", body.ids)
    .eq("status", "pending")
  if (e1) return NextResponse.json({error: e1.message}, {status: 500})
  if (!props || props.length === 0) {
    return NextResponse.json({ok: true, count: 0})
  }

  // 2. brand_id 별 그룹 — 한 brand 의 여러 field 를 한 번에 머지
  const byBrand = new Map<string, Array<{field: string; values: string[]}>>()
  for (const p of props) {
    if (!byBrand.has(p.brand_id)) byBrand.set(p.brand_id, [])
    byBrand.get(p.brand_id)!.push({field: p.field, values: p.proposed_values})
  }

  // 3. brand_nodes 현재 attributes 읽기
  const brandIds = Array.from(byBrand.keys())
  const {data: brands, error: e2} = await supabase
    .from("brand_nodes")
    .select("id, attributes")
    .in("id", brandIds)
  if (e2) return NextResponse.json({error: e2.message}, {status: 500})

  let merged = 0
  for (const b of brands ?? []) {
    const updates = byBrand.get(b.id) ?? []
    if (updates.length === 0) continue
    const newAttrs: Record<string, string[]> = {...((b.attributes as Record<string, string[]>) ?? {})}
    for (const u of updates) {
      newAttrs[u.field] = u.values
    }
    const {error} = await supabase
      .from("brand_nodes")
      .update({attributes: newAttrs})
      .eq("id", b.id)
    if (!error) merged += updates.length
  }

  // 4. proposal status 업데이트
  const {error: e3} = await supabase
    .from("brand_attribute_proposals")
    .update({
      status: "approved",
      applied_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    })
    .in("id", body.ids)
    .eq("status", "pending")
  if (e3) return NextResponse.json({error: e3.message, partialMerged: merged}, {status: 500})

  return NextResponse.json({ok: true, count: body.ids.length, merged})
}
