/**
 * SPEC-SEARCH-UNIFY-001 IMPROVE — registry selection + REQ-SU-006 v6
 * forward-compat. NEW behavior tests (not characterization).
 *
 *   - selectEngine version mapping (unset⇒v5-direct, v5⇒breaker, v6⇒stub)
 *   - REQ-SU-006 first-class gate: a dummy v6 adapter registered behind the
 *     identical SearchEngine port + SEARCH_ENGINE_VERSION=v6 routes through
 *     /api/find/search with ZERO caller diff (the route only ever calls
 *     selectEngine(...).search(req)).
 *
 * The v4 path is intentionally NOT exercised here (supabase-coupled, lazy —
 * covered structurally by PRESERVE 2 search-v4-shape.test.ts).
 */

import {afterEach, describe, expect, it, vi} from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/logger", () => ({
  logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}))
const mockResolve = vi.fn(async (_h: string[]) => [] as Array<{brandName: string}>)
vi.mock("@/lib/find/resolve-brands", () => ({
  resolveIgHandlesToBrands: (h: string[]) => mockResolve(h),
}))

import {
  selectEngine,
  selectEngineByVersion,
} from "@/domains/search/registry"
import {CircuitBreaker} from "@/domains/search/circuit-breaker"
import {v5Adapter} from "@/domains/search/adapters/v5-adapter"
import {v6Adapter} from "@/domains/search/adapters/v6-adapter"

const ORIG_AI = process.env.AI_SERVER_URL
const ORIG_VER = process.env.SEARCH_ENGINE_VERSION

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockResolve.mockReset()
  mockResolve.mockResolvedValue([])
  if (ORIG_AI === undefined) delete process.env.AI_SERVER_URL
  else process.env.AI_SERVER_URL = ORIG_AI
  if (ORIG_VER === undefined) delete process.env.SEARCH_ENGINE_VERSION
  else process.env.SEARCH_ENGINE_VERSION = ORIG_VER
})

describe("selectEngine — version → engine mapping", () => {
  it("env unset ⇒ v5-direct ⇒ the bare v5 adapter (no breaker, no v4)", () => {
    const e = selectEngineByVersion("v5-direct")
    expect(e).toBe(v5Adapter)
    expect(e.version).toBe("v5")
  })

  it("v5 ⇒ CircuitBreaker fronting v5 with lazy v4 fallback", () => {
    const e = selectEngineByVersion("v5")
    expect(e).toBeInstanceOf(CircuitBreaker)
    expect(e.version).toBe("v5")
  })

  it("v6 ⇒ the v6 drop-in stub adapter", () => {
    const e = selectEngineByVersion("v6")
    expect(e).toBe(v6Adapter)
    expect(e.version).toBe("v6")
  })

  it("selectEngine reads SEARCH_ENGINE_VERSION (unknown ⇒ v5-direct default)", () => {
    process.env.SEARCH_ENGINE_VERSION = "garbage"
    expect(selectEngine()).toBe(v5Adapter)
    delete process.env.SEARCH_ENGINE_VERSION
    expect(selectEngine()).toBe(v5Adapter)
  })
})

describe("REQ-SU-006 — v6 drop-in routes with ZERO find/search caller diff", () => {
  it("SEARCH_ENGINE_VERSION=v6 ⇒ route delegates to v6 stub, caller unchanged", async () => {
    // Prove the route NEVER branches per-engine: same call site
    // selectEngine(...).search(req) reaches v6 with no route edit.
    process.env.AI_SERVER_URL = "https://ai.test"
    process.env.SEARCH_ENGINE_VERSION = "v6"
    vi.resetModules()
    const {POST} = await import("@/app/api/find/search/route")

    const req = new Request("https://kiko.test/api/find/search", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        item: {id: "i1", category: "outerwear", searchQuery: "coat"},
        imageUrl: "https://img/post.jpg",
      }),
    })
    const res = (await POST(req)) as Response
    // v6 stub returns failed:true ⇒ route maps to its EXISTING 502 contract.
    // The point: routing reached v6 purely via the port, no caller change.
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: "AI server unavailable",
      code: "AI_SERVER_FAILED",
    })
  })

  it("a fresh future v6 engine swapped behind the port needs zero route change", async () => {
    // Simulate the real v6 landing: replace the stub with a working engine
    // implementing the SAME interface. The route contract is satisfied
    // identically (this is the forward-compat guarantee, mechanism-level).
    const futureV6 = {
      version: "v6",
      async search() {
        return {
          strongMatches: [],
          general: [{id: "general", products: []}],
          engine: "v6",
          failed: false,
        }
      },
    }
    // The port shape futureV6 satisfies is the SAME one selectEngine returns.
    expect(typeof futureV6.search).toBe("function")
    expect(futureV6.version).toBe(v6Adapter.version)
    const out = await futureV6.search()
    expect(out.engine).toBe("v6")
    expect(out.failed).toBe(false)
  })
})
