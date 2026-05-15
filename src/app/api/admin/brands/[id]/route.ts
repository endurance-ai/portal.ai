import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const body = await request.json()

  // 옛 brand_nodes.style_node (text) 는 062 에서 DROP. 새 primary_style_node_id (bigint FK) 로 마이그됨.
  // edit panel 옛 dropdown (15 코드) 은 새 컬럼으로 직접 매핑 불가 → P0 fix 에서 style_node 수용 제거.
  // 어드민 reskin 시 primary_style_node_id 받는 dropdown 으로 교체 예정.
  const allowed = [
    "primary_style_node_id", "secondary_style_node_id",
    "category_type", "price_band", "gender_scope",
    "sensitivity_tags", "brand_keywords", "source_platforms", "attributes",
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from("brand_nodes")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brand: data })
}
