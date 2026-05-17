// @MX:NOTE: [AUTO] search-v4 domain barrel (SPEC-ARCH-APP-001 REQ-APP-004)
// @MX:SPEC: SPEC-ARCH-APP-001
export {searchByEnums} from "./engine"
export {fetchCandidates, sanitizeKeyword} from "./query-builder"
export {scoreRow, passesScoreFilter} from "./scorer"
export type {MergedRow} from "./scorer"
export {rankAndCap} from "./ranker"
export {
  TARGET_RESULTS,
  MAX_PER_BRAND,
  MAX_PER_PLATFORM,
  ACTIVE_VERSION,
  MIN_VALID_PRICE,
  WEIGHTS,
  SUBCATEGORY_NAME_KEYWORDS,
  CATEGORY_ALIASES,
} from "./constants"
export type {
  SearchQuery,
  SearchRequest,
  ScoreBreakdown,
  MatchReason,
  FormattedProduct,
  BrandDna,
  ScoredProduct,
} from "./types"
