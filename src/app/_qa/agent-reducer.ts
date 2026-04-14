import {
    type AgentProduct,
    type AgentState,
    type AgentStep,
    type AnalyzedItem,
    INITIAL_AGENT_STATE,
    type LockableAttr,
    MAX_LOCKED_ATTRS,
    type RefineReason,
    SIMILARITY_OPTIONS,
    type SimilarityLevel,
} from "./types"

export type AgentAction =
  | { type: "SET_GENDER"; gender: "male" | "female" }
  | { type: "ANALYZE_START"; imageUrl: string; promptText: string }
  | { type: "ANALYZE_PROGRESS"; progress: number; label: string }
  | {
      type: "ANALYZE_SUCCESS"
      analysisId: string
      items: AnalyzedItem[]
      styleNode: { primary: string; secondary?: string } | null
      moodTags: string[]
    }
  | { type: "ANALYZE_ERROR"; error: string }
  // Step 2 — Confirm
  | { type: "SELECT_ITEM"; itemId: string }
  | { type: "EDIT_ITEM_ATTR"; key: string; value: string }
  | { type: "CONFIRM_ITEM" }
  // Step 3 — Hold
  | { type: "TOGGLE_LOCK"; attr: LockableAttr }
  // Step 4 — Conditions
  | { type: "SET_SIMILARITY"; level: SimilarityLevel }
  | { type: "SET_PRICE"; min: number | null; max: number | null }
  | { type: "SET_REASON"; reason: RefineReason | null }
  // Step 5 — Results
  | { type: "SEARCH_START" }
  | { type: "SEARCH_SUCCESS"; products: AgentProduct[] }
  | { type: "SEARCH_ERROR"; error: string }
  // Step 6 — Feedback
  | { type: "FEEDBACK_SUBMITTED" }
  // Navigation
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
        analyzeProgress: 5,
        analyzeLabel: "",
      }

    case "ANALYZE_PROGRESS":
      return { ...state, analyzeProgress: action.progress, analyzeLabel: action.label }

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
        editedItem: null,
        lockedAttrs: [],
        analyzeProgress: 100,
        analyzeLabel: "Done.",
        step: "confirm",
      }
    }

    case "ANALYZE_ERROR":
      return {
        ...state,
        searching: false,
        searchError: action.error,
        analyzeProgress: 0,
        analyzeLabel: "",
      }

    // Step 2 — Confirm
    case "SELECT_ITEM":
      return { ...state, selectedItemId: action.itemId, editedItem: null, lockedAttrs: [] }

    case "EDIT_ITEM_ATTR": {
      const prev = state.editedItem ?? {}
      return { ...state, editedItem: { ...prev, [action.key]: action.value } }
    }

    case "CONFIRM_ITEM": {
      // 수정사항을 items 배열에 반영
      if (state.editedItem && state.selectedItemId) {
        const updatedItems = state.items.map((item) =>
          item.id === state.selectedItemId
            ? { ...item, ...state.editedItem }
            : item,
        )
        return { ...state, items: updatedItems, editedItem: null, step: "hold" }
      }
      return { ...state, editedItem: null, step: "hold" }
    }

    // Step 3 — Hold
    case "TOGGLE_LOCK": {
      const current = state.lockedAttrs
      if (current.includes(action.attr)) {
        return { ...state, lockedAttrs: current.filter((a) => a !== action.attr) }
      }
      if (current.length >= MAX_LOCKED_ATTRS) return state
      return { ...state, lockedAttrs: [...current, action.attr] }
    }

    // Step 4 — Conditions
    case "SET_SIMILARITY": {
      const opt = SIMILARITY_OPTIONS.find((o) => o.value === action.level)
      return {
        ...state,
        similarityLevel: action.level,
        styleTolerance: opt?.tolerance ?? 0.5,
      }
    }

    case "SET_PRICE":
      return { ...state, priceMin: action.min, priceMax: action.max }

    case "SET_REASON":
      return { ...state, refineReason: action.reason }

    // Step 5 — Results
    case "SEARCH_START":
      return { ...state, searching: true, searchError: null, step: "results" }

    case "SEARCH_SUCCESS":
      return { ...state, searching: false, products: action.products }

    case "SEARCH_ERROR":
      return { ...state, searching: false, searchError: action.error }

    // Step 6 — Feedback
    case "FEEDBACK_SUBMITTED":
      return { ...state, feedbackSubmitted: true }

    // Navigation
    case "GO_TO_STEP":
      return { ...state, step: action.step }

    case "RESET":
      return INITIAL_AGENT_STATE

    default:
      return state
  }
}
