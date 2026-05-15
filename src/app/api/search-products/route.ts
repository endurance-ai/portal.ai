// @MX:ANCHOR: [AUTO] /api/search-products thin handler — v4 engine extracted to src/domains/search-v4 (SPEC-ARCH-APP-001 REQ-APP-003/004)
// @MX:REASON: HTTP contract (request/response/status/error codes/fire-and-forget logging) byte-identical to the pre-extraction 852-LOC handler.
// @MX:SPEC: SPEC-ARCH-APP-001
import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {
  searchByEnums,
  sanitizeKeyword,
  CATEGORY_ALIASES,
  TARGET_RESULTS,
  type SearchQuery,
  type SearchRequest,
  type FormattedProduct,
  type BrandDna,
} from "@/domains/search-v4"
import {toleranceToTargetCount} from "@/lib/search/locked-filter"

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown"
    const clientUa = request.headers.get("user-agent") || "unknown"
    supabase.from("api_access_logs").insert({
      ip: clientIp,
      user_agent: clientUa,
      endpoint: "/api/search-products",
      method: "POST",
    }).then()

    const body = (await request.json()) as SearchRequest
    const { queries, gender, styleNode, moodTags, _logId } = body

    // priceFilter 검증 — PostgREST 인젝션 방지
    const rawPF = body.priceFilter as { minPrice?: unknown; maxPrice?: unknown } | undefined
    const priceFilter = rawPF ? {
      minPrice: Number.isFinite(Number(rawPF.minPrice)) ? Number(rawPF.minPrice) : undefined,
      maxPrice: Number.isFinite(Number(rawPF.maxPrice)) ? Number(rawPF.maxPrice) : undefined,
    } : undefined

    // styleTolerance 검증 (0.0~1.0). 결과 개수 5~10 사이에서 동적 조절.
    const rawTol = Number(body.styleTolerance)
    const styleTolerance = Number.isFinite(rawTol) ? Math.min(1, Math.max(0, rawTol)) : null
    const targetCount = toleranceToTargetCount(styleTolerance, TARGET_RESULTS)

    // brandFilter 검증 — 길이 100 이하 문자열, 최대 20개
    const brandFilter: string[] | null = Array.isArray(body.brandFilter)
      ? body.brandFilter
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 100)
          .slice(0, 20)
      : null
    const hasBrandFilter = brandFilter !== null && brandFilter.length > 0

    const searchStart = Date.now()

    if (!Array.isArray(queries) || queries.length === 0) {
      return NextResponse.json({ error: "No search queries provided" }, { status: 400 })
    }

    if (queries.length > 10) {
      return NextResponse.json({ error: "Too many queries. Maximum 10." }, { status: 400 })
    }

    const genderFilter =
      gender === "female" ? "women" :
      gender === "male" ? "men" : null

    const primaryNode = styleNode?.primary
    const secondaryNode = styleNode?.secondary

    logger.info(
      `🔍 검색 v2 시작 — ${queries.length}개 아이템 | 성별: ${genderFilter || "전체"} | 노드: ${primaryNode || "없음"}→${secondaryNode || "없음"}${priceFilter ? ` | 가격: ${priceFilter.minPrice || 0}~${priceFilter.maxPrice || "∞"}원` : ""}${styleTolerance !== null ? ` | tolerance=${styleTolerance.toFixed(2)} → top ${targetCount}` : ""}${hasBrandFilter ? ` | 브랜드 필터: ${brandFilter!.slice(0, 5).join(", ")}${brandFilter!.length > 5 ? ` +${brandFilter!.length - 5}` : ""}` : ""}`
    )

    // ─── Brand DNA 조회 (브랜드 성향 부스팅) ───
    // 옛 brand_nodes.style_node (062 drop) + sensitivity_tags (067 drop) 모두 폐기.
    // brandDnaMap 빈 채로 진행 → brand boost 0. SPEC-SEARCH-V6 가 새 ranking 으로 대체 예정.
    const brandDnaMap = new Map<string, BrandDna>()

    // 아이템 간 중복 제거용 — 같은 상품이 여러 아이템에서 나오면 먼저 나온 쪽에만 포함
    const globalSeenProducts = new Set<string>()

    const results: { id: string; products: (FormattedProduct & { _rawPrice: number })[] }[] = []

    for (const item of queries) {
      logger.info(`   🔎 [${item.category}] "${item.searchQuery}"`)

      const dbCategories = CATEGORY_ALIASES[item.category] ?? null

      const itemKeywords: string[] = []
      if (item.searchQuery) itemKeywords.push(...item.searchQuery.toLowerCase().split(/\s+/).map(sanitizeKeyword).filter(Boolean))
      if (item.searchQueryKo) itemKeywords.push(...item.searchQueryKo.split(/\s+/).map(sanitizeKeyword).filter(Boolean))

      const products = await searchByEnums(item, genderFilter, dbCategories, primaryNode, secondaryNode, moodTags, priceFilter, itemKeywords, brandDnaMap, hasBrandFilter ? brandFilter : null)

      // 이전 아이템에서 이미 사용된 상품 제외 + 전체 dedup 기록
      const deduped = products.filter((p) => {
        const key = `${p.brand}::${p.title}`.toLowerCase()
        if (globalSeenProducts.has(key)) return false
        globalSeenProducts.add(key)
        return true
      })

      const finalProducts = deduped.slice(0, targetCount)

      for (const p of finalProducts) {

        const s = p._scoring
        logger.info(
          `      📊 ${p.brand} | ${p.title.slice(0, 40)} | ` +
          `total=${s?.totalScore.toFixed(2)} (sub=${s?.subcategory.toFixed(2)} name=${s?.nameMatch.toFixed(2)} kw=${s?.keywords.toFixed(2)} col=${s?.colorFamily.toFixed(2)}+${s?.colorAdjacent.toFixed(2)} ` +
          `node=${s?.styleNode.toFixed(2)} fit=${s?.fit.toFixed(2)} fab=${s?.fabric.toFixed(2)} mood=${s?.moodTags.toFixed(2)} szn=${s?.season.toFixed(2)} pat=${s?.pattern.toFixed(2)} dna=${s?.brandDna.toFixed(2)}) [${p.platform}]`
        )
      }

      logger.info(`   ✅ [${item.category}] 최종 ${finalProducts.length}개`)

      results.push({
        id: item.id,
        products: finalProducts,
      })
    }

    // Quality logging (fire-and-forget)
    const qualityRows = results.map((r) => {
      const query = queries.find((q: SearchQuery) => q.id === r.id)
      const scores = r.products
        .map((p) => p._scoring?.totalScore ?? 0)
        .filter((s) => s > 0)

      return {
        analysis_id: _logId || null,
        item_id: r.id,
        query_category: query?.category,
        query_subcategory: query?.subcategory,
        query_fit: query?.fit,
        query_fabric: query?.fabric,
        query_color_family: query?.colorFamily,
        query_style_node: primaryNode,
        result_count: r.products.length,
        top_score: scores.length > 0 ? Math.max(...scores) : null,
        avg_score: scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null,
        score_breakdown: r.products.slice(0, 3).map((p) => p._scoring),
        is_empty: r.products.length === 0,
      }
    })

    if (qualityRows.length > 0) {
      supabase
        .from("search_quality_logs")
        .insert(qualityRows)
        .then(({ error }) => {
          if (error) logger.error({ error }, "search_quality_logs insert failed")
        })
    }

    const searchDuration = Date.now() - searchStart
    const totalProducts = results.reduce((sum, r) => sum + r.products.length, 0)
    logger.info(`🏁 검색 v2 완료 — ${totalProducts}개 | ${searchDuration}ms`)

    // DB에 검색 상세 로깅 (fire-and-forget)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (_logId && UUID_RE.test(_logId)) {
      supabase
        .from("analyses")
        .update({
          search_duration_ms: searchDuration,
          search_results: results.map((r) => ({
            id: r.id,
            products: r.products.map((p) => ({
              brand: p.brand,
              title: p.title,
              price: p.price,
              platform: p.platform,
              imageUrl: p.imageUrl,
              link: p.link,
              scoring: p._scoring,
            })),
          })),
        })
        .eq("id", _logId)
        .then(({ error }) => {
          if (error) logger.error({ error }, "❌ analyses 업데이트 실패")
        })
    }

    // _rawPrice 항상 제거, _scoring은 _includeScoring 플래그 시에만 포함
    const includeScoring = body._includeScoring === true
    const cleanResults = results.map((r) => ({
      id: r.id,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      products: r.products.map(({ _rawPrice, _scoring, ...rest }) =>
        includeScoring ? { ...rest, _scoring } : rest
      ),
    }))

    return NextResponse.json({ results: cleanResults })
  } catch (error) {
    logger.error({ error }, "💥 검색 v2 중 예외 발생")
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 })
  }
}
