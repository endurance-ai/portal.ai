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

  if (node && node !== "ALL") query = query.eq("style_node", node)
  if (category) query = query.eq("category_type", category)
  if (gender) query = query.contains("gender_scope", [gender])
  if (search) query = query.ilike("brand_name_normalized", `%${search}%`)

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: data, total: count })
}
