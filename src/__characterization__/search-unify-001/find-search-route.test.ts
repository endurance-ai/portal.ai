/**
 * SPEC-SEARCH-UNIFY-001 PRESERVE — `/api/find/search` HTTP contract.
 *
 * This is the REGRESSION NET for the upcoming versioned `SearchEngine` port
 * refactor (IMPROVE phase, deferred + user-gated). The arch-app-001
 * main-flow.test.ts deliberately DEFERRED the route-handler branching ("the
 * /recommend network contract is ai-owned") and pinned only the pure
 * `toSearchProduct` transform. SPEC-SEARCH-UNIFY-001's HARD characterization
 * gate explicitly requires the OTHER half: the app-side route ENVELOPE +
 * v5-success / v5-failure branching, which IS the port seam to be indirected.
 *
 * What is pinned here (CURRENT observable behavior of route.ts, verbatim):
 *   - 400 input-validation variants (bad JSON / missing item / missing
 *     searchQuery / no imageUrl|AI_SERVER_URL -> AI_SERVER_REQUIRED).
 *   - 200 v5 success envelope: byte-shape incl `engine:"v5"`, group wrapping
 *     (strongMatches/general), `toSearchProduct` mapping, item + resolvedBrands
 *     echo. THIS is what must stay byte-identical after the port is introduced.
 *   - 502 `AI_SERVER_FAILED` on /recommend 5xx AND on /recommend network throw
 *     (current code reality — the v4 in-process fallback was REMOVED; #57).
 *
 * The /recommend response is MOCKED (fetch stub) — we pin find/search's
 * TRANSLATION of a recommend response into its HTTP contract, NOT ai's
 * internal scoring (SPEC-ARCH-AI-001 scope, unchanged here).
 *
 * QUIRK comments mark surprising-but-pinned behavior. Reality is pinned as-is;
 * nothing is "fixed".
 */

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

// `server-only` is not bundled in jsdom; the route does not import it directly
// but the resolve-brands transitive graph might. Neutralize defensively
// (matches the arch-app-001 admin-auth.test.ts pattern).
vi.mock("server-only", () => ({}))

// Mock the IG-handle->brand resolver so no DB / catalog load. Default: no
// brands (general-only path); individual tests override per scenario.
const mockResolve = vi.fn(async (_handles: string[]) => [] as Array<{brandName: string}>)
vi.mock("@/lib/find/resolve-brands", () => ({
  resolveIgHandlesToBrands: (h: string[]) => mockResolve(h),
}))

// Silence logger noise without asserting on it.
vi.mock("@/lib/logger", () => ({
  logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}))

const AI_URL = "https://ai.test"

async function bodyOf(res: unknown): Promise<{status: number; json: unknown}> {
  const r = res as Response
  return {status: r.status, json: await r.json()}
}

// route.ts captures AI_SERVER_URL / AI_SERVER_TIMEOUT_MS in module-scope
// `const`s at import time. To exercise different env states we set env, reset
// the module registry, then dynamic-import a fresh copy of the route.
async function loadRoute(env: {AI_SERVER_URL?: string} = {}) {
  vi.resetModules()
  if (env.AI_SERVER_URL === undefined) delete process.env.AI_SERVER_URL
  else process.env.AI_SERVER_URL = env.AI_SERVER_URL
  process.env.AI_SERVER_TIMEOUT_MS = "60000"
  const mod = await import("@/app/api/find/search/route")
  return mod.POST
}

function postReq(body: unknown, raw?: string): Request {
  return new Request("https://kiko.test/api/find/search", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: raw !== undefined ? raw : JSON.stringify(body),
  })
}

// One AI /recommend candidate as the ai server currently returns it.
function aiResponse(results: Array<Record<string, unknown>>) {
  return {
    itemId: "i1",
    results,
    counts: {total: results.length},
    latencyMs: {rpc: 1},
  }
}

