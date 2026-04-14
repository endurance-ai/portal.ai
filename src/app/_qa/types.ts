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

export const SIMILARITY_OPTIONS: { value: SimilarityLevel; tolerance: number }[] = [
  { value: "tight", tolerance: 0.0 },
  { value: "medium", tolerance: 0.5 },
  { value: "loose", tolerance: 1.0 },
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
