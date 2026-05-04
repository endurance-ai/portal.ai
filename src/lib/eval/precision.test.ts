import { describe, expect, it } from "vitest"
import { computePrecisionAtK } from "./precision"

describe("computePrecisionAtK", () => {
  it("빈 입력 → 0", () => {
    expect(computePrecisionAtK([])).toBe(0)
    expect(computePrecisionAtK([], 5, 2)).toBe(0)
  })

  it("첫 k 모두 threshold 이상 → 1.0", () => {
    expect(computePrecisionAtK([3, 3, 2, 2, 3], 5, 2)).toBeCloseTo(1.0, 9)
  })

  it("아무것도 threshold 이상 아님 → 0", () => {
    expect(computePrecisionAtK([0, 1, 1, 0, 1], 5, 2)).toBe(0)
  })

  it("default k=5, threshold=2: [3,2,1,0,0] → 2/5 = 0.4", () => {
    expect(computePrecisionAtK([3, 2, 1, 0, 0])).toBeCloseTo(0.4, 9)
  })

  it("custom k=3, [3,0,2,3,3] → first 3 = [3,0,2], 2 relevant / 3", () => {
    expect(computePrecisionAtK([3, 0, 2, 3, 3], 3, 2)).toBeCloseTo(2 / 3, 9)
  })

  it("custom threshold=3, [3,2,2,2,3] → 2 relevant / 5 = 0.4", () => {
    expect(computePrecisionAtK([3, 2, 2, 2, 3], 5, 3)).toBeCloseTo(0.4, 9)
  })

  it("partial ranking [3,3] with k=5 → 2/5 = 0.4 (denominator stays at k)", () => {
    expect(computePrecisionAtK([3, 3], 5, 2)).toBeCloseTo(0.4, 9)
  })

  it("invalid grade (4) → throw", () => {
    expect(() => computePrecisionAtK([3, 4, 2])).toThrow(/0\.\.3/)
  })

  it("invalid grade (-1) → throw", () => {
    expect(() => computePrecisionAtK([0, -1])).toThrow(/0\.\.3/)
  })

  it("invalid grade (1.5 non-integer) → throw", () => {
    expect(() => computePrecisionAtK([1.5, 2])).toThrow(/0\.\.3/)
  })

  it("k <= 0 → throw", () => {
    expect(() => computePrecisionAtK([3, 2], 0)).toThrow(/k must be/i)
    expect(() => computePrecisionAtK([3, 2], -1)).toThrow(/k must be/i)
  })

  it("non-integer k → throw", () => {
    expect(() => computePrecisionAtK([3, 2], 2.5)).toThrow(/k must be/i)
  })

  it("threshold out of [0,3] → throw", () => {
    expect(() => computePrecisionAtK([3, 2], 5, 4)).toThrow(/threshold/i)
    expect(() => computePrecisionAtK([3, 2], 5, -1)).toThrow(/threshold/i)
  })

  it("non-integer threshold → throw", () => {
    expect(() => computePrecisionAtK([3, 2], 5, 1.5)).toThrow(/threshold/i)
  })

  it("SPEC REQ-003 acceptance 2: [3,2,1,0,2] k=5 threshold=2 → 0.6", () => {
    // 3>=2 (yes), 2>=2 (yes), 1>=2 (no), 0>=2 (no), 2>=2 (yes) → 3/5 = 0.6
    expect(computePrecisionAtK([3, 2, 1, 0, 2], 5, 2)).toBeCloseTo(0.6, 9)
  })
})
