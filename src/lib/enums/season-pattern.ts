/**
 * 시즌 & 패턴 enum 정의
 *
 * product_ai_analysis에 추가될 새 필드.
 * AI 분석 프롬프트 + 검색엔진에서 사용.
 */

// ─── Season ─────────────────────────────────────────────

export const SEASONS = [
  "spring", "summer", "fall", "winter", "all-season",
] as const
export type Season = (typeof SEASONS)[number]

export function isValidSeason(v: string): v is Season {
  return (SEASONS as readonly string[]).includes(v)
}

/** subcategory → 기본 시즌 매핑 (AI가 판단 못할 때 폴백) */
export const SUBCATEGORY_DEFAULT_SEASON: Record<string, Season> = {
  // Summer items
  "sandals": "summer",
  "slides": "summer",
  "tank-top": "summer",
  "crop-top": "summer",
  "shorts": "summer",

  // Winter items
  "down-jacket": "winter",
  "parka": "winter",
  "shearling": "winter",
  "fleece": "winter",
  "overcoat": "fall",
  "trench-coat": "spring",

  // All-season
  "t-shirt": "all-season",
  "jeans": "all-season",
  "sneakers": "all-season",
  "backpack": "all-season",
}

// ─── Pattern ────────────────────────────────────────────

export const PATTERNS = [
  "solid", "stripe", "check", "plaid", "floral",
  "dot", "abstract", "camo", "animal", "graphic",
] as const
export type Pattern = (typeof PATTERNS)[number]

export function isValidPattern(v: string): v is Pattern {
  return (PATTERNS as readonly string[]).includes(v)
}

// ─── Prompt Builder ─────────────────────────────────────

export function buildSeasonPatternReference(): string {
  return `season (pick one):
  ${SEASONS.join(", ")}

pattern (pick one):
  ${PATTERNS.join(", ")}`
}
