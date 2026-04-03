import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"

// ─── 타입 ─────────────────────────────────────────────────

type ScoreBreakdown = {
  keywordScore: number
  nodeBoost: number
  attrBoost: number
  totalScore: number
  matchedKoKeywords: string[]
  matchedEnKeywords: string[]
  nodeType: "primary" | "secondary" | null
}

type FormattedProduct = {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title: string
  _scoring?: ScoreBreakdown
}

type ScoredProduct = FormattedProduct & { _nodeMatch: boolean }

type NodeBrandData = {
  primary: Set<string>
  secondary: Set<string>
  brandAttrs: Map<string, Set<string>>
  excludedBrands: Set<string>
}

// ─── 상수 ─────────────────────────────────────────────────

const TARGET_RESULTS = 5
const MAX_PER_BRAND = 2

const SCORE_WEIGHTS = {
  PRIMARY_NODE_BOOST: 0.3,
  SECONDARY_NODE_BOOST: 0.15,
  ATTR_BOOST_PER_MATCH: 0.08,
  ATTR_BOOST_MAX: 4,
} as const

const CATEGORY_MAP: Record<string, string[]> = {
  "Outer": ["Outer"],
  "Top": ["Top", "Shirts", "Knitwear"],
  "Bottom": ["Bottom"],
  "Shoes": ["Shoes"],
  "Footwear": ["Shoes"],
  "Bag": ["Bag"],
  "Accessory": ["Accessories"],
  "Accessories": ["Accessories"],
  "Dress": ["Dress"],
  "Socks": ["Accessories"],
}

// ─── POST Handler ─────────────────────────────────────────

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

    const body = await request.json()
    const queries = body.queries
    const gender = body.gender as string | undefined
    const styleNode = body.styleNode as { primary: string; secondary?: string } | undefined
    const _logId = body._logId as string | undefined

    const searchStart = Date.now()

    if (!Array.isArray(queries) || queries.length === 0) {
      return NextResponse.json({ error: "No search queries provided" }, { status: 400 })
    }

    const genderFilter =
      gender === "female" ? "women" :
      gender === "male" ? "men" : null

    const primaryNode = styleNode?.primary
    const secondaryNode = styleNode?.secondary

    logger.info(
      `🔍 상품 검색 시작 — ${queries.length}개 아이템 | 성별: ${genderFilter || "전체"} | 노드: ${primaryNode || "없음"}→${secondaryNode || "없음"}`
    )

    const nodeBrands = await getNodeBrands(primaryNode, secondaryNode)

    const results = await Promise.all(
      queries.map(async (item: { id: string; category: string; searchQuery: string; searchQueryKo?: string }) => {
        logger.info(`   🔎 [${item.category}] "${item.searchQuery}"`)
        if (item.searchQueryKo) logger.info(`      🇰🇷 "${item.searchQueryKo}"`)

        // 영어 키워드 — attrBoost용
        const enKeywords = item.searchQuery
          .toLowerCase()
          .replace(/\b(men|women|unisex)\b/g, "")
          .trim()
          .split(/\s+/)
          .filter((w: string) => w.length > 2)

        // 한국어 키워드 — 상품명 매칭용 (없으면 영어 폴백)
        const koKeywords = item.searchQueryKo
          ? item.searchQueryKo
              .replace(/남성|여성|유니섹스/g, "")
              .trim()
              .split(/\s+/)
              .filter((w: string) => w.length > 1)
          : enKeywords

        const dbCategories = CATEGORY_MAP[item.category] || null

        const products = await searchProducts(koKeywords, enKeywords, genderFilter, dbCategories, nodeBrands)

        // 상세 로깅
        for (const p of products.slice(0, TARGET_RESULTS)) {
          const s = p._scoring
          logger.info(
            `      📊 ${p.brand} | ${p.title.slice(0, 40)} | ` +
            `total=${s?.totalScore.toFixed(2)} (kw=${s?.keywordScore.toFixed(2)} node=${s?.nodeBoost.toFixed(2)} attr=${s?.attrBoost.toFixed(2)}) | ` +
            `ko=[${s?.matchedKoKeywords.join(",")}] en=[${s?.matchedEnKeywords.join(",")}]`
          )
        }

        const finalProducts = products.slice(0, TARGET_RESULTS).map(({ _nodeMatch, ...rest }) => rest)

        logger.info(`   ✅ [${item.category}] 최종 ${finalProducts.length}개`)

        return {
          id: item.id,
          koKeywords,
          enKeywords,
          products: finalProducts,
        }
      })
    )

    const searchDuration = Date.now() - searchStart
    const totalProducts = results.reduce((sum, r) => sum + r.products.length, 0)
    logger.info(`🏁 상품 검색 완료 — ${totalProducts}개 | ${searchDuration}ms`)

    // DB에 검색 상세 로깅 (fire-and-forget)
    if (_logId) {
      supabase
        .from("analyses")
        .update({
          search_duration_ms: searchDuration,
          search_results: results.map((r) => ({
            id: r.id,
            koKeywords: r.koKeywords,
            enKeywords: r.enKeywords,
            products: r.products.map((p) => ({
              brand: p.brand,
              title: p.title,
              price: p.price,
              platform: p.platform,
              scoring: p._scoring,
            })),
          })),
        })
        .eq("id", _logId)
        .then(({ error }) => {
          if (error) logger.error({ error }, "❌ analyses 업데이트 실패")
        })
    }

    // 응답에서 _scoring 제거 (프론트에는 안 보냄, DB에만 저장)
    const cleanResults = results.map((r) => ({
      id: r.id,
      products: r.products.map(({ _scoring, ...rest }) => rest),
    }))

    return NextResponse.json({ results: cleanResults })
  } catch (error) {
    logger.error({ error }, "💥 상품 검색 중 예외 발생")
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 })
  }
}

