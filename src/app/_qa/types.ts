export type AgentStep = "input" | "attributes" | "refine" | "results"

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

export interface AgentState {
  step: AgentStep
  // Step 1
  analysisId: string | null
  imageUrl: string
  promptText: string
  gender: "male" | "female"
  items: AnalyzedItem[]
  styleNode: { primary: string; secondary?: string } | null
  moodTags: string[]
  // Step 2
  selectedItemId: string | null
  lockedAttrs: LockableAttr[]
  // Step 3
  styleTolerance: number   // 0.0 (Tight) ~ 1.0 (Loose)
  priceMin: number | null
  priceMax: number | null
  refineReason: RefineReason | null
  // Step 4
  products: AgentProduct[]
  searching: boolean
  searchError: string | null
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
  lockedAttrs: [],
  styleTolerance: 0.5,
  priceMin: null,
  priceMax: null,
  refineReason: null,
  products: [],
  searching: false,
  searchError: null,
}

export const MAX_LOCKED_ATTRS = 3