const CAND = {
  id: "p1",
  brand: "Acme",
  name: "Wool Coat",
  price: 129000,
  imageUrl: "https://img/x.jpg",
  productUrl: "https://shop/x",
  platform: "cafe24",
  subcategory: "overcoat",
  score: 0.91,
}

const VALID_ITEM = {
  item: {
    id: "it1",
    category: "outerwear",
    subcategory: "overcoat",
    searchQuery: "black wool coat",
  },
  imageUrl: "https://img/post.jpg",
}

const ORIG_AI_URL = process.env.AI_SERVER_URL
const ORIG_TIMEOUT = process.env.AI_SERVER_TIMEOUT_MS

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockResolve.mockReset()
  mockResolve.mockResolvedValue([])
  if (ORIG_AI_URL === undefined) delete process.env.AI_SERVER_URL
  else process.env.AI_SERVER_URL = ORIG_AI_URL
  if (ORIG_TIMEOUT === undefined) delete process.env.AI_SERVER_TIMEOUT_MS
  else process.env.AI_SERVER_TIMEOUT_MS = ORIG_TIMEOUT
})

beforeEach(() => {
  mockResolve.mockResolvedValue([])
})

describe("find/search — input validation (400 contract)", () => {
  it("invalid JSON body -> 400 {error:'Invalid JSON'}", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    expect(await bodyOf(await POST(postReq(null, "{not json")))).toEqual({
      status: 400,
      json: {error: "Invalid JSON"},
    })
  })

  it("missing item -> 400 {error:'Missing `item`'}", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    expect(await bodyOf(await POST(postReq({imageUrl: "x"})))).toEqual({
      status: 400,
      json: {error: "Missing `item`"},
    })
  })

  it("missing item.searchQuery -> 400 {error:'item.searchQuery is required'}", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    expect(
      await bodyOf(await POST(postReq({item: {id: "x", category: "c"}}))),
    ).toEqual({
      status: 400,
      json: {error: "item.searchQuery is required"},
    })
  })

  it("no imageUrl -> 400 AI_SERVER_REQUIRED (v5-only, fall-through)", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    const noImg = {item: VALID_ITEM.item}
    expect(await bodyOf(await POST(postReq(noImg)))).toEqual({
      status: 400,
      json: {error: "imageUrl and AI_SERVER_URL required", code: "AI_SERVER_REQUIRED"},
    })
  })

  it("QUIRK: AI_SERVER_URL unset (even with imageUrl) -> 400 AI_SERVER_REQUIRED, NOT 502", async () => {
    // The `if (body.imageUrl && AI_SERVER_URL)` gate is false when env unset,
    // so it falls through to the 400 branch — it never reaches the 502 path.
    const POST = await loadRoute({AI_SERVER_URL: undefined})
    expect(await bodyOf(await POST(postReq(VALID_ITEM)))).toEqual({
      status: 400,
      json: {error: "imageUrl and AI_SERVER_URL required", code: "AI_SERVER_REQUIRED"},
    })
  })
})