// ─── 노드 브랜드 목록 (병렬 조회) ────────────────────────

async function getNodeBrands(
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
): Promise<NodeBrandData> {
  const primary = new Set<string>()
  const secondary = new Set<string>()
  const brandAttrs = new Map<string, Set<string>>()
  const excludedBrands = new Set<string>()

  const nodes = [primaryNode, secondaryNode].filter(Boolean) as string[]

  const [excludedResult, nodesResult] = await Promise.all([
    supabase
      .from("brand_nodes")
      .select("brand_name_normalized")
      .eq("category_type", "제외"),
    nodes.length > 0
      ? supabase
          .from("brand_nodes")
          .select("brand_name, brand_name_normalized, style_node, attributes")
          .in("style_node", nodes)
          .neq("category_type", "제외")
      : Promise.resolve({ data: null, error: null }),
  ])

  if (excludedResult.error) {
    logger.error({ error: excludedResult.error }, "brand_nodes excluded query failed")
  }
  if (nodesResult.error) {
    logger.error({ error: nodesResult.error }, "brand_nodes node query failed")
  }

  if (excludedResult.data) {
    for (const b of excludedResult.data) {
      if (b.brand_name_normalized) excludedBrands.add(b.brand_name_normalized.toLowerCase())
    }
  }

  if (nodesResult.data) {
    for (const b of nodesResult.data) {
      const name = (b.brand_name_normalized || b.brand_name).toLowerCase()
      if (b.style_node === primaryNode) primary.add(name)
      if (b.style_node === secondaryNode) secondary.add(name)

      const attrs = new Set<string>()
      if (b.attributes && typeof b.attributes === "object") {
        for (const values of Object.values(b.attributes as Record<string, string[]>)) {
          if (Array.isArray(values)) {
            for (const v of values) attrs.add(v.toLowerCase())
          }
        }
      }
      brandAttrs.set(name, attrs)
    }
  }

  return { primary, secondary, brandAttrs, excludedBrands }
}

