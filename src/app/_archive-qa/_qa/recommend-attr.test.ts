import {describe, expect, it} from "vitest"
import {pickUnlockSuggestion, recommendLockedAttr} from "./recommend-attr"
import {type AnalyzedItem} from "./types"

function makeItem(overrides: Partial<AnalyzedItem> = {}): AnalyzedItem {
  return {
    id: "item-1",
    category: "Shoes",
    name: "Test Item",
    searchQuery: "test",
    ...overrides,
  }
}

describe("recommendLockedAttr", () => {
  it("recommends pattern when not solid", () => {
    const item = makeItem({ pattern: "stripes", colorFamily: "white", subcategory: "shirt" })
    expect(recommendLockedAttr(item)).toBe("pattern")
  })

  it("skips pattern when solid", () => {
    const item = makeItem({ pattern: "solid", fabric: "leather", subcategory: "derby" })
    expect(recommendLockedAttr(item)).toBe("fabric")
  })

  it("skips pattern when none/plain (case-insensitive)", () => {
    expect(recommendLockedAttr(makeItem({ pattern: "None", subcategory: "tee" }))).toBe(
      "subcategory",
    )
    expect(recommendLockedAttr(makeItem({ pattern: "PLAIN", subcategory: "tee" }))).toBe(
      "subcategory",
    )
  })

  it("recommends fabric when distinctive (leather/suede/velvet/etc)", () => {
    expect(recommendLockedAttr(makeItem({ fabric: "leather" }))).toBe("fabric")
    expect(recommendLockedAttr(makeItem({ fabric: "suede" }))).toBe("fabric")
    expect(recommendLockedAttr(makeItem({ fabric: "velvet" }))).toBe("fabric")
    expect(recommendLockedAttr(makeItem({ fabric: "shearling" }))).toBe("fabric")
  })

  it("does not recommend fabric when ordinary (cotton/wool/poly)", () => {
    const item = makeItem({ fabric: "cotton", colorFamily: "yellow" })
    expect(recommendLockedAttr(item)).toBe("colorFamily")
  })

  it("recommends rare colorFamily (yellow/purple/red etc)", () => {
    expect(recommendLockedAttr(makeItem({ colorFamily: "yellow" }))).toBe("colorFamily")
    expect(recommendLockedAttr(makeItem({ colorFamily: "purple" }))).toBe("colorFamily")
    expect(recommendLockedAttr(makeItem({ colorFamily: "burgundy" }))).toBe("colorFamily")
  })

  it("does not recommend common colors (black/white/gray/navy/beige/brown)", () => {
    expect(recommendLockedAttr(makeItem({ colorFamily: "black", subcategory: "boots" }))).toBe(
      "subcategory",
    )
    expect(recommendLockedAttr(makeItem({ colorFamily: "white", subcategory: "shirt" }))).toBe(
      "subcategory",
    )
    expect(recommendLockedAttr(makeItem({ colorFamily: "navy", subcategory: "blazer" }))).toBe(
      "subcategory",
    )
  })

  it("falls back to subcategory when nothing distinctive", () => {
    const item = makeItem({
      pattern: "solid",
      fabric: "cotton",
      colorFamily: "black",
      subcategory: "t-shirt",
    })
    expect(recommendLockedAttr(item)).toBe("subcategory")
  })

  it("returns null when no attributes available", () => {
    const item = makeItem({}) // no pattern/fabric/color/subcategory
    expect(recommendLockedAttr(item)).toBe(null)
  })

  it("priority order: pattern > fabric > color > subcategory", () => {
    // 모두 있으면 pattern 우선
    const item = makeItem({
      pattern: "stripes",
      fabric: "leather",
      colorFamily: "yellow",
      subcategory: "shirt",
    })
    expect(recommendLockedAttr(item)).toBe("pattern")
  })
})

describe("pickUnlockSuggestion", () => {
  it("returns null when no locks", () => {
    expect(pickUnlockSuggestion([])).toBe(null)
  })

  it("returns the only lock when single", () => {
    expect(pickUnlockSuggestion(["subcategory"])).toBe("subcategory")
  })

  it("priority: pattern > fabric > season > fit > color > subcategory", () => {
    expect(pickUnlockSuggestion(["subcategory", "pattern"])).toBe("pattern")
    expect(pickUnlockSuggestion(["subcategory", "fabric"])).toBe("fabric")
    expect(pickUnlockSuggestion(["colorFamily", "season"])).toBe("season")
    expect(pickUnlockSuggestion(["subcategory", "fit"])).toBe("fit")
    expect(pickUnlockSuggestion(["subcategory", "colorFamily"])).toBe("colorFamily")
  })

  it("subcategory is unlocked last (most important)", () => {
    expect(pickUnlockSuggestion(["subcategory", "fit"])).toBe("fit")
    expect(pickUnlockSuggestion(["subcategory"])).toBe("subcategory")
  })

  it("pattern wins over everything", () => {
    expect(
      pickUnlockSuggestion(["pattern", "fabric", "season", "fit", "colorFamily", "subcategory"]),
    ).toBe("pattern")
  })
})