describe("find/search — v5 success envelope (byte-shape, port-seam contract)", () => {
  it("general-only (no brandFilter) -> 200 engine:v5, general group, strongMatches:[]", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(aiResponse([CAND])), {
        status: 200,
        headers: {"content-type": "application/json"},
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const {status, json} = await bodyOf(await POST(postReq(VALID_ITEM)))
    expect(status).toBe(200)
    expect(json).toEqual({
      item: VALID_ITEM.item,
      resolvedBrands: [],
      strongMatches: [],
      general: [
        {
          id: "general",
          products: [
            {
              brand: "Acme",
              title: "Wool Coat",
              price: "₩129,000",
              platform: "cafe24",
              imageUrl: "https://img/x.jpg",
              link: "https://shop/x",
            },
          ],
        },
      ],
      engine: "v5",
    })
    // general-only: exactly ONE /recommend call (no strong call without brandFilter)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${AI_URL}/recommend`)
  })

  it("brandFilter present -> strong + general groups, two /recommend calls", async () => {
    mockResolve.mockResolvedValue([{brandName: "Acme"}])
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(aiResponse([CAND])), {status: 200}),
    )
    vi.stubGlobal("fetch", fetchMock)

    const {status, json} = await bodyOf(
      await POST(postReq({...VALID_ITEM, taggedHandles: ["@acme"]})),
    )
    expect(status).toBe(200)
    const j = json as Record<string, unknown>
    expect(j.engine).toBe("v5")
    expect(j.resolvedBrands).toEqual([{brandName: "Acme"}])
    expect((j.strongMatches as unknown[]).length).toBe(1)
    expect((j.general as unknown[]).length).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2) // strong + general in parallel
  })

  it("QUIRK: AI ok but results=[] -> still 200 engine:v5 with empty groups (NOT 502)", async () => {
    // generalAI is a truthy object with results.length===0. The 200/502
    // decision gates on `if (generalAI)` (truthiness), NOT on result count.
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(aiResponse([])), {status: 200})),
    )
    const {status, json} = await bodyOf(await POST(postReq(VALID_ITEM)))
    expect(status).toBe(200)
    expect(json).toEqual({
      item: VALID_ITEM.item,
      resolvedBrands: [],
      strongMatches: [],
      general: [],
      engine: "v5",
    })
  })

  it("QUIRK: strong call fails but general ok -> still 200 (only generalAI gates 200/502)", async () => {
    mockResolve.mockResolvedValue([{brandName: "Acme"}])
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    let n = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: {body: string}) => {
        n += 1
        const isStrong = JSON.parse(init.body).brandFilter !== undefined
        if (isStrong) return new Response("boom", {status: 500})
        return new Response(JSON.stringify(aiResponse([CAND])), {status: 200})
      }),
    )
    const {status, json} = await bodyOf(
      await POST(postReq({...VALID_ITEM, taggedHandles: ["@acme"]})),
    )
    expect(status).toBe(200)
    const j = json as Record<string, unknown>
    expect(j.engine).toBe("v5")
    expect(j.strongMatches).toEqual([]) // strong failed -> empty, no 502
    expect((j.general as unknown[]).length).toBe(1)
    expect(n).toBe(2)
  })

  it("QUIRK: null price -> '' (not '₩0'); price 0 -> '₩0' (verbatim toSearchProduct)", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify(
            aiResponse([
              {...CAND, id: "a", price: null},
              {...CAND, id: "b", price: 0},
            ]),
          ),
          {status: 200},
        ),
      ),
    )
    const j = (await (await POST(postReq(VALID_ITEM))).json()) as Record<
      string,
      Array<{products: Array<{price: string}>}>
    >
    const prices = j.general[0].products.map((p) => p.price)
    expect(prices).toEqual(["", "₩0"])
  })
})

describe("find/search — v5 failure -> 502 AI_SERVER_FAILED (CURRENT reality, no v4 fallback)", () => {
  it("/recommend returns 500 -> generalAI null -> 502 AI_SERVER_FAILED", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream 500", {status: 500})),
    )
    expect(await bodyOf(await POST(postReq(VALID_ITEM)))).toEqual({
      status: 502,
      json: {error: "AI server unavailable", code: "AI_SERVER_FAILED"},
    })
  })

  it("/recommend network throw -> callAIServer catch -> null -> 502 AI_SERVER_FAILED", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED")
      }),
    )
    expect(await bodyOf(await POST(postReq(VALID_ITEM)))).toEqual({
      status: 502,
      json: {error: "AI server unavailable", code: "AI_SERVER_FAILED"},
    })
  })

  it("QUIRK: AbortController timeout path also collapses to 502 (catch -> null)", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("The operation was aborted")
        e.name = "AbortError"
        throw e
      }),
    )
    expect(await bodyOf(await POST(postReq(VALID_ITEM)))).toEqual({
      status: 502,
      json: {error: "AI server unavailable", code: "AI_SERVER_FAILED"},
    })
  })
})
