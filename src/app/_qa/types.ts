export type AgentStep = "input" | "confirm" | "hold" | "conditions" | "results" | "feedback"

export type LockableAttr =
  | "subcategory"
  | "colorFamily"
  | "fit"
  | "fabric"
  | "season"
  | "pattern"

export const LOCKABLE_ATTRS: LockableAttr[] = [
  "subcategory",
  "colorFamily",
  "fit",
  "fabric",
  "season",
  "pattern",
]

export const ATTR_LABELS: Record<LockableAttr, string> = {
  subcategory: "Type",
  colorFamily: "Color",
  fit: "Fit",
  fabric: "Fabric",
  season: "Season",
  pattern: "Pattern",
}

/** 유저에게 보이는 친절한 한국어 라벨 */
export const ATTR_LABELS_KO: Record<LockableAttr, string> = {
  subcategory: "카테고리",
  colorFamily: "색감",
  fit: "핏",
  fabric: "소재",
  season: "시즌",
  pattern: "패턴",
}

export interface AnalyzedItem {
  id: string
  category: string
  subcategory?: string
  name: string
  detail?: string
  fabric?: string
  color?: string
  fit?: string
  colorFamily?: string
  searchQuery: string
  searchQueryKo?: string
  season?: string
  pattern?: string
  position?: { top: number; left: number }
}

export interface AgentProduct {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title?: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: { field: string; value: string }[]
}

export type RefineReason = "price" | "size" | "variety" | "brand"

/** 유사도 3단계 */
export type SimilarityLevel = "tight" | "medium" | "loose"

export const SIMILARITY_OPTIONS: { value: SimilarityLevel; label: string; tolerance: number }[] = [
  { value: "tight", label: "거의 똑같은 느낌만", tolerance: 0.0 },
  { value: "medium", label: "비슷한 분위기면 OK", tolerance: 0.5 },
  { value: "loose", label: "좀 다른 스타일도 보고 싶어요", tolerance: 1.0 },
]

export interface AgentState {
  step: AgentStep
  // Step 1 — Reference
  analysisId: string | null
  imageUrl: string
  promptText: string
  gender: "male" | "female"
  items: AnalyzedItem[]
  styleNode: { primary: string; secondary?: string } | null
  moodTags: string[]
  // Step 2 — Confirm
  selectedItemId: string | null
  editedItem: Partial<AnalyzedItem> | null  // 유저가 수정한 속성
  // Step 3 — Hold
  lockedAttrs: LockableAttr[]
  // Step 4 — Conditions
  similarityLevel: SimilarityLevel
  styleTolerance: number
  priceMin: number | null
  priceMax: number | null
  refineReason: RefineReason | null
  // Step 5 — Results
  products: AgentProduct[]
  searching: boolean
  searchError: string | null
  analyzeProgress: number
  analyzeLabel: string
  // Step 6 — Feedback
  feedbackSubmitted: boolean
}

export const INITIAL_AGENT_STATE: AgentState = {
  step: "input",
  analysisId: null,
  imageUrl: "",
  promptText: "",
  gender: "male",
  items: [],
  styleNode: null,
  moodTags: [],
  selectedItemId: null,
  editedItem: null,
  lockedAttrs: [],
  similarityLevel: "medium",
  styleTolerance: 0.5,
  priceMin: null,
  priceMax: null,
  refineReason: null,
  products: [],
  searching: false,
  searchError: null,
  analyzeProgress: 0,
  analyzeLabel: "",
  feedbackSubmitted: false,
}

export const MAX_LOCKED_ATTRS = 3
