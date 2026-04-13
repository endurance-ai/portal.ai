import {
    type AgentProduct,
    type AgentState,
    type AgentStep,
    type AnalyzedItem,
    INITIAL_AGENT_STATE,
    type LockableAttr,
    MAX_LOCKED_ATTRS,
    type RefineReason,
} from "./types"

export type AgentAction =
  | { type: "SET_GENDER"; gender: "male" | "female" }
  | { type: "ANALYZE_START"; imageUrl: string; promptText: string }
  | {
      type: "ANALYZE_SUCCESS"
      analysisId: string
      items: AnalyzedItem[]
      styleNode: { primary: string; secondary?: string } | null
      moodTags: string[]
    }
  | { type: "ANALYZE_ERROR"; error: string }
  | { type: "SELECT_ITEM"; itemId: string }
  | { type: "TOGGLE_LOCK"; attr: LockableAttr }
  | { type: "GO_TO_REFINE" }
  | { type: "SET_TOLERANCE"; value: number }
  | { type: "SET_PRICE"; min: number | null; max: number | null }
  | { type: "SET_REASON"; reason: RefineReason | null }
  | { type: "SEARCH_START" }
  | { type: "SEARCH_SUCCESS"; products: AgentProduct[] }
  | { type: "SEARCH_ERROR"; error: string }
  | { type: "GO_TO_STEP"; step: AgentStep }
  | { type: "RESET" }

export function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "SET_GENDER":
      return { ...state, gender: action.gender }
    case "ANALYZE_START":
      return {
        ...state,
        searching: true,
        searchError: null,
        imageUrl: action.imageUrl,
        promptText: action.promptText,
      }
    case "ANALYZE_SUCCESS": {
      const firstId = action.items[0]?.id ?? null
      return {
        ...state,
        searching: false,
        analysisId: action.analysisId,
        items: action.items,
        styleNode: action.styleNode,
        moodTags: action.moodTags,
        selectedItemId: firstId,
        lockedAttrs: [],
        step: "attributes",
      }
    }
    case "ANALYZE_ERROR":
      return { ...state, searching: false, searchError: action.error }
    case "SELECT_ITEM":
      // 다른 아이템 선택 시 lock 초기화 (속성이 다르므로)
      return { ...state, selectedItemId: action.itemId, lockedAttrs: [] }
    case "TOGGLE_LOCK": {
      const current = state.lockedAttrs
      if (current.includes(action.attr)) {
        return { ...state, lockedAttrs: current.filter((a) => a !== action.attr) }
      }
      if (current.length >= MAX_LOCKED_ATTRS) return state
      return { ...state, lockedAttrs: [...current, action.attr] }
    }
    case "GO_TO_REFINE":
      return { ...state, step: "refine" }
    case "SET_TOLERANCE":
      return { ...state, styleTolerance: Math.min(1, Math.max(0, action.value)) }
    case "SET_PRICE":
      return { ...state, priceMin: action.min, priceMax: action.max }
    case "SET_REASON":
      return { ...state, refineReason: action.reason }
    case "SEARCH_START":
      return { ...state, searching: true, searchError: null, step: "results" }
    case "SEARCH_SUCCESS":
      return { ...state, searching: false, products: action.products }
    case "SEARCH_ERROR":
      return { ...state, searching: false, searchError: action.error }
    case "GO_TO_STEP":
      return { ...state, step: action.step }
    case "RESET":
      return INITIAL_AGENT_STATE
    default:
      return state
  }
}
