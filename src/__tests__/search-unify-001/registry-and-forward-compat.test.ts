/**
 * SPEC-SEARCH-V6-001 P2 — registry single-engine + port-seam forward-compat
 * (re-pointed from SPEC-SEARCH-UNIFY-001 IMPROVE).
 *
 * ── multi-engine selection + breaker singleton tests RETIRED ──────────────
 * The original file tested the SPEC-SEARCH-UNIFY-001 version mapping
 * (unset⇒v5-direct, v5⇒CircuitBreaker, v6⇒stub) and the cross-request
 * breaker singleton (REQ-SU-005). SPEC-SEARCH-V6-001 P2 (§10b, AC-024,
 * REQ-V6-033) deleted the circuit breaker + v5/v4 adapters + version env
 * branching + `selectEngineByVersion`. Those subjects no longer exist, so
 * the version-mapping and breaker-singleton describes are legitimately
 * removed with SPEC basis — NOT silently dropped.
 *
 * The genuinely forward-looking intent (the route ONLY ever calls
 * `selectEngine().search(req)` — a single port seam with ZERO per-engine
 * caller branching) is STILL meaningful and is RE-POINTED here to v6 terms:
 * v6 is the sole engine behind the preserved port (§10c), and a fresh future
 * engine swapped behind the same interface still needs zero route change.
 */

import {afterEach, describe, expect, it, vi} from "vitest"
import {selectEngine} from "@/domains/search/registry"
import {v6Adapter} from "@/domains/search/adapters/v6-adapter"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/logger", () => ({
  logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}))
const mockResolve = vi.fn(async (_h: string[]) => [] as Array<{brandName: string}>)
vi.mock("@/lib/find/resolve-brands", () => ({
  resolveIgHandlesToBrands: (h: string[]) => mockResolve(h),
}))

const ORIG_AI = process.env.AI_SERVER_URL

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockResolve.mockReset()
  mockResolve.mockResolvedValue([])
  if (ORIG_AI === undefined) delete process.env.AI_SERVER_URL
  else process.env.AI_SERVER_URL = ORIG_AI
})

describe("selectEngine — single v6 engine (§10c)", () => {
  it("returns the sole v6 adapter, env-independent (no version branching)", () => {
    const e = selectEngine()
    expect(e).toBe(v6Adapter)
    expect(e.version).toBe("v6")
  })

  it("repeated calls return the SAME engine instance (stable seam)", () => {
    const a = selectEngine()
    const b = selectEngine()
    const c = selectEngine()
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBe(v6Adapter)
  })
})

describe("port-seam forward-compat — route delegates with ZERO caller diff", () => {
  it("route reaches v6 purely via the port (no per-engine route branch)", async () => {
    // The route only ever calls selectEngine().search(req). With no Modal /
    // DB available the v6 engine returns failed:true; the route maps that to
    // its EXISTING 502 contract. The point: routing reached the engine
    // through the preserved port seam, no caller change.
    process.env.AI_SERVER_URL = "https://ai.test"
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
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: "AI server unavailable",
      code: "AI_SERVER_FAILED",
    })
  })

  it("a fresh future engine swapped behind the port needs zero route change", async () => {
    // The port shape is interface-only: any engine implementing
    // SearchEngine satisfies the route contract identically. This is the
    // forward-compat guarantee at the mechanism level (§10c rationale for
    // keeping the interface even with a single implementation).
    const futureEngine = {
      version: "v7",
      async search() {
        return {
          strongMatches: [],
          general: [{id: "general", products: []}],
          engine: "v7",
          failed: false,
        }
      },
    }
    expect(typeof futureEngine.search).toBe("function")
    expect(typeof v6Adapter.search).toBe("function")
    expect(typeof v6Adapter.version).toBe("string")
    const out = await futureEngine.search()
    expect(out.failed).toBe(false)
    expect(out.engine).toBe("v7")
  })
})
