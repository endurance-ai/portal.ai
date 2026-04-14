import {describe, expect, it} from "vitest"
import {LOCKED_FIELD_TO_DB_COLUMN, passesLockedFilter, toleranceToTargetCount,} from "./locked-filter"

describe("passesLockedFilter", () => {
  const baseRow = {
    subcategory: "derby",
    color_family: "black",
    fit: "regular",
    fabric: "leather",
    season: "all-season",
    pattern: "solid",
  }

  it("passes when locked is undefined", () => {
    expect(passesLockedFilter(baseRow, undefined)).toBe(true)
  })

  it("passes when locked is empty object", () => {
    expect(passesLockedFilter(baseRow, {})).toBe(true)
  })

  it("passes when single locked attribute matches", () => {
    expect(passesLockedFilter(baseRow, { subcategory: "derby" })).toBe(true)
  })

  it("rejects when single locked attribute does not match", () => {
    expect(passesLockedFilter(baseRow, { subcategory: "boots" })).toBe(false)
  })

  it("rejects when subcategory matches but colorFamily differs", () => {
    expect(
      passesLockedFilter(baseRow, { subcategory: "derby", colorFamily: "white" }),
    ).toBe(false)
  })

  it("passes when both locked attributes match", () => {
    expect(
      passesLockedFilter(baseRow, { subcategory: "derby", colorFamily: "black" }),
    ).toBe(true)
  })

  it("camelCase key correctly maps to snake_case db column", () => {
    // colorFamily → color_family, fabric → fabric
    expect(passesLockedFilter(baseRow, { colorFamily: "black" })).toBe(true)
    expect(passesLockedFilter(baseRow, { colorFamily: "red" })).toBe(false)
    expect(passesLockedFilter(baseRow, { fabric: "leather" })).toBe(true)
    expect(passesLockedFilter(baseRow, { fabric: "cotton" })).toBe(false)
  })

  it("rejects when row column is null/undefined for locked attribute", () => {
    const sparseRow = { subcategory: "derby" } as Record<string, unknown>
    // colorFamily가 lock인데 row에 없음 → 일치 안 함
    expect(passesLockedFilter(sparseRow, { colorFamily: "black" })).toBe(false)
  })

  it("rejects when row itself is null/undefined", () => {
    expect(passesLockedFilter(null, { subcategory: "derby" })).toBe(false)
    expect(passesLockedFilter(undefined, { subcategory: "derby" })).toBe(false)
  })

  it("ignores undefined values within locked object", () => {
    // Partial<Record> means some keys can be undefined
    expect(
      passesLockedFilter(baseRow, { subcategory: "derby", colorFamily: undefined }),
    ).toBe(true)
  })

  it("LOCKED_FIELD_TO_DB_COLUMN maps all 6 fields", () => {
    expect(LOCKED_FIELD_TO_DB_COLUMN).toEqual({
      subcategory: "subcategory",
      colorFamily: "color_family",
      fit: "fit",
      fabric: "fabric",
      season: "season",
      pattern: "pattern",
    })
  })
})

describe("passesLockedFilter — defensive (corrupt input)", () => {
  // 회귀: 클라이언트가 실수로 이벤트 객체 등 비표준 값을 보내도 죽지 않아야 함
  it("treats non-object locked as no-op", () => {
    // @ts-expect-error — runtime safety check
    expect(passesLockedFilter({ subcategory: "x" }, "garbage")).toBe(true)
  })

  it("treats array locked as no-op (bad shape)", () => {
    // @ts-expect-error — runtime safety check
    expect(passesLockedFilter({ subcategory: "x" }, ["foo"])).toBe(true)
  })
})

describe("toleranceToTargetCount", () => {
  it("returns default when tolerance is null/undefined", () => {
    expect(toleranceToTargetCount(null)).toBe(15)
    expect(toleranceToTargetCount(undefined)).toBe(15)
    expect(toleranceToTargetCount(null, 15)).toBe(15)
  })

  it("uses given default when null", () => {
    expect(toleranceToTargetCount(null, 12)).toBe(12)
  })

  it("returns 10 at tolerance 0 (tight)", () => {
    expect(toleranceToTargetCount(0)).toBe(10)
  })

  it("returns 20 at tolerance 1 (loose)", () => {
    expect(toleranceToTargetCount(1)).toBe(20)
  })

  it("returns 15 at mid tolerance", () => {
    expect(toleranceToTargetCount(0.5)).toBe(15)
  })

  it("clamps tolerance > 1 to 20", () => {
    expect(toleranceToTargetCount(1.5)).toBe(20)
  })

  it("clamps tolerance < 0 to 10", () => {
    expect(toleranceToTargetCount(-0.5)).toBe(10)
  })

  it("returns default for non-finite values", () => {
    expect(toleranceToTargetCount(NaN)).toBe(15)
    expect(toleranceToTargetCount(Infinity)).toBe(15)
  })
})
