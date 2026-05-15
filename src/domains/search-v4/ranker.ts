// @MX:ANCHOR: [AUTO] v4 sort comparator + brand/platform diversity cap — extracted verbatim from search-products/route.ts lines ~801-851 (SPEC-ARCH-APP-001 REQ-APP-004)
// @MX:REASON: Frozen byte-identical by src/__characterization__/arch-app-001/v4-scoring.test.ts referenceSortAndCap; precedence/cap drift breaks v4 ordering.
// @MX:SPEC: SPEC-ARCH-APP-001
import {TARGET_RESULTS, MAX_PER_BRAND, MAX_PER_PLATFORM} from "./constants"
import type {SearchQuery, ScoredProduct} from "./types"

/**
 * Sort + brand/platform diversity cap. Verbatim port of the route.ts
 * `scored.sort(...)` + diversity loop.
 */
export function rankAndCap(
  scored: ScoredProduct[],
  item: SearchQuery,
  brandFilter: string[] | null,
): ScoredProduct[] {
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
  // brandFilter가 적용된 검색(/find의 strong match)은 브랜드 다양성 제한을 풀어
  // 태그된 브랜드의 상품이 여러 개 나오도록 허용한다.
  const perBrandCap = brandFilter && brandFilter.length > 0 ? Infinity : MAX_PER_BRAND
  const result: ScoredProduct[] = []
  const brandCount: Record<string, number> = {}
  const platformCount: Record<string, number> = {}

  for (const p of scored) {
    if (result.length >= TARGET_RESULTS) break
    const brand = (p.brand || "unknown").toLowerCase()
    const platform = (p.platform || "unknown").toLowerCase()

    const bCount = brandCount[brand] ?? 0
    if (bCount >= perBrandCap) continue

    const pCount = platformCount[platform] ?? 0
    if (pCount >= MAX_PER_PLATFORM) continue

    brandCount[brand] = bCount + 1
    platformCount[platform] = pCount + 1
    result.push(p)
  }

  return result
}
