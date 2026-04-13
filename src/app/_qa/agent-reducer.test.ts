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
      expect(next.step).toBe("input") // unchanged
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
    it("transitions to attributes step + selects first item", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, {
        type: "ANALYZE_SUCCESS",
        analysisId: "abc-123",
        items: [sampleItem, sampleItem2],
        styleNode: { primary: "F", secondary: "G" },
        moodTags: ["minimal"],
      })
      expect(next.step).toBe("attributes")
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
    it("sets error and clears searching", () => {
      const startedState = { ...INITIAL_AGENT_STATE, searching: true }
      const next = agentReducer(startedState, { type: "ANALYZE_ERROR", error: "boom" })
      expect(next.searching).toBe(false)
      expect(next.searchError).toBe("boom")
      expect(next.step).toBe("input") // unchanged
    })
  })

  describe("SELECT_ITEM", () => {
    it("changes selected item AND clears lockedAttrs (different attributes)", () => {
      const state = {
        ...INITIAL_AGENT_STATE,
        items: [sampleItem, sampleItem2],
        selectedItemId: "item-1",
        lockedAttrs: ["colorFamily" as const, "fit" as const],
      }
      const next = agentReducer(state, { type: "SELECT_ITEM", itemId: "item-2" })
      expect(next.selectedItemId).toBe("item-2")
      expect(next.lockedAttrs).toEqual([])
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
      const lockedAttrs = ["colorFamily", "fit"].slice(0, MAX_LOCKED_ATTRS) as (
        | "colorFamily"
        | "fit"
      )[]
      const state = { ...INITIAL_AGENT_STATE, lockedAttrs }
      const next = agentReducer(state, { type: "TOGGLE_LOCK", attr: "fabric" })
      // 가득 찼으면 추가 안 됨, 그대로
      expect(next.lockedAttrs).toEqual(lockedAttrs)
    })

    it("can still remove existing lock when at limit", () => {
      const state = {
        ...INITIAL_AGENT_STATE,
        lockedAttrs: ["colorFamily", "fit"] as ("colorFamily" | "fit")[],
      }
      const next = agentReducer(state, { type: "TOGGLE_LOCK", attr: "colorFamily" })
      expect(next.lockedAttrs).toEqual(["fit"])
    })
  })

  describe("GO_TO_REFINE / GO_TO_STEP", () => {
    it("GO_TO_REFINE moves to refine step", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, { type: "GO_TO_REFINE" })
      expect(next.step).toBe("refine")
    })

    it("GO_TO_STEP can move to any step", () => {
      const next = agentReducer(INITIAL_AGENT_STATE, { type: "GO_TO_STEP", step: "results" })
      expect(next.step).toBe("results")
    })
  })

  describe("SET_TOLERANCE", () => {
    it("clamps to 0~1 range", () => {
      expect(agentReducer(INITIAL_AGENT_STATE, { type: "SET_TOLERANCE", value: 0.5 }).styleTolerance).toBe(0.5)
      expect(agentReducer(INITIAL_AGENT_STATE, { type: "SET_TOLERANCE", value: 1.5 }).styleTolerance).toBe(1)
      expect(agentReducer(INITIAL_AGENT_STATE, { type: "SET_TOLERANCE", value: -0.3 }).styleTolerance).toBe(0)
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
      const state = { ...INITIAL_AGENT_STATE, step: "refine" as const, searchError: "old" }
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
          {
            brand: "B",
            price: "₩1,000",
            platform: "P",
            imageUrl: "",
            link: "",
          },
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
    it("simulates full happy path: input → attributes → refine → results", () => {
      let state = INITIAL_AGENT_STATE

      // 1. Start analyze
      state = agentReducer(state, { type: "ANALYZE_START", imageUrl: "blob:1", promptText: "" })
      expect(state.step).toBe("input")
      expect(state.searching).toBe(true)

      // 2. Analyze success
      state = agentReducer(state, {
        type: "ANALYZE_SUCCESS",
        analysisId: "a1",
        items: [sampleItem],
        styleNode: { primary: "F" },
        moodTags: [],
      })
      expect(state.step).toBe("attributes")

      // 3. Lock 2 attributes
      state = agentReducer(state, { type: "TOGGLE_LOCK", attr: "subcategory" })
      state = agentReducer(state, { type: "TOGGLE_LOCK", attr: "colorFamily" })
      expect(state.lockedAttrs).toEqual(["subcategory", "colorFamily"])

      // 4. Go to refine
      state = agentReducer(state, { type: "GO_TO_REFINE" })
      expect(state.step).toBe("refine")

      // 5. Adjust tolerance + budget
      state = agentReducer(state, { type: "SET_TOLERANCE", value: 0.7 })
      state = agentReducer(state, { type: "SET_PRICE", min: null, max: 200_000 })

      // 6. Start search
      state = agentReducer(state, { type: "SEARCH_START" })
      expect(state.step).toBe("results")
      expect(state.searching).toBe(true)

      // 7. Receive results
      state = agentReducer(state, { type: "SEARCH_SUCCESS", products: [] })
      expect(state.searching).toBe(false)
    })
  })
})
