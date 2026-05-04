import { describe, expect, it } from "vitest"
import { computeNdcg } from "./ndcg"

describe("computeNdcg", () => {
  it("빈 입력 → 0", () => {
    expect(computeNdcg([])).toBe(0)
    expect(computeNdcg([], 5)).toBe(0)
  })

  it("모든 grade=0 → 0 (관련성 없음, IDCG=0)", () => {
    expect(computeNdcg([0, 0, 0, 0])).toBe(0)
  })

  it("perfect ranking [3,3,2,1] → 1.0", () => {
    expect(computeNdcg([3, 3, 2, 1], 10)).toBeCloseTo(1.0, 9)
  })

  it("reverse-perfect ranking [1,2,3,3] → < 1.0 (perfect 보다 낮음)", () => {
    const score = computeNdcg([1, 2, 3, 3], 10)
    expect(score).toBeLessThan(1.0)
    expect(score).toBeGreaterThan(0)
  })

  it("단일 관련 아이템 최상단 [3] → 1.0", () => {
    expect(computeNdcg([3], 10)).toBeCloseTo(1.0, 9)
  })

  it("k=3, [0,0,3] → 0.5 (canonical NDCG 공식)", () => {
    // DCG = 0 + 0 + 7/log2(4) = 7/2 = 3.5
    // IDCG (sorted desc [3,0,0]) = 7/log2(2) + 0 + 0 = 7
    // NDCG = 3.5/7 = 0.5
    expect(computeNdcg([0, 0, 3], 3)).toBeCloseTo(0.5, 9)
  })

  it("k 가 length 보다 작을 때 → 첫 k 만 고려", () => {
    const k2 = computeNdcg([3, 0, 0, 3, 3], 2)
    const k5 = computeNdcg([3, 0, 0, 3, 3], 5)
    expect(k2).not.toBeCloseTo(k5, 6)
  })

  it("k 가 length 보다 클 때 → 전체 리스트 고려, 결과는 동일", () => {
    const longK = computeNdcg([3, 2], 10)
    const exactK = computeNdcg([3, 2], 2)
    expect(longK).toBeCloseTo(exactK, 9)
  })

  it("k 인자 생략 시 default = 10", () => {
    const explicit = computeNdcg([3, 2, 1, 0, 0, 0, 0, 0, 0, 0], 10)
    const implicit = computeNdcg([3, 2, 1, 0, 0, 0, 0, 0, 0, 0])
    expect(implicit).toBeCloseTo(explicit, 9)
  })

  it("invalid grade (4) → throw", () => {
    expect(() => computeNdcg([3, 4, 2])).toThrow(/0\.\.3/)
  })

  it("invalid grade (-1) → throw", () => {
    expect(() => computeNdcg([0, -1, 2])).toThrow(/0\.\.3/)
  })

  it("invalid grade (1.5 non-integer) → throw", () => {
    expect(() => computeNdcg([1.5, 2])).toThrow(/0\.\.3/)
  })

  it("negative k → throw", () => {
    expect(() => computeNdcg([3, 2], -1)).toThrow(/k must be/i)
  })

  it("k=0 → throw", () => {
    expect(() => computeNdcg([3, 2], 0)).toThrow(/k must be/i)
  })

  it("SPEC REQ-003 acceptance 1: top-10 모두 grade=3 → 1.0", () => {
    expect(computeNdcg([3, 3, 3, 3, 3, 3, 3, 3, 3, 3], 10)).toBeCloseTo(1.0, 9)
  })

  it("SPEC REQ-003 acceptance 1: top-10 모두 grade=0 → 0", () => {
    expect(computeNdcg([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 10)).toBe(0)
  })
})
