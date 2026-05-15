// @MX:NOTE: [AUTO] v4 engine types — extracted verbatim from search-products/route.ts (SPEC-ARCH-APP-001 REQ-APP-004)
// @MX:SPEC: SPEC-ARCH-APP-001
import type {LockedAttributes} from "@/shared/utils/locked-filter"

export type SearchQuery = {
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

export type SearchRequest = {
  queries: SearchQuery[]
  gender?: string
  styleNode?: { primary: string; secondary?: string }
  moodTags?: string[]
  priceFilter?: { minPrice?: number; maxPrice?: number }
  /** Q&A 에이전트 — 0.0(tight)~1.0(loose). 결과 개수 조절(5~10). */
  styleTolerance?: number
  /** /find — products.brand 하드 필터. 태그 브랜드로 1차 좁힐 때 사용. 최대 20개. */
  brandFilter?: string[]
  _logId?: string
  _includeScoring?: boolean
}

export type ScoreBreakdown = {
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

export type MatchReason = {
  field: string  // "colorFamily" | "fit" | "fabric" | "styleNode" | "season" | "pattern"
  value: string  // "Black", "Oversized", etc.
}

export type FormattedProduct = {
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

export type BrandDna = { style_node: string; sensitivity_tags: string[] }

export type ScoredProduct = FormattedProduct & {
  _score: number
  _rawPrice: number
  _genderPriority: number
  _subTier: number
}
