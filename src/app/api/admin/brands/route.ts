import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export async function GET(request: NextRequest) {
  // 인증 체크 (쿠키 기반)
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  // 데이터 조회 (service role — RLS 무시)
  const { searchParams } = request.nextUrl
  const node = searchParams.get("node")
  const category = searchParams.get("category")
  const gender = searchParams.get("gender")
  const search = searchParams.get("q")
  const page = parseInt(searchParams.get("page") || "0")
  const limit = 50

  let query = supabase
    .from("brand_nodes")
    .select("*", { count: "exact" })
    .order("brand_name_normalized")
    .range(page * limit, (page + 1) * limit - 1)

  // node 필터: 옛 brand_nodes.style_node (text) 는 062 에서 DROP.
  // 새 primary_style_node_id (bigint FK) 로 마이그 필요. URL param=code → style_nodes.id 조회 2-step 필요.
  // 본 P0 fix 에서는 filter 임시 무효화 (어드민 본격 reskin PR 에서 복원 예정).
  if (node && node !== "ALL") {
    const {data: snRow} = await supabase
      .from("style_nodes")
      .select("id")
      .eq("code", node)
      .maybeSingle()
    if (snRow?.id) query = query.eq("primary_style_node_id", snRow.id)
  }
  if (category) query = query.eq("category_type", category)
  if (gender) query = query.contains("gender_scope", [gender])
  if (search) query = query.ilike("brand_name_normalized", `%${search}%`)

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: data, total: count })
}
