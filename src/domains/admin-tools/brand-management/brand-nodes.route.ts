import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/brand-nodes
 *   ?nodeId=N            — primary_style_node_id 일치
 *   ?status=all|classified|unclassified|low_conf
 *   ?q=text              — brand_name ILIKE
 *   ?minConf=0.0&maxConf=1.0
 *   ?page=0&limit=24
 *
 * brand 목록 (style_nodes JOIN + representative products) 반환. 어드민 카드 그리드용.
 */
export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const nodeId = sp.get("nodeId")
  const status = (sp.get("status") ?? "all") as "all" | "classified" | "unclassified" | "low_conf"
  const q = sp.get("q")?.trim() ?? ""
  const minConf = sp.get("minConf") ? parseFloat(sp.get("minConf")!) : null
  const maxConf = sp.get("maxConf") ? parseFloat(sp.get("maxConf")!) : null
  const page = Math.max(0, parseInt(sp.get("page") ?? "0", 10) || 0)
  const limit = Math.min(parseInt(sp.get("limit") ?? "24", 10) || 24, 100)
  const offset = page * limit

  let query = supabase
    .from("brand_nodes")
    .select(
      "id, brand_name, primary_style_node_id, secondary_style_node_id, " +
        "style_node_confidence, style_node_assigned_at, style_node_assigned_model",
      {count: "exact"},
    )
    .order("style_node_confidence", {ascending: false, nullsFirst: false})
    .order("brand_name_normalized", {ascending: true})
    .range(offset, offset + limit - 1)

  if (status === "classified") query = query.not("primary_style_node_id", "is", null)
  else if (status === "unclassified") query = query.is("primary_style_node_id", null)
  else if (status === "low_conf") query = query.lt("style_node_confidence", 0.7)

  if (nodeId) {
    const parsed = parseInt(nodeId, 10)
    if (Number.isFinite(parsed)) query = query.eq("primary_style_node_id", parsed)
  }
  if (q) query = query.ilike("brand_name_normalized", `%${q.toLowerCase()}%`)
  if (minConf != null) query = query.gte("style_node_confidence", minConf)
  if (maxConf != null) query = query.lte("style_node_confidence", maxConf)

  type BrandRow = {
    id: number
    brand_name: string
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | null
    style_node_assigned_at: string | null
    style_node_assigned_model: string | null
  }
  const {data: rawBrands, count, error: bErr} = await query
  if (bErr) return NextResponse.json({error: bErr.message}, {status: 500})
  const brands = (rawBrands ?? []) as unknown as BrandRow[]

  const nodeIdsRef = new Set<number>()
  for (const b of brands) {
    if (b.primary_style_node_id != null) nodeIdsRef.add(b.primary_style_node_id)
    if (b.secondary_style_node_id != null) nodeIdsRef.add(b.secondary_style_node_id)
  }
  type NodeRow = {id: number; code: string; name_en: string}
  const nodeMap = new Map<number, NodeRow>()
  if (nodeIdsRef.size > 0) {
    const {data: nodes} = await supabase
      .from("style_nodes")
      .select("id, code, name_en")
      .in("id", Array.from(nodeIdsRef))
    for (const n of (nodes ?? []) as NodeRow[]) nodeMap.set(n.id, n)
  }

  type RepRow = {id: string; image_url: string | null; images: string[] | null}
  const brandIds = brands.map((b) => b.id)
  const repByBrand = new Map<number, Array<{product_id: string; image_url: string}>>()
  if (brandIds.length > 0) {
    // 브랜드별 분리 쿼리(병렬). 단일 IN + 전역 limit 패턴은 rep 가 캡을 초과하는
    // 브랜드가 brand_node_id 앞 순번에 있으면 전역 예산을 소진해 뒤 브랜드가 0개로
    // 굶음. 브랜드당 독립 조회로 분리해 rep 분포와 무관하게 각 5개를 보장.
    await Promise.all(
      brandIds.map(async (bid) => {
        const {data: reps, error: repErr} = await supabase
          .from("products")
          .select("id, image_url, images")
          .eq("brand_node_id", bid)
          .eq("is_brand_representative", true)
          // 표시 cap 은 5. image_url·images 둘 다 null 인 rep 행이 섞여도 유효
          // 이미지 5개를 확보하도록 버퍼를 둔 값 (rep 는 브랜드당 최대 10개).
          .limit(20)
        // 썸네일은 분류 그리드의 보조 정보 — 단일 브랜드 rep 조회 실패가 그리드
        // 전체를 500 시키지 않도록 graceful degrade 하되, silent 누락 방지를 위해
        // 서버 로그에는 남긴다 (상단 brand 쿼리는 bErr 로 엄격 처리, 여기는 보조).
        if (repErr) console.error(`[brand-nodes] rep query failed brand=${bid}: ${repErr.message}`)
        const arr: Array<{product_id: string; image_url: string}> = []
        for (const r of (reps ?? []) as RepRow[]) {
          // image_url(스칼라) 우선 → images[](배열) 폴백. Cafe24 계열 소스는
          // image_url 만 채우고 images 배열이 null 이라 후자만 보면 누락됨
          // (상세 라우트 brand-graph__detail 와 동일 규칙).
          const url = r.image_url ?? r.images?.[0]
          if (!url) continue
          arr.push({product_id: r.id, image_url: url})
          if (arr.length >= 5) break
        }
        if (arr.length > 0) repByBrand.set(bid, arr)
      }),
    )
  }

  const result = brands.map((b) => ({
    id: b.id,
    brand_name: b.brand_name,
    primary: b.primary_style_node_id != null ? nodeMap.get(b.primary_style_node_id) ?? null : null,
    secondary: b.secondary_style_node_id != null ? nodeMap.get(b.secondary_style_node_id) ?? null : null,
    confidence: b.style_node_confidence != null ? Number(b.style_node_confidence) : null,
    assigned_at: b.style_node_assigned_at,
    model: b.style_node_assigned_model,
    representatives: repByBrand.get(b.id) ?? [],
  }))

  return NextResponse.json({
    brands: result,
    total: count ?? 0,
    page,
    limit,
    has_more: (count ?? 0) > offset + limit,
  })
}