// ─── DB 검색 + 스코어링 ──────────────────────────────────

async function searchProducts(
  koKeywords: string[],
  enKeywords: string[],
  genderFilter: string | null,
  categories: string[] | null,
  nodeBrands: NodeBrandData
): Promise<ScoredProduct[]> {
  let query = supabase
    .from("products")
    .select("brand, name, price, image_url, product_url, platform, category, style_node")
    .eq("in_stock", true)
    .like("image_url", "http%")
    .not("image_url", "like", "%/icon_%")
    .not("image_url", "like", "%/logo_%")
    .not("image_url", "like", "%/badge_%")
    .limit(100)

  if (categories) {
    query = query.in("category", categories)
  }

  if (genderFilter) {
    query = query.or(`gender.cs.{"${genderFilter}"},gender.cs.{"unisex"}`)
  }

  const { data: products } = await query
  if (!products?.length) return []

  const scored = products
    .filter((p) => {
      const brandLower = (p.brand || "").toLowerCase()
      return !nodeBrands.excludedBrands.has(brandLower)
    })
    .map((p) => {
      const text = `${p.brand} ${p.name}`.toLowerCase()
      const brandLower = (p.brand || "").toLowerCase()

      // 1) 한국어 키워드 → 상품명 매칭 (0~1)
      const matchedKo = koKeywords.filter((kw) => text.includes(kw))
      const keywordScore = matchedKo.length / Math.max(koKeywords.length, 1)

      // 2) 노드 부스트
      let nodeBoost = 0
      let nodeMatch = false
      let nodeType: "primary" | "secondary" | null = null
      if (nodeBrands.primary.has(brandLower)) {
        nodeBoost = SCORE_WEIGHTS.PRIMARY_NODE_BOOST
        nodeMatch = true
        nodeType = "primary"
      } else if (nodeBrands.secondary.has(brandLower)) {
        nodeBoost = SCORE_WEIGHTS.SECONDARY_NODE_BOOST
        nodeMatch = true
        nodeType = "secondary"
      }

      // 3) Attribute 부스트 — 영어 키워드 ↔ 브랜드 attributes (영어↔영어)
      let attrBoost = 0
      const matchedEn: string[] = []
      const attrs = nodeBrands.brandAttrs.get(brandLower)
      if (attrs && attrs.size > 0) {
        for (const kw of enKeywords) {
          if (attrs.has(kw)) matchedEn.push(kw)
        }
        if (matchedEn.length > 0) {
          attrBoost = SCORE_WEIGHTS.ATTR_BOOST_PER_MATCH *
            Math.min(matchedEn.length, SCORE_WEIGHTS.ATTR_BOOST_MAX)
        }
      }

      const totalScore = keywordScore + nodeBoost + attrBoost

      const scoring: ScoreBreakdown = {
        keywordScore,
        nodeBoost,
        attrBoost,
        totalScore,
        matchedKoKeywords: matchedKo,
        matchedEnKeywords: matchedEn,
        nodeType,
      }

      return {
        _score: totalScore,
        _nodeMatch: nodeMatch,
        _scoring: scoring,
        _rawPrice: p.price || 0,
        brand: p.brand,
        price: p.price ? `₩${p.price.toLocaleString()}` : "",
        platform: p.platform,
        imageUrl: p.image_url || "",
        link: p.product_url,
        title: `${p.brand} ${p.name}`,
      }
    })

  const filtered = scored.filter((p) => p._score > 0)
  filtered.sort((a, b) => b._score - a._score || a._rawPrice - b._rawPrice)

  // 브랜드 다양성
  const result: typeof filtered = []
  const brandCount: Record<string, number> = {}

  for (const p of filtered) {
    if (result.length >= TARGET_RESULTS) break
    const brand = (p.brand || "unknown").toLowerCase()
    const count = brandCount[brand] || 0
    if (count >= MAX_PER_BRAND) continue
    brandCount[brand] = count + 1
    result.push(p)
  }

  return result
}
