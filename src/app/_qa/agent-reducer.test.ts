import {describe, expect, it} from "vitest"
import {agentReducer} from "./agent-reducer"
import {type AnalyzedItem, INITIAL_AGENT_STATE, MAX_LOCKED_ATTRS} from "./types"

const sampleItem: AnalyzedItem = {
  id: "item-1",
  category: "Shoes",
  subcategory: "derby",
  name: "Black derby shoes",
  searchQuery: "black derby leather",
  colorFamily: "black",
  fit: "regular",
  fabric: "leather",
  season: "all-season",
  pattern: "solid",
}

const sampleItem2: AnalyzedItem = { ...sampleItem, id: "item-2", name: "Brown derby" }

describe("agentReducer", () => {
  describe("SET_GENDER", () => {
    it("changes gender", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, { type: "SET_GENDER", gender: "female" })
      expect(next.gender).toBe("female")
      expect(next.step).toBe("input")
    })
  })

  describe("ANALYZE_START", () => {
    it("sets searching=true and stores image/prompt", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, {
        type: "ANALYZE_START",
        imageUrl: "blob:test",
        promptText: "hi",
      })
      expect(next.searching).toBe(true)
      expect(next.imageUrl).toBe("blob:test")
      expect(next.promptText).toBe("hi")
      expect(next.searchError).toBe(null)
    })

    it("clears previous error", () => {
      const errorState = { ...INITIAL_AGENT_STATE, searchError: "old" }
      const next = agentReducer(errorState, {
        type: "ANALYZE_START",
        imageUrl: "",
        promptText: "",
      })
      expect(next.searchError).toBe(null)
    })
  })

  describe("ANALYZE_SUCCESS", () => {
    it("transitions to confirm step + selects first item", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, {
        type: "ANALYZE_SUCCESS",
        analysisId: "abc-123",
        items: [sampleItem, sampleItem2],
        styleNode: { primary: "F", secondary: "G" },
        moodTags: ["minimal"],
      })
      expect(next.step).toBe("confirm")
      expect(next.selectedItemId).toBe("item-1")
      expect(next.lockedAttrs).toEqual([])
      expect(next.analysisId).toBe("abc-123")
      expect(next.searching).toBe(false)
      expect(next.styleNode?.primary).toBe("F")
      expect(next.moodTags).toEqual(["minimal"])
    })

    it("handles empty items array (selectedItemId becomes null)", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, {
        type: "ANALYZE_SUCCESS",
        analysisId: "abc",
        items: [],
        styleNode: null,
        moodTags: [],
      })
      expect(next.selectedItemId).toBe(null)
    })
  })

  describe("ANALYZE_ERROR", () => {
    it("sets error, clears searching, and resets step to input", () => {
      const startedState = { ...INITIAL_AGENT_STATE, searching: true, step: "confirm" as const }
      const next = agentReducer(startedState, { type: "ANALYZE_ERROR", error: "boom" })
      expect(next.searching).toBe(false)
      expect(next.searchError).toBe("boom")
      expect(next.step).toBe("input")
    })
  })

  describe("SELECT_ITEM", () => {
    it("changes selected item AND clears lockedAttrs and editedItem", () => {
      const state = {
        ...INITIAL_AGENT_STATE,
        items: [sampleItem, sampleItem2],
        selectedItemId: "item-1",
        lockedAttrs: ["colorFamily" as const, "fit" as const],
      }
      const next = agentReducer(state, { type: "SELECT_ITEM", itemId: "item-2" })
      expect(next.selectedItemId).toBe("item-2")
      expect(next.lockedAttrs).toEqual([])
      expect(next.editedItem).toBe(null)
    })
  })

  describe("EDIT_ITEM_ATTR", () => {
    it("stores edited attribute", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, {
        type: "EDIT_ITEM_ATTR",
        key: "colorFamily",
        value: "NAVY",
      })
      expect(next.editedItem).toEqual({ colorFamily: "NAVY" })
    })

    it("accumulates edits", () => {
      let state = agentReducer(INITIAL_AGENT_STATE, {
        type: "EDIT_ITEM_ATTR",
        key: "colorFamily",
        value: "NAVY",
      })
      state = agentReducer(state, { type: "EDIT_ITEM_ATTR", key: "fit", value: "slim" })
      expect(state.editedItem).toEqual({ colorFamily: "NAVY", fit: "slim" })
    })
  })

  describe("CONFIRM_ITEM", () => {
    it("merges edits into items and goes to hold", () => {
      const state = {
        ...INITIAL_AGENT_STATE,
        items: [sampleItem],
        selectedItemId: "item-1",
        editedItem: { colorFamily: "NAVY" },
      }
      const next = agentReducer(state, { type: "CONFIRM_ITEM" })
      expect(next.step).toBe("hold")
      expect(next.editedItem).toBe(null)
      expect(next.items[0].colorFamily).toBe("NAVY")
    })

    it("goes to hold even without edits", () => {
      const state = {
        ...INITIAL_AGENT_STATE,
        items: [sampleItem],
        selectedItemId: "item-1",
        editedItem: null,
      }
      const next = agentReducer(state, { type: "CONFIRM_ITEM" })
      expect(next.step).toBe("hold")
    })
  })

  describe("TOGGLE_LOCK", () => {
    it("adds attr when not present", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, {
        type: "TOGGLE_LOCK",
        attr: "colorFamily",
      })
      expect(next.lockedAttrs).toEqual(["colorFamily"])
    })

    it("removes attr when already present", () => {
      const state = { ...INITIAL_AGENT_STATE, lockedAttrs: ["colorFamily" as const] }
      const next = agentReducer(state, { type: "TOGGLE_LOCK", attr: "colorFamily" })
      expect(next.lockedAttrs).toEqual([])
    })

    it("respects MAX_LOCKED_ATTRS limit", () => {
      const lockedAttrs: ("colorFamily" | "fit" | "fabric")[] = ["colorFamily", "fit", "fabric"]
      const state = { ...INITIAL_AGENT_STATE, lockedAttrs }
      const next = agentReducer(state, { type: "TOGGLE_LOCK", attr: "season" })
      expect(next.lockedAttrs).toEqual(lockedAttrs) // 가득 찼으면 추가 안 됨
    })
  })

  describe("SET_SIMILARITY", () => {
    it("sets similarity level and updates tolerance", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, { type: "SET_SIMILARITY", level: "tight" })
      expect(next.similarityLevel).toBe("tight")
      expect(next.styleTolerance).toBe(0.0)
    })

    it("loose maps to tolerance 1.0", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, { type: "SET_SIMILARITY", level: "loose" })
      expect(next.similarityLevel).toBe("loose")
      expect(next.styleTolerance).toBe(1.0)
    })
  })

  describe("SET_PRICE", () => {
    it("stores min and max", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, {
        type: "SET_PRICE",
        min: 50_000,
        max: 200_000,
      })
      expect(next.priceMin).toBe(50_000)
      expect(next.priceMax).toBe(200_000)
    })

    it("accepts null for clearing", () => {
      const state = { ...INITIAL_AGENT_STATE, priceMin: 100, priceMax: 200 }
      const next = agentReducer(state, { type: "SET_PRICE", min: null, max: null })
      expect(next.priceMin).toBe(null)
      expect(next.priceMax).toBe(null)
    })
  })

  describe("SEARCH_START / SEARCH_SUCCESS / SEARCH_ERROR", () => {
    it("SEARCH_START moves to results and sets searching=true", () => {
      const state = { ...INITIAL_AGENT_STATE, step: "conditions" as const, searchError: "old" }
      const next = agentReducer(state, { type: "SEARCH_START" })
      expect(next.step).toBe("results")
      expect(next.searching).toBe(true)
      expect(next.searchError).toBe(null)
    })

    it("SEARCH_SUCCESS stores products and clears searching", () => {
      const state = { ...INITIAL_AGENT_STATE, searching: true }
      const next = agentReducer(state, {
        type: "SEARCH_SUCCESS",
        products: [
          { brand: "B", price: "₩1,000", platform: "P", imageUrl: "", link: "" },
        ],
      })
      expect(next.searching).toBe(false)
      expect(next.products).toHaveLength(1)
    })

    it("SEARCH_ERROR sets error and clears searching", () => {
      const state = { ...INITIAL_AGENT_STATE, searching: true }
      const next = agentReducer(state, { type: "SEARCH_ERROR", error: "bad" })
      expect(next.searching).toBe(false)
      expect(next.searchError).toBe("bad")
    })
  })

  describe("FEEDBACK_SUBMITTED", () => {
    it("sets feedbackSubmitted to true", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, { type: "FEEDBACK_SUBMITTED" })
      expect(next.feedbackSubmitted).toBe(true)
    })
  })

  describe("RESET", () => {
    it("returns INITIAL_AGENT_STATE", () => {
      const dirtyState = {
        ...INITIAL_AGENT_STATE,
        step: "results" as const,
        items: [sampleItem],
        lockedAttrs: ["colorFamily" as const],
        products: [{ brand: "x", price: "", platform: "", imageUrl: "", link: "" }],
      }
      const next = agentReducer(dirtyState, { type: "RESET" })
      expect(next).toEqual(INITIAL_AGENT_STATE)
    })
  })

  describe("end-to-end flow", () => {
    it("simulates full 6-step happy path", () => {
      let state = INITIAL_AGENT_STATE

      // 1. Start analyze
      state = agentReducer(state, { type: "ANALYZE_START", imageUrl: "blob:1", promptText: "" })
      expect(state.step).toBe("input")
      expect(state.searching).toBe(true)

      // 2. Analyze success → confirm
      state = agentReducer(state, {
        type: "ANALYZE_SUCCESS",
        analysisId: "a1",
        items: [sampleItem],
        styleNode: { primary: "F" },
        moodTags: [],
      })
      expect(state.step).toBe("confirm")

      // 3. Edit + confirm → hold
      state = agentReducer(state, { type: "EDIT_ITEM_ATTR", key: "colorFamily", value: "NAVY" })
      state = agentReducer(state, { type: "CONFIRM_ITEM" })
      expect(state.step).toBe("hold")
      expect(state.items[0].colorFamily).toBe("NAVY")

      // 4. Lock attributes
      state = agentReducer(state, { type: "TOGGLE_LOCK", attr: "subcategory" })
      state = agentReducer(state, { type: "TOGGLE_LOCK", attr: "colorFamily" })
      expect(state.lockedAttrs).toEqual(["subcategory", "colorFamily"])

      // 5. Set conditions
      state = agentReducer(state, { type: "GO_TO_STEP", step: "conditions" })
      state = agentReducer(state, { type: "SET_SIMILARITY", level: "tight" })
      state = agentReducer(state, { type: "SET_PRICE", min: null, max: 200_000 })
      expect(state.styleTolerance).toBe(0.0)

      // 6. Search
      state = agentReducer(state, { type: "SEARCH_START" })
      expect(state.step).toBe("results")
      state = agentReducer(state, { type: "SEARCH_SUCCESS", products: [] })
      expect(state.searching).toBe(false)

      // 7. Feedback
      state = agentReducer(state, { type: "GO_TO_STEP", step: "feedback" })
      state = agentReducer(state, { type: "FEEDBACK_SUBMITTED" })
      expect(state.feedbackSubmitted).toBe(true)
    })
  })
})
