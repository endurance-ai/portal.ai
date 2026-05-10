import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const revalidate = 0

interface ProposalRow {
  id: string
  brand_id: string
  brand_name: string
  field: string
  proposed_values: string[]
  confidence: number
  reasoning: string | null
  status: string
  created_at: string
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const status = sp.get("status") ?? "pending"
  const field = sp.get("field") ?? ""
  const minConf = parseFloat(sp.get("min_conf") ?? "0")
  const maxConf = parseFloat(sp.get("max_conf") ?? "1")
  const brandQ = (sp.get("brand") ?? "").trim()
  const page = parseInt(sp.get("page") ?? "0")
  const limit = parseInt(sp.get("limit") ?? "50")

  let query = supabase
    .from("brand_attribute_proposals")
    .select("id, brand_id, field, proposed_values, confidence, reasoning, status, created_at", {
      count: "exact",
    })
    .eq("status", status)
    .gte("confidence", minConf)
    .lte("confidence", maxConf)
    .order("confidence", {ascending: false})
    .order("created_at", {ascending: false})
    .range(page * limit, (page + 1) * limit - 1)

  if (field) query = query.eq("field", field)

  const {data: proposals, count, error} = await query
  if (error) return NextResponse.json({error: error.message}, {status: 500})

  // brand_name 조인 (brand_id → brand_name)
  const brandIds = Array.from(new Set((proposals ?? []).map((p) => p.brand_id)))
  const {data: brands} = await supabase
    .from("brand_nodes")
    .select("id, brand_name")
    .in("id", brandIds)
  const brandMap = new Map((brands ?? []).map((b) => [b.id, b.brand_name as string]))

  let rows: ProposalRow[] = (proposals ?? []).map((p) => ({
    id: p.id,
    brand_id: p.brand_id,
    brand_name: brandMap.get(p.brand_id) ?? "(?)",
    field: p.field,
    proposed_values: p.proposed_values,
    confidence: Number(p.confidence),
    reasoning: p.reasoning,
    status: p.status,
    created_at: p.created_at,
  }))

  // brand 검색은 후처리 (DB 단계에서 조인 불가)
  if (brandQ) {
    const q = brandQ.toLowerCase()
    rows = rows.filter((r) => r.brand_name.toLowerCase().includes(q))
  }

  return NextResponse.json({
    proposals: rows,
    total: count ?? 0,
    page,
    limit,
  })
}
