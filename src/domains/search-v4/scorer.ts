// @MX:ANCHOR: [AUTO] v4 per-row additive scoring — extracted verbatim from search-products/route.ts lines ~591-799 (SPEC-ARCH-APP-001 REQ-APP-004)
// @MX:REASON: Frozen byte-identical by src/__characterization__/arch-app-001/v4-scoring.test.ts referenceScore; any arithmetic drift breaks the v4 contract.
// @MX:SPEC: SPEC-ARCH-APP-001
import {SIMILAR_SUBCATEGORIES} from "@/shared/enums/subcategory-similar"
import {isAdjacentColor} from "@/shared/enums/color-adjacency"
import {SUBCATEGORY_DEFAULT_SEASON} from "@/shared/enums/season-pattern"
import {getStyleSimilarity} from "@/shared/enums/style-adjacency"
import {passesLockedFilter} from "@/shared/utils/locked-filter"
import {WEIGHTS, MIN_VALID_PRICE, SUBCATEGORY_NAME_KEYWORDS} from "./constants"
import type {
  SearchQuery,
  ScoreBreakdown,
  MatchReason,
  ScoredProduct,
  BrandDna,
} from "./types"

type RawProduct = {
  id: string; brand: string; name: string; price: number | null;
  image_url: string | null; product_url: string; platform: string;
  gender: string | null; in_stock: boolean;
  description: string | null; material: string | null;
  review_count: number | null;
}

// A merged candidate row (PAI join row or AI-less direct-search row).
export type MergedRow = {
  category: string | null
  subcategory: string | null
  fit: string | null
  fabric: string | null
  color_family: string | null
  style_node: string | null
  mood_tags: unknown
  keywords_ko: unknown
  keywords_en: unknown
  season: string | null
  pattern: string | null
  products: unknown
}

/**
 * Score a single merged row. Returns null when the row is filtered out
 * (price hard filter, locked-attributes hard filter, missing product).
 * Verbatim port of the route.ts `.map((row) => { ... })` body.
 */
export function scoreRow(
  row: MergedRow,
  item: SearchQuery,
  genderFilter: string | null,
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
  moodTags: string[] | undefined,
  priceFilter: { minPrice?: number; maxPrice?: number } | undefined,
  itemKeywords: string[],
  brandDnaMap: Map<string, BrandDna>,
): ScoredProduct | null {
  const hasPriceFilter = priceFilter && (priceFilter.minPrice !== undefined || priceFilter.maxPrice !== undefined)

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
}

/**
 * Post-map filter — verbatim port of the route.ts `.filter(...)` predicate.
 * Drops null / non-positive-score / non-subcategory-match rows.
 */
export function passesScoreFilter(
  p: ScoredProduct | null,
  item: SearchQuery,
): p is ScoredProduct {
  if (!p || p._score <= 0) return false

  // subcategory 정확/유사 매칭 또는 상품명 매칭 중 하나는 필수
  if (item.subcategory
    && p._scoring?.subcategory === 0
    && p._scoring?.subcategorySimilar === 0
    && p._scoring?.nameMatch === 0) return false

  return true
}
