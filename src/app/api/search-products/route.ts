import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {SIMILAR_SUBCATEGORIES} from "@/lib/enums/subcategory-similar"
import {isAdjacentColor} from "@/lib/enums/color-adjacency"
import {buildKoreanKeywordsMap} from "@/lib/enums/korean-vocab"
import {SUBCATEGORY_DEFAULT_SEASON} from "@/lib/enums/season-pattern"
import {getStyleSimilarity} from "@/lib/enums/style-adjacency"
import {type LockedAttributes, passesLockedFilter, toleranceToTargetCount,} from "@/lib/search/locked-filter"

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
  /** Q&A 에이전트 — 유저가 락한 속성. 매칭되지 않으면 hard filter로 제외. */
  lockedAttributes?: LockedAttributes
}

type SearchRequest = {
  queries: SearchQuery[]
  gender?: string
  styleNode?: { primary: string; secondary?: string }
  moodTags?: string[]
  priceFilter?: { minPrice?: number; maxPrice?: number }
  /** Q&A 에이전트 — 0.0(tight)~1.0(loose). 결과 개수 조절(5~10). */
  styleTolerance?: number
  _logId?: string
  _includeScoring?: boolean
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
  brandDna: number
  totalScore: number
}

type MatchReason = {
  field: string  // "colorFamily" | "fit" | "fabric" | "styleNode" | "season" | "pattern"
  value: string  // "Black", "Oversized", etc.
}

type FormattedProduct = {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: MatchReason[]
  _scoring?: ScoreBreakdown
}

// ─── 상수 ─────────────────────────────────────────────────

const TARGET_RESULTS = 7
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
  brandDna: 0.20,
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

