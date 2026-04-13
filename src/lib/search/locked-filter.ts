/**
 * Q&A 에이전트(/)의 lockedAttributes hard filter 로직.
 *
 * 검색 결과 가공 시, 유저가 락한 속성이 모두 일치하는 row만 통과시킨다.
 * search-products/route.ts의 인라인 로직과 1:1 동일 (테스트 가능하도록 분리).
 */

export type LockableAttrKey =
  | "subcategory"
  | "colorFamily"
  | "fit"
  | "fabric"
  | "season"
  | "pattern"

export const LOCKED_FIELD_TO_DB_COLUMN: Record<LockableAttrKey, string> = {
  subcategory: "subcategory",
  colorFamily: "color_family",
  fit: "fit",
  fabric: "fabric",
  season: "season",
  pattern: "pattern",
}

export type LockedAttributes = Partial<Record<LockableAttrKey, string>>

/**
 * row(상품의 product_ai_analysis 한 행)가 locked attributes를 모두 만족하는지 검사.
 * - lockedAttributes가 비었거나 undefined면 → true (필터 통과)
 * - locked 속성 중 하나라도 row에 없거나 값이 다르면 → false
 *
 * @param row product_ai_analysis row (snake_case 컬럼)
 * @param locked 유저가 락한 속성 (camelCase 키)
 */
export function passesLockedFilter(
  row: Record<string, unknown> | null | undefined,
  locked: LockedAttributes | undefined,
): boolean {
  if (!locked) return true
  const entries = Object.entries(locked) as [LockableAttrKey, string | undefined][]
  if (entries.length === 0) return true
  if (!row) {
    // row 자체가 없으면 어떤 lock도 검증할 수 없음 → 안전하게 제외
    return false
  }
  for (const [key, lockedValue] of entries) {
    if (!lockedValue) continue
    const dbCol = LOCKED_FIELD_TO_DB_COLUMN[key]
    if (!dbCol) continue
    if (row[dbCol] !== lockedValue) return false
  }
  return true
}

/**
 * styleTolerance(0.0~1.0) → 결과 개수 (5~10)
 * tolerance가 null/undefined면 기본 7개.
 */
export function toleranceToTargetCount(
  tolerance: number | null | undefined,
  defaultCount = 7,
): number {
  if (tolerance === null || tolerance === undefined || !Number.isFinite(tolerance)) {
    return defaultCount
  }
  const clamped = Math.min(1, Math.max(0, tolerance))
  return Math.round(5 + clamped * 5)
}
