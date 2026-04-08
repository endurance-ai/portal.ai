import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {SIMILAR_SUBCATEGORIES} from "@/lib/enums/subcategory-similar"
import {isAdjacentColor} from "@/lib/enums/color-adjacency"
import {buildKoreanKeywordsMap} from "@/lib/enums/korean-vocab"
import {SUBCATEGORY_DEFAULT_SEASON} from "@/lib/enums/season-pattern"

// ─── 타입 ─────────────────────────────────────────────────

type SearchQuery = {
  id: string
  category: string
  subcategory?: string
  fit?: string
  fabric?: string
  colorFamily?: string
  searchQuery: string
  searchQueryKo?: string
  season?: string
  pattern?: string
}

type SearchRequest = {
  queries: SearchQuery[]
  gender?: string
  styleNode?: { primary: string; secondary?: string }
  moodTags?: string[]
  priceFilter?: { minPrice?: number; maxPrice?: number }
  _logId?: string
}

type ScoreBreakdown = {
  subcategory: number
  subcategorySimilar: number
  nameMatch: number
  keywords: number
  fit: number
  fabric: number
  colorFamily: number
  colorAdjacent: number
  styleNode: number
  moodTags: number
  season: number
  pattern: number
  totalScore: number
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

// ─── 상수 ─────────────────────────────────────────────────

const TARGET_RESULTS = 5
const MAX_PER_BRAND = 2
const MAX_PER_PLATFORM = 3
const ACTIVE_VERSION = "v1"
const MIN_VALID_PRICE = 1000 // ₩1,000 미만은 비정상 데이터

const WEIGHTS = {
  subcategory: 0.25,
  subcategorySimilar: 0.10,
  nameMatch: 0.20,
  keywordsEach: 0.05,
  keywordsMax: 3,
  colorFamily: 0.20,
  colorAdjacent: 0.10,
  stylePrimary: 0.30,
  styleSecondary: 0.15,
  fit: 0.15,
  fabric: 0.15,
  moodTagEach: 0.05,
  moodTagMax: 3,
  season: 0.15,
  pattern: 0.15,
} as const

// 한국어 어휘 매핑에서 빌드한 키워드를 머지
const KOREAN_KEYWORDS_MAP = buildKoreanKeywordsMap()

// 서브카테고리 → 상품명 매칭 키워드 (EN + KO)
const SUBCATEGORY_NAME_KEYWORDS: Record<string, string[]> = {
  blazer: ["blazer", "블레이저"],
  "denim-jacket": ["denim", "데님"],
  bomber: ["bomber", "봄버", "항공"],
  "field-jacket": ["field", "필드"],
  "leather-jacket": ["leather", "레더", "가죽"],
  overcoat: ["coat", "코트"],
  parka: ["parka", "파카"],
  "rain-jacket": ["rain", "레인"],
  vest: ["vest", "베스트", "조끼"],
  overshirt: ["overshirt", "오버셔츠"],
  cardigan: ["cardigan", "가디건"],
  shirt: ["shirt", "셔츠"],
  "t-shirt": ["t-shirt", "tee", "티셔츠", "반팔"],
  sweater: ["sweater", "knit", "니트", "스웨터"],
  hoodie: ["hoodie", "후디", "후드"],
  sweatshirt: ["sweatshirt", "스웻", "맨투맨"],
  "crop-top": ["crop", "크롭"],
  "tank-top": ["tank", "탱크", "나시", "슬리브리스"],
  polo: ["polo", "폴로"],
  jeans: ["jeans", "jean", "청바지"],
  "wide-pants": ["wide", "와이드"],
  "straight-pants": ["straight", "스트레이트"],
  "tapered-pants": ["taper", "테이퍼"],
  shorts: ["shorts", "short", "반바지", "쇼츠"],
  skirt: ["skirt", "스커트"],
  sneakers: ["sneaker", "스니커즈"],
  boots: ["boots", "boot", "부츠"],
  loafers: ["loafer", "로퍼"],
  sandals: ["sandal", "샌들"],
  heels: ["heel", "힐"],
  mules: ["mule", "뮬"],
  derby: ["derby", "더비"],
  tote: ["tote", "토트"],
  crossbody: ["crossbody", "크로스바디", "숄더"],
  backpack: ["backpack", "백팩"],
  clutch: ["clutch", "클러치"],
  "mini-dress": ["dress", "원피스", "드레스"],
  "midi-dress": ["dress", "원피스", "드레스"],
  "maxi-dress": ["dress", "원피스", "드레스"],
}

// 한국어 어휘 매핑의 키워드를 머지 (누락된 subcategory 키워드 보강)
for (const [sub, koKeywords] of Object.entries(KOREAN_KEYWORDS_MAP)) {
  if (!SUBCATEGORY_NAME_KEYWORDS[sub]) {
    SUBCATEGORY_NAME_KEYWORDS[sub] = koKeywords
  } else {
    for (const kw of koKeywords) {
      if (!SUBCATEGORY_NAME_KEYWORDS[sub].includes(kw)) {
        SUBCATEGORY_NAME_KEYWORDS[sub].push(kw)
      }
    }
  }
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  "Outer": ["Outer"],
  "Top": ["Top"],
  "Bottom": ["Bottom"],
  "Shoes": ["Shoes"],
  "Footwear": ["Shoes"],
  "Bag": ["Bag"],
  "Accessory": ["Accessories"],
  "Accessories": ["Accessories"],
  "Dress": ["Dress"],
  "Knitwear": ["Top"],
  "Shirts": ["Top"],
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

    const body = (await request.json()) as SearchRequest
    const { queries, gender, styleNode, moodTags, priceFilter, _logId } = body

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
      `🔍 검색 v2 시작 — ${queries.length}개 아이템 | 성별: ${genderFilter || "전체"} | 노드: ${primaryNode || "없음"}→${secondaryNode || "없음"}${priceFilter ? ` | 가격: ${priceFilter.minPrice || 0}~${priceFilter.maxPrice || "∞"}원` : ""}`
    )

    // 아이템 간 중복 제거용 — 같은 상품이 여러 아이템에서 나오면 먼저 나온 쪽에만 포함
    const globalSeenProducts = new Set<string>()

    const results: { id: string; products: (FormattedProduct & { _rawPrice: number })[] }[] = []

    for (const item of queries) {
      logger.info(`   🔎 [${item.category}] "${item.searchQuery}"`)

      const dbCategories = CATEGORY_ALIASES[item.category] ?? null

      const itemKeywords: string[] = []
      if (item.searchQuery) itemKeywords.push(...item.searchQuery.toLowerCase().split(/\s+/))
      if (item.searchQueryKo) itemKeywords.push(...item.searchQueryKo.split(/\s+/))

      const products = await searchByEnums(item, genderFilter, dbCategories, primaryNode, secondaryNode, moodTags, priceFilter, itemKeywords)

      // 이전 아이템에서 이미 사용된 상품 제외
      const deduped = products.filter((p) => {
        const key = `${p.brand}::${p.title}`.toLowerCase()
        if (globalSeenProducts.has(key)) return false
        return true
      })

      const finalProducts = deduped.slice(0, TARGET_RESULTS)

      for (const p of finalProducts) {
        const key = `${p.brand}::${p.title}`.toLowerCase()
        globalSeenProducts.add(key)

        const s = p._scoring
        logger.info(
          `      📊 ${p.brand} | ${p.title.slice(0, 40)} | ` +
          `total=${s?.totalScore.toFixed(2)} (sub=${s?.subcategory.toFixed(2)} name=${s?.nameMatch.toFixed(2)} kw=${s?.keywords.toFixed(2)} col=${s?.colorFamily.toFixed(2)}+${s?.colorAdjacent.toFixed(2)} ` +
          `node=${s?.styleNode.toFixed(2)} fit=${s?.fit.toFixed(2)} fab=${s?.fabric.toFixed(2)} mood=${s?.moodTags.toFixed(2)} szn=${s?.season.toFixed(2)} pat=${s?.pattern.toFixed(2)}) [${p.platform}]`
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

    // 응답에서 _scoring 제거 (프론트에는 안 보냄, DB에만 저장)
    const cleanResults = results.map((r) => ({
      id: r.id,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      products: r.products.map(({ _scoring, ...rest }) => rest),
    }))

    return NextResponse.json({ results: cleanResults })
  } catch (error) {
    logger.error({ error }, "💥 검색 v2 중 예외 발생")
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 })
  }
}