/** PostgREST 필터 인젝션 방지 — 쉼표, 마침표, 괄호, 와일드카드 제거 */
function sanitizeKeyword(kw: string): string {
  return kw.replace(/[^a-zA-Z0-9\uAC00-\uD7AF\u3131-\u3163\s\-]/g, "").trim()
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
      `🔍 검색 v2 시작 — ${queries.length}개 아이템 | 성별: ${genderFilter || "전체"} | 노드: ${primaryNode || "없음"}→${secondaryNode || "없음"}${priceFilter ? ` | 가격: ${priceFilter.minPrice || 0}~${priceFilter.maxPrice || "∞"}원` : ""}${styleTolerance !== null ? ` | tolerance=${styleTolerance.toFixed(2)} → top ${targetCount}` : ""}`
    )

    // ─── Brand DNA 조회 (브랜드 성향 부스팅용) ───
    // 스타일 노드/무드 태그가 없으면 매칭 기준이 없으므로 쿼리 스킵
    type BrandDna = { style_node: string; sensitivity_tags: string[] }
    const brandDnaMap = new Map<string, BrandDna>()
    if (primaryNode || secondaryNode || (moodTags && moodTags.length > 0)) {
      const { data: brandNodes } = await supabase
        .from("brand_nodes")
        .select("brand_name_normalized, style_node, sensitivity_tags")
        .limit(500)
      if (brandNodes) {
        for (const bn of brandNodes) {
          brandDnaMap.set(
            (bn.brand_name_normalized as string).toLowerCase(),
            {
              style_node: bn.style_node as string,
              sensitivity_tags: (bn.sensitivity_tags as string[]) ?? [],
            }
          )
        }
        logger.info(`   🧬 Brand DNA 로드: ${brandDnaMap.size}개 브랜드`)
      }
    }

    // 아이템 간 중복 제거용 — 같은 상품이 여러 아이템에서 나오면 먼저 나온 쪽에만 포함
    const globalSeenProducts = new Set<string>()

    const results: { id: string; products: (FormattedProduct & { _rawPrice: number })[] }[] = []

    for (const item of queries) {
      logger.info(`   🔎 [${item.category}] "${item.searchQuery}"`)

      const dbCategories = CATEGORY_ALIASES[item.category] ?? null

      const itemKeywords: string[] = []
      if (item.searchQuery) itemKeywords.push(...item.searchQuery.toLowerCase().split(/\s+/).map(sanitizeKeyword).filter(Boolean))
      if (item.searchQueryKo) itemKeywords.push(...item.searchQueryKo.split(/\s+/).map(sanitizeKeyword).filter(Boolean))

      const products = await searchByEnums(item, genderFilter, dbCategories, primaryNode, secondaryNode, moodTags, priceFilter, itemKeywords, brandDnaMap)

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
  brandDnaMap: Map<string, { style_node: string; sensitivity_tags: string[] }>,
): Promise<(FormattedProduct & { _rawPrice: number })[]> {
  // ─── 경로 1: AI analysis 기반 검색 ───
  // subcategory + 유사 subcategory를 DB 단계에서 필터 (limit 200 내 누락 방지)
  const targetSubcategories: string[] = []
  if (item.subcategory) {
    targetSubcategories.push(item.subcategory)
    const similars = SIMILAR_SUBCATEGORIES[item.subcategory] ?? []
    targetSubcategories.push(...similars)
  }

  const hasPriceFilter = priceFilter && (priceFilter.minPrice !== undefined || priceFilter.maxPrice !== undefined)

  let query = supabase
    .from("product_ai_analysis")
    .select(`
      category, subcategory, fit, fabric, color_family, style_node, mood_tags,
      keywords_ko, keywords_en, season, pattern,
      products!inner (
        id, brand, name, price, image_url, product_url, platform, gender, in_stock,
        description, material, review_count
      )
    `)
    .eq("version", ACTIVE_VERSION)
    .eq("products.in_stock", true)
    .limit(200)

  // 가격 필터: priceFilter가 있으면 null price 제외 + 엄격 범위 적용
  if (hasPriceFilter) {
    query = query.not("products.price", "is", null)
    const effectiveMin = Math.max(priceFilter.minPrice ?? MIN_VALID_PRICE, MIN_VALID_PRICE)
    query = query.gte("products.price", effectiveMin)
    if (priceFilter.maxPrice !== undefined) {
      query = query.lte("products.price", priceFilter.maxPrice)
    }
  } else {
    query = query.or(`price.is.null,price.gte.${MIN_VALID_PRICE}`, { referencedTable: "products" })
  }

  if (dbCategories && dbCategories.length > 0) {
    query = query.in("category", dbCategories)
  }

  if (targetSubcategories.length > 0) {
    query = query.in("subcategory", targetSubcategories)
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
          id, brand, name, price, image_url, product_url, platform, gender, in_stock,
          description, material, review_count
        )
      `)
      .eq("version", ACTIVE_VERSION)
      .eq("products.in_stock", true)
      .or(nameFilters, { referencedTable: "products" })
      .limit(50)

    // 가격 필터: priceFilter가 있으면 null price 제외 + 엄격 범위 적용
    if (hasPriceFilter) {
      nameQuery = nameQuery.not("products.price", "is", null)
      const effectiveMin = Math.max(priceFilter!.minPrice ?? MIN_VALID_PRICE, MIN_VALID_PRICE)
      nameQuery = nameQuery.gte("products.price", effectiveMin)
      if (priceFilter!.maxPrice !== undefined) {
        nameQuery = nameQuery.lte("products.price", priceFilter!.maxPrice)
      }
    } else {
      nameQuery = nameQuery.or(`price.is.null,price.gte.${MIN_VALID_PRICE}`, { referencedTable: "products" })
    }

    if (dbCategories && dbCategories.length > 0) {
      nameQuery = nameQuery.in("category", dbCategories)
    }

    const { data: nd, error: ne } = await nameQuery
    if (!ne && nd) {
      nameData = nd
      logger.info(`   📝 상품명 검색: ${nd.length}개 (키워드: ${nameKeywords.join(", ")})`)
    }
  }

  // ─── 경로 3: products 직접 검색 (AI 분석 없는 상품 포함) ───
  type DirectProduct = {
    id: string; brand: string; name: string; price: number | null;
    image_url: string | null; product_url: string; platform: string;
    gender: string | null; in_stock: boolean;
    description: string | null; material: string | null;
    review_count: number | null;
  }
  let directProducts: DirectProduct[] = []

  const directKeywords = [
    ...(item.searchQueryKo ? [item.searchQueryKo] : []),
    ...(item.searchQuery ? [item.searchQuery] : []),
    ...(item.subcategory ? (SUBCATEGORY_NAME_KEYWORDS[item.subcategory] ?? []) : []),
  ].filter(Boolean).slice(0, 5).map(sanitizeKeyword).filter(Boolean)

  if (directKeywords.length > 0) {
    // name, description, material 모두에서 키워드 검색
    const directFilters = directKeywords.flatMap((kw) => [
      `name.ilike.%${kw}%`,
      `description.ilike.%${kw}%`,
      `material.ilike.%${kw}%`,
    ]).join(",")
    let directQuery = supabase
      .from("products")
      .select("id, brand, name, price, image_url, product_url, platform, gender, in_stock, description, material, review_count")
      .eq("in_stock", true)
      .or(directFilters)
      .limit(100)

    if (hasPriceFilter) {
      directQuery = directQuery.not("price", "is", null)
      const effectiveMin = Math.max(priceFilter!.minPrice ?? MIN_VALID_PRICE, MIN_VALID_PRICE)
      directQuery = directQuery.gte("price", effectiveMin)
      if (priceFilter!.maxPrice !== undefined) {
        directQuery = directQuery.lte("price", priceFilter!.maxPrice)
      }
    } else {
      directQuery = directQuery.or(`price.is.null,price.gte.${MIN_VALID_PRICE}`)
    }

    if (genderFilter) {
      directQuery = directQuery.contains("gender", [genderFilter])
    }

    const { data: dp, error: de } = await directQuery
    if (!de && dp) {
      directProducts = dp as DirectProduct[]
      logger.info(`   🔍 직접 검색: ${dp.length}개 (키워드: ${directKeywords.join(", ")})`)
    }
  }

  // ─── 병합: AI 결과 + 상품명 결과 + 직접 검색 (중복 제거) ───
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
  // 직접 검색 결과 — AI 분석 없이 빈 row로 병합
  for (const dp of directProducts) {
    if (!seenIds.has(dp.id)) {
      seenIds.add(dp.id)
      merged.push({
        category: null as unknown as string,
        subcategory: null as unknown as string,
        fit: null, fabric: null, color_family: null, style_node: null,
        mood_tags: null, keywords_ko: null, keywords_en: null,
        season: null, pattern: null,
        products: dp as unknown,
      } as typeof merged[0])
    }
  }

  if (!merged.length) return []

  type RawProduct = {
    id: string; brand: string; name: string; price: number | null;
    image_url: string | null; product_url: string; platform: string;
    gender: string | null; in_stock: boolean;
    description: string | null; material: string | null;
    review_count: number | null;
  }

  const scored = merged
    .map((row) => {
      const productRaw = row.products
      const p: RawProduct = (Array.isArray(productRaw) ? productRaw[0] : productRaw) as unknown as RawProduct
      if (!p) return null

      // 가격 hard filter — priceFilter가 있으면 범위 밖 상품 무조건 제외
      if (hasPriceFilter) {
        if (p.price === null) return null
        const effectiveMin = Math.max(priceFilter!.minPrice ?? MIN_VALID_PRICE, MIN_VALID_PRICE)
        if (p.price < effectiveMin) return null
        if (priceFilter!.maxPrice !== undefined && p.price > priceFilter!.maxPrice) return null
      }

      // 비정상 가격 필터
      if (p.price !== null && p.price < MIN_VALID_PRICE) return null

      // ── lockedAttributes hard filter (Q&A 에이전트) ──
      // 유저가 락한 속성은 반드시 일치해야 함. 미일치/미상이면 즉시 제외.
      // 의도적 부작용: AI 분석 없이 "직접 검색"으로 병합된 상품(row의 모든 enum 컬럼이 null)은
      // lock 속성 일치 여부를 검증할 수 없으므로 lock이 1개라도 있으면 전량 탈락한다.
      // 이는 안전 우선 설계 — "잠금 속성을 검증할 수 없는 상품은 보이지 않는 게 낫다".
      if (
        item.lockedAttributes &&
        !passesLockedFilter(row as unknown as Record<string, unknown>, item.lockedAttributes)
      ) {
        return null
      }

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
      if (item.pattern && row.pattern) {
        if (row.pattern === item.pattern) {
          patternScore = WEIGHTS.pattern
        }
      }

      // ── 스타일 노드 (gradient scoring) ──
      const primarySim = getStyleSimilarity(primaryNode, row.style_node)
      const secondarySim = getStyleSimilarity(secondaryNode, row.style_node)
      const styleNodeScore = Math.max(
        WEIGHTS.stylePrimary * primarySim,
        WEIGHTS.styleSecondary * secondarySim,
      )

      // ── 무드 태그 ──
      const rowMoodTags = Array.isArray(row.mood_tags) ? (row.mood_tags as string[]) : []
      const requestMoodTags = moodTags ?? []
      const overlapCount = rowMoodTags.filter((t) => requestMoodTags.includes(t)).length
      const moodScore = Math.min(overlapCount, WEIGHTS.moodTagMax) * WEIGHTS.moodTagEach

      // ── 브랜드 DNA 부스팅 ──
      let brandDnaScore = 0
      if (p.brand && brandDnaMap.size > 0) {
        const brandKey = p.brand.toLowerCase()
        const dna = brandDnaMap.get(brandKey)
        if (dna) {
          // 브랜드 스타일 노드와 유저 스타일 유사도
          const brandStyleSim = Math.max(
            getStyleSimilarity(primaryNode, dna.style_node),
            getStyleSimilarity(secondaryNode, dna.style_node) * 0.5,
          )
          // 브랜드 감도 태그와 유저 무드 태그 겹침
          const tagOverlap = requestMoodTags.length > 0
            ? dna.sensitivity_tags.filter((t) => requestMoodTags.includes(t)).length / Math.max(requestMoodTags.length, 1)
            : 0
          // 스타일 60% + 태그 40% 가중 합산
          brandDnaScore = WEIGHTS.brandDna * (brandStyleSim * 0.6 + tagOverlap * 0.4)
        }
      }

      const totalScore =
        subcategoryScore + nameMatchScore + keywordsScore +
        fitScore + fabricScore + colorFamilyScore + colorAdjacentScore +
        styleNodeScore + moodScore + seasonScore + patternScore + brandDnaScore

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
        brandDna: brandDnaScore,
        totalScore,
      }

      // ── matchReasons 생성 ──
      const matchReasons: MatchReason[] = []
      if (colorFamilyScore > 0 && item.colorFamily) {
        matchReasons.push({ field: "colorFamily", value: item.colorFamily })
      } else if (colorAdjacentScore > 0 && row.color_family) {
        matchReasons.push({ field: "colorFamily", value: row.color_family })
      }
      if (fitScore > 0 && item.fit) {
        matchReasons.push({ field: "fit", value: item.fit })
      }
      if (fabricScore > 0 && item.fabric) {
        matchReasons.push({ field: "fabric", value: item.fabric })
      }
      if (seasonScore > 0 && row.season) {
        matchReasons.push({ field: "season", value: row.season })
      }
      if (patternScore > 0 && row.pattern && row.pattern !== "solid") {
        matchReasons.push({ field: "pattern", value: row.pattern })
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
        matchReasons,
        brand: p.brand,
        price: p.price ? `₩${p.price.toLocaleString()}` : "",
        platform: p.platform,
        imageUrl: p.image_url || "",
        link: p.product_url,
        title: `${p.brand} ${p.name}`,
        description: p.description || undefined,
        material: p.material || undefined,
        reviewCount: p.review_count ?? undefined,
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
