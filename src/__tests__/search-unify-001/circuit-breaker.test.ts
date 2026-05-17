/**
 * SPEC-SEARCH-UNIFY-001 IMPROVE — circuit-breaker port-level UNIT tests.
 *
 * These are NEW BEHAVIOR tests for the breaker state machine (NOT
 * characterization). They verify REQ-SU-005 transitions + REQ-SU-004 fallback
 * trigger + the CB_ENABLED=false rollback bypass, using fake SearchEngine
 * primaries/fallbacks and an injected clock for determinism.
 */

import {beforeEach, describe, expect, it, vi} from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/logger", () => ({
  logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}))

import {CircuitBreaker} from "@/domains/search/circuit-breaker"
import type {
  RecommendRequest,
  RecommendResponse,
  SearchEngine,
} from "@/domains/search/engine-port"

const REQ: RecommendRequest = {
  item: {id: "i1", category: "outerwear", searchQuery: "coat"},
  imageUrl: "https://img/x.jpg",
  brandFilter: [],
  strongTolerance: 0.5,
  generalTolerance: 0.5,
}

function okResponse(engine: string): RecommendResponse {
  return {
    strongMatches: [],
    general: [{id: "general", products: []}],
    engine,
    failed: false,
  }
}
function failedResponse(engine: string): RecommendResponse {
  return {strongMatches: [], general: [], engine, failed: true}
}

/** A scriptable engine: each call shifts the next outcome off the queue. */
function scriptedEngine(
  version: string,
  outcomes: Array<"ok" | "failed" | "throw">,
): {engine: SearchEngine; calls: () => number} {
  let i = 0
  const engine: SearchEngine = {
    version,
    async search() {
      const o = outcomes[Math.min(i, outcomes.length - 1)]
      i += 1
      if (o === "throw") throw new Error("v5 boom")
      if (o === "failed") return failedResponse(version)
      return okResponse(version)
    },
  }
  return {engine, calls: () => i}
}

const fallback: SearchEngine = {
  version: "v4-degraded",
  async search() {
    return okResponse("v4-degraded")
  },
}

let clock = 0
const now = () => clock

beforeEach(() => {
  clock = 0
})

describe("CircuitBreaker — CB_ENABLED=false rollback bypass", () => {
  it("disabled ⇒ pure v5 pass-through, NO v4 fallback even on v5 failure", async () => {
    const {engine: v5} = scriptedEngine("v5", ["failed"])
    const fbSpy = vi.fn(fallback.search)
    const cb = new CircuitBreaker(
      v5,
      {version: "v4-degraded", search: fbSpy},
      {enabled: false, now},
    )
    const res = await cb.search(REQ)
    // v5 failed result is returned VERBATIM (route maps failed⇒502); no v4.
    expect(res).toEqual(failedResponse("v5"))
    expect(fbSpy).not.toHaveBeenCalled()
    expect(cb.getState()).toBe("closed")
  })
})

describe("CircuitBreaker — closed state", () => {
  it("v5 success ⇒ returns v5 result, stays closed, resets failures", async () => {
    const {engine: v5} = scriptedEngine("v5", ["ok"])
    const cb = new CircuitBreaker(v5, fallback, {failureThreshold: 3, now})
    const res = await cb.search(REQ)
    expect(res.engine).toBe("v5")
    expect(res.failed).toBe(false)
    expect(cb.getState()).toBe("closed")
  })

  it("single v5 failure (below threshold) ⇒ v4 degraded served, still closed", async () => {
    const {engine: v5} = scriptedEngine("v5", ["failed", "ok"])
    const cb = new CircuitBreaker(v5, fallback, {failureThreshold: 3, now})
    const res = await cb.search(REQ)
    expect(res.engine).toBe("v4-degraded")
    expect(cb.getState()).toBe("closed")
  })

  it("v5 THROW counts as failure ⇒ v4 degraded served", async () => {
    const {engine: v5} = scriptedEngine("v5", ["throw"])
    const cb = new CircuitBreaker(v5, fallback, {failureThreshold: 1, now})
    const res = await cb.search(REQ)
    expect(res.engine).toBe("v4-degraded")
    expect(cb.getState()).toBe("open") // threshold 1 ⇒ opens immediately
  })
})

describe("CircuitBreaker — open transition + fast-fail", () => {
  it("consecutive failures reaching threshold ⇒ OPEN, then fast-fail w/o calling v5", async () => {
    const {engine: v5, calls} = scriptedEngine("v5", [
      "failed",
      "failed",
      "failed",
    ])
    const cb = new CircuitBreaker(v5, fallback, {
      failureThreshold: 2,
      cooldownMs: 1000,
      now,
    })
    await cb.search(REQ) // fail 1 (closed)
    expect(cb.getState()).toBe("closed")
    await cb.search(REQ) // fail 2 ⇒ threshold ⇒ OPEN
    expect(cb.getState()).toBe("open")
    const callsAfterOpen = calls()
    const res = await cb.search(REQ) // OPEN ⇒ fast-fail, no v5 call
    expect(res.engine).toBe("v4-degraded")
    expect(calls()).toBe(callsAfterOpen) // v5 NOT called while open
  })
})

describe("CircuitBreaker — half-open probe", () => {
  it("after cooldown ⇒ half-open probe; v5 success ⇒ CLOSE", async () => {
    const {engine: v5} = scriptedEngine("v5", ["failed", "ok"])
    const cb = new CircuitBreaker(v5, fallback, {
      failureThreshold: 1,
      cooldownMs: 1000,
      now,
    })
    await cb.search(REQ) // fail ⇒ OPEN at clock 0
    expect(cb.getState()).toBe("open")
    clock = 1000 // cooldown elapsed
    const res = await cb.search(REQ) // half-open probe, v5 ok ⇒ CLOSE
    expect(res.engine).toBe("v5")
    expect(cb.getState()).toBe("closed")
  })

  it("after cooldown ⇒ half-open probe; v5 still failing ⇒ re-OPEN + v4", async () => {
    const {engine: v5} = scriptedEngine("v5", ["failed", "failed"])
    const cb = new CircuitBreaker(v5, fallback, {
      failureThreshold: 1,
      cooldownMs: 1000,
      now,
    })
    await cb.search(REQ) // OPEN at clock 0
    clock = 1000
    const res = await cb.search(REQ) // half-open probe fails ⇒ re-OPEN
    expect(res.engine).toBe("v4-degraded")
    expect(cb.getState()).toBe("open")
  })

  it("while open and cooldown NOT elapsed ⇒ stays open, fast-fail", async () => {
    const {engine: v5} = scriptedEngine("v5", ["failed", "ok"])
    const cb = new CircuitBreaker(v5, fallback, {
      failureThreshold: 1,
      cooldownMs: 1000,
      now,
    })
    await cb.search(REQ) // OPEN at clock 0
    clock = 500 // cooldown NOT elapsed
    const res = await cb.search(REQ)
    expect(res.engine).toBe("v4-degraded")
    expect(cb.getState()).toBe("open")
  })
})