// ─── PAI 기반 enum 매칭 검색 ──────────────────────────────

async function searchByEnums(
  item: SearchQuery,
  genderFilter: string | null,
  dbCategories: string[] | null,
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
  moodTags: string[] | undefined,
  priceFilter: { minPrice?: number; maxPrice?: number } | undefined,
  itemKeywords: string[],
): Promise<(FormattedProduct & { _rawPrice: number })[]> {
  // ─── 경로 1: AI analysis 기반 검색 ───
  // subcategory + 유사 subcategory를 DB 단계에서 필터 (limit 200 내 누락 방지)
  const targetSubcategories: string[] = []
  if (item.subcategory) {
    targetSubcategories.push(item.subcategory)
    const similars = SIMILAR_SUBCATEGORIES[item.subcategory] ?? []
    targetSubcategories.push(...similars)
  }

  let query = supabase
    .from("product_ai_analysis")
    .select(`
      category, subcategory, fit, fabric, color_family, style_node, mood_tags,
      keywords_ko, keywords_en, season, pattern,
      products!inner (
        id, brand, name, price, image_url, product_url, platform, gender, in_stock
      )
    `)
    .eq("version", ACTIVE_VERSION)
    .eq("products.in_stock", true)
    .gte("products.price", priceFilter?.minPrice ? Math.max(priceFilter.minPrice, MIN_VALID_PRICE) : MIN_VALID_PRICE)
    .limit(200)

  if (dbCategories && dbCategories.length > 0) {
    query = query.in("category", dbCategories)
  }

  if (targetSubcategories.length > 0) {
    query = query.in("subcategory", targetSubcategories)
  }

  if (priceFilter?.maxPrice !== undefined) {
    query = query.lte("products.price", priceFilter.maxPrice)
  }

  const { data, error } = await query

  if (error) {
    logger.error({ error }, `❌ PAI 쿼리 실패 [${item.category}]`)
    return []
  }

  // ─── 경로 2: 상품명 텍스트 검색 (AI 오분류 보정) ───
  const nameKeywords = item.subcategory ? (SUBCATEGORY_NAME_KEYWORDS[item.subcategory] ?? []) : []
  let nameData: typeof data = []

  if (nameKeywords.length > 0) {
    const nameFilters = nameKeywords.map((kw) => `products.name.ilike.%${kw}%`).join(",")
    let nameQuery = supabase
      .from("product_ai_analysis")
      .select(`
        category, subcategory, fit, fabric, color_family, style_node, mood_tags,
        keywords_ko, keywords_en, season, pattern,
        products!inner (
          id, brand, name, price, image_url, product_url, platform, gender, in_stock
        )
      `)
      .eq("version", ACTIVE_VERSION)
      .eq("products.in_stock", true)
      .gte("products.price", priceFilter?.minPrice ? Math.max(priceFilter.minPrice, MIN_VALID_PRICE) : MIN_VALID_PRICE)
      .or(nameFilters, { referencedTable: "products" })
      .limit(50)

    if (dbCategories && dbCategories.length > 0) {
      nameQuery = nameQuery.in("category", dbCategories)
    }

    if (priceFilter?.maxPrice !== undefined) {
      nameQuery = nameQuery.lte("products.price", priceFilter.maxPrice)
    }

    const { data: nd, error: ne } = await nameQuery
    if (!ne && nd) {
      nameData = nd
      logger.info(`   📝 상품명 검색: ${nd.length}개 (키워드: ${nameKeywords.join(", ")})`)
    }
  }

  // ─── 병합: AI 결과 + 상품명 결과 (중복 제거) ───
  const seenIds = new Set<string>()
  const merged = [...(data || [])]
  for (const row of merged) {
    const p = Array.isArray(row.products) ? row.products[0] : row.products
    if (p) seenIds.add((p as { id: string }).id)
  }
  for (const row of nameData) {
    const p = Array.isArray(row.products) ? row.products[0] : row.products
    if (p && !seenIds.has((p as { id: string }).id)) {
      seenIds.add((p as { id: string }).id)
      merged.push(row)
    }
  }

  if (!merged.length) return []

  type RawProduct = {
    id: string; brand: string; name: string; price: number | null;
    image_url: string | null; product_url: string; platform: string;
    gender: string | null; in_stock: boolean
  }

  const scored = merged
    .map((row) => {
      const productRaw = row.products
      const p: RawProduct = (Array.isArray(productRaw) ? productRaw[0] : productRaw) as unknown as RawProduct
      if (!p) return null

      // 비정상 가격 필터
      if (p.price !== null && p.price < MIN_VALID_PRICE) return null

      // ── subcategory 스코어 ──
      let subcategoryExact = 0
      let subcategorySimilar = 0
      if (item.subcategory && row.subcategory) {
        if (row.subcategory === item.subcategory) {
          subcategoryExact = WEIGHTS.subcategory
        } else {
          const similars = SIMILAR_SUBCATEGORIES[item.subcategory] ?? []
          if (similars.includes(row.subcategory)) {
            subcategorySimilar = WEIGHTS.subcategorySimilar
          }
        }
      }
      const subcategoryScore = subcategoryExact + subcategorySimilar

      // ── 상품명 텍스트 매칭 ──
      let nameMatchScore = 0
      if (item.subcategory) {
        const nameLower = (p.name || "").toLowerCase()
        const keywords = SUBCATEGORY_NAME_KEYWORDS[item.subcategory] ?? [item.subcategory]
        if (keywords.some((kw) => nameLower.includes(kw.toLowerCase()))) {
          nameMatchScore = WEIGHTS.nameMatch
        }
      }

      // ── keywords_ko/keywords_en 매칭 (정성적 표현: 꽃무늬, 워싱 등) ──
      const rowKeywordsKo = Array.isArray(row.keywords_ko) ? (row.keywords_ko as string[]) : []
      const rowKeywordsEn = Array.isArray(row.keywords_en) ? (row.keywords_en as string[]).map((k) => k.toLowerCase()) : []
      const allRowKeywords = [...rowKeywordsKo, ...rowKeywordsEn]
      const kwOverlap = itemKeywords.filter((kw) =>
        allRowKeywords.some((rk) => rk.includes(kw) || kw.includes(rk))
      ).length
      const keywordsScore = Math.min(kwOverlap, WEIGHTS.keywordsMax) * WEIGHTS.keywordsEach

      // ── 기본 enum 매칭 ──
      const fitScore = item.fit && row.fit === item.fit ? WEIGHTS.fit : 0
      const fabricScore = item.fabric && row.fabric === item.fabric ? WEIGHTS.fabric : 0
      const colorFamilyScore = item.colorFamily && row.color_family === item.colorFamily ? WEIGHTS.colorFamily : 0
      const colorAdjacentScore = (!colorFamilyScore && item.colorFamily && row.color_family && isAdjacentColor(item.colorFamily, row.color_family))
        ? WEIGHTS.colorAdjacent : 0

      // ── 시즌 매칭 ──
      let seasonScore = 0
      const querySeason = item.season || (item.subcategory ? SUBCATEGORY_DEFAULT_SEASON[item.subcategory] : undefined)
      if (querySeason && row.season) {
        if (row.season === querySeason) {
          seasonScore = WEIGHTS.season
        } else if (row.season === "all-season") {
          seasonScore = WEIGHTS.season * 0.5
        }
      }

      // ── 패턴 매칭 ──
      let patternScore = 0
      if (item.pattern && item.pattern !== "solid" && row.pattern) {
        if (row.pattern === item.pattern) {
          patternScore = WEIGHTS.pattern
        }
      }

      // ── 스타일 노드 ──
      let styleNodeScore = 0
      if (primaryNode && row.style_node === primaryNode) {
        styleNodeScore = WEIGHTS.stylePrimary
      } else if (secondaryNode && row.style_node === secondaryNode) {
        styleNodeScore = WEIGHTS.styleSecondary
      }

      // ── 무드 태그 ──
      const rowMoodTags = Array.isArray(row.mood_tags) ? (row.mood_tags as string[]) : []
      const requestMoodTags = moodTags ?? []
      const overlapCount = rowMoodTags.filter((t) => requestMoodTags.includes(t)).length
      const moodScore = Math.min(overlapCount, WEIGHTS.moodTagMax) * WEIGHTS.moodTagEach

      const totalScore =
        subcategoryScore + nameMatchScore + keywordsScore +
        fitScore + fabricScore + colorFamilyScore + colorAdjacentScore +
        styleNodeScore + moodScore + seasonScore + patternScore

      const scoring: ScoreBreakdown = {
        subcategory: subcategoryExact,
        subcategorySimilar,
        nameMatch: nameMatchScore,
        keywords: keywordsScore,
        fit: fitScore,
        fabric: fabricScore,
        colorFamily: colorFamilyScore,
        colorAdjacent: colorAdjacentScore,
        styleNode: styleNodeScore,
        moodTags: moodScore,
        season: seasonScore,
        pattern: patternScore,
        totalScore,
      }

      // ── 성별 우선순위 ──
      const genderArr: string[] = Array.isArray(p.gender) ? p.gender : []
      let genderPriority = 2
      if (genderFilter && genderArr.includes(genderFilter)) {
        genderPriority = 0
      } else if (genderArr.includes("unisex")) {
        genderPriority = 1
      }

      // ── subcategory 매칭 tier ──
      const subTier =
        subcategoryExact > 0 ? 0 :
        nameMatchScore > 0 ? 1 :
        subcategorySimilar > 0 ? 2 : 3

      return {
        _score: totalScore,
        _rawPrice: p.price ?? 0,
        _genderPriority: genderPriority,
        _subTier: subTier,
        _scoring: scoring,
        brand: p.brand,
        price: p.price ? `₩${p.price.toLocaleString()}` : "",
        platform: p.platform,
        imageUrl: p.image_url || "",
        link: p.product_url,
        title: `${p.brand} ${p.name}`,
      }
    })
    .filter((p): p is NonNullable<typeof p> => {
      if (!p || p._score <= 0) return false

      // subcategory 정확/유사 매칭 또는 상품명 매칭 중 하나는 필수
      if (item.subcategory
        && p._scoring?.subcategory === 0
        && p._scoring?.subcategorySimilar === 0
        && p._scoring?.nameMatch === 0) return false

      return true
    })

  // 정렬: subTier → 컬러 매칭 → 성별 → 스코어 → 가격
  const hasColorQuery = !!item.colorFamily
  scored.sort((a, b) => {
    // 1. subcategory 매칭 tier
    const subDiff = a._subTier - b._subTier
    if (subDiff !== 0) return subDiff

    // 2. 컬러 매칭 (요청에 컬러가 있을 때만)
    if (hasColorQuery) {
      const aColor = (a._scoring?.colorFamily ?? 0) > 0 ? 0 : 1
      const bColor = (b._scoring?.colorFamily ?? 0) > 0 ? 0 : 1
      if (aColor !== bColor) return aColor - bColor
    }

    // 3. 성별 우선순위
    const genderDiff = a._genderPriority - b._genderPriority
    if (genderDiff !== 0) return genderDiff

    // 4. 총점
    const scoreDiff = b._score - a._score
    if (scoreDiff !== 0) return scoreDiff

    // 5. 가격 낮은 순
    return a._rawPrice - b._rawPrice
  })

  // 브랜드 + 플랫폼 다양성: 브랜드당 MAX_PER_BRAND, 플랫폼당 MAX_PER_PLATFORM
  const result: typeof scored = []
  const brandCount: Record<string, number> = {}
  const platformCount: Record<string, number> = {}

  for (const p of scored) {
    if (result.length >= TARGET_RESULTS) break
    const brand = (p.brand || "unknown").toLowerCase()
    const platform = (p.platform || "unknown").toLowerCase()

    const bCount = brandCount[brand] ?? 0
    if (bCount >= MAX_PER_BRAND) continue

    const pCount = platformCount[platform] ?? 0
    if (pCount >= MAX_PER_PLATFORM) continue

    brandCount[brand] = bCount + 1
    platformCount[platform] = pCount + 1
    result.push(p)
  }

  return result
}
