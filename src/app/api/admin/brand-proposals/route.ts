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

const MAX_LIMIT = 200

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const status = sp.get("status") ?? "pending"
  const field = sp.get("field") ?? ""
  const minConf = clamp(parseFloat(sp.get("min_conf") ?? "0"), 0, 1, 0)
  const maxConf = clamp(parseFloat(sp.get("max_conf") ?? "1"), 0, 1, 1)
  const brandQ = (sp.get("brand") ?? "").trim()
  const page = clamp(parseInt(sp.get("page") ?? "0"), 0, 10000, 0)
  const limit = clamp(parseInt(sp.get("limit") ?? "50"), 1, MAX_LIMIT, 50)

  // brand 검색 시: 먼저 brand_nodes 에서 매치되는 id 목록 받아서 .in() 으로 필터
  // → 카운트가 정확해지고 페이지네이션이 올바름.
  let brandIdFilter: string[] | null = null
  if (brandQ) {
    const {data: matchedBrands, error: bErr} = await supabase
      .from("brand_nodes")
      .select("id")
      .ilike("brand_name", `%${brandQ}%`)
      .limit(2000)
    if (bErr) {
      console.error("[brand-proposals] brand search failed:", bErr)
      return NextResponse.json({error: "internal error"}, {status: 500})
    }
    brandIdFilter = (matchedBrands ?? []).map((b) => b.id)
    if (brandIdFilter.length === 0) {
      return NextResponse.json({proposals: [], total: 0, page, limit})
    }
  }

  let query = supabase
    .from("brand_attribute_proposals")
    .select(
      "id, brand_id, field, proposed_values, confidence, reasoning, status, created_at",
      {count: "exact"}
    )
    .eq("status", status)
    .gte("confidence", minConf)
    .lte("confidence", maxConf)
    .order("confidence", {ascending: false})
    .order("created_at", {ascending: false})
    .range(page * limit, (page + 1) * limit - 1)

  if (field) query = query.eq("field", field)
  if (brandIdFilter) query = query.in("brand_id", brandIdFilter)

  const {data: proposals, count, error} = await query
  if (error) {
    console.error("[brand-proposals] list query failed:", error)
    return NextResponse.json({error: "internal error"}, {status: 500})
  }

  // brand_name 조인
  const proposalBrandIds = Array.from(new Set((proposals ?? []).map((p) => p.brand_id)))
  const {data: brands} = await supabase
    .from("brand_nodes")
    .select("id, brand_name")
    .in("id", proposalBrandIds)
  const brandMap = new Map((brands ?? []).map((b) => [b.id, b.brand_name as string]))

  const rows: ProposalRow[] = (proposals ?? []).map((p) => ({
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

  return NextResponse.json({
    proposals: rows,
    total: count ?? 0,
    page,
    limit,
  })
}
