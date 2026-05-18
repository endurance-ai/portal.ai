/**
 * SPEC-SEARCH-V6-001 P2 — `/api/find/search` HTTP contract regression net
 * (re-pointed from SPEC-SEARCH-UNIFY-001 PRESERVE).
 *
 * ── v5 byte-identity pin RETIRED ──────────────────────────────────────────
 * This file was the SPEC-SEARCH-UNIFY-001 PRESERVE 1 net pinning the
 * v5-success envelope BYTE-IDENTICALLY against the inline-v5 / v5-adapter
 * `/recommend` fetch path. SPEC-SEARCH-V6-001 P2 (§10b, AC-024) deleted
 * `v5-adapter.ts` (and v4-fallback-adapter.ts + circuit-breaker.ts): the
 * v5 byte-identity SUBJECT no longer exists, so that specific pin is
 * legitimately retired with SPEC basis. It is NOT silently dropped — the
 * SAME safety intent (the route ENVELOPE shape + 400/200/502 gating +
 * strong/general grouping + the toSearchProduct price quirk) is RE-POINTED
 * here to pin the v6 engine contract (SPEC §4/§6/§13; engine-port.ts +
 * v6-adapter.ts), which is the sole engine behind the preserved port (§10c).
 *
 * What is pinned here (CURRENT observable behavior of route.ts on v6):
 *   - 400 input-validation variants (bad JSON / missing item / missing
 *     searchQuery / no imageUrl|AI_SERVER_URL -> AI_SERVER_REQUIRED) — the
 *     route input gate is engine-independent and UNCHANGED.
 *   - 200 v6 success envelope: byte-shape incl `engine:"v6"`, group wrapping
 *     (strongMatches/general), `toSearchProduct` mapping, item +
 *     resolvedBrands echo. THIS is the route↔port envelope contract.
 *   - `engine:"v6-degraded"` provenance echoed verbatim when the engine ran
 *     the ratified §13 결정 1 category-only degrade (REQ-V6-034).
 *   - 502 `AI_SERVER_FAILED` when the engine returns `failed:true` (query
 *     embedding failed OR the general DB path failed entirely) — the route's
 *     502 contract is UNCHANGED; only the upstream failure trigger moved
 *     from a /recommend fetch to the v6 embed/RPC path.
 *
 * The v6 engine's DB chain (query-embed, supabase rpc, style-nodes-db) is
 * MOCKED — we pin the route's TRANSLATION of an engine response into its
 * HTTP contract, NOT v6 retrieval internals (search_products_v6 / Modal
 * /embed, SPEC P1 + P5 scope).
 *
 * QUIRK comments mark surprising-but-pinned behavior. Reality is pinned
 * as-is; nothing is "fixed".
 */

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

// `server-only` is not bundled in jsdom; the route's transitive graph
// (registry → v6-adapter) imports it. Neutralize defensively.
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

// v6-adapter lazily imports these inside search(). Mock the DB chain so the
// route's envelope translation is exercised without a live DB / Modal.
const mockBuildQueryEmbedding = vi.fn(async (_img: string, _txt?: string) => ({
  embedding: [0.1, 0.2, 0.3],
  fused: false,
}))
vi.mock("@/domains/search/query-embed", () => ({
  buildQueryEmbedding: (img: string, txt?: string) =>
    mockBuildQueryEmbedding(img, txt),
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
}))
vi.mock("@/lib/style-nodes-db", () => ({
  getStyleNodeByCode: vi.fn(async (_c: string) => null),
}))
const mockRpc = vi.fn(
  async (_fn: string, _args: Record<string, unknown>) =>
    ({data: [] as unknown[], error: null}) as {
      data: unknown
      error: {message: string} | null
    },
)
vi.mock("@/lib/supabase", () => ({
  supabase: {rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args)},
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

// One search_products_v6 row exactly as the RPC returns it (V6Row shape).
function v6Row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    brand: "Acme",
    name: "Wool Coat",
    price: 129000,
    image_url: "https://img/x.jpg",
    product_url: "https://shop/x",
    platform: "cafe24",
    subcategory: "overcoat",
    distance: 0.09,
    degraded: false,
    ...over,
  }
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
  mockBuildQueryEmbedding.mockReset()
  mockBuildQueryEmbedding.mockResolvedValue({embedding: [0.1, 0.2, 0.3], fused: false})
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({data: [], error: null})
  if (ORIG_AI_URL === undefined) delete process.env.AI_SERVER_URL
  else process.env.AI_SERVER_URL = ORIG_AI_URL
  if (ORIG_TIMEOUT === undefined) delete process.env.AI_SERVER_TIMEOUT_MS
  else process.env.AI_SERVER_TIMEOUT_MS = ORIG_TIMEOUT
})

beforeEach(() => {
  mockResolve.mockResolvedValue([])
  mockBuildQueryEmbedding.mockResolvedValue({embedding: [0.1, 0.2, 0.3], fused: false})
  mockRpc.mockResolvedValue({data: [], error: null})
})

describe("find/search — input validation (400 contract, engine-independent)", () => {
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

  it("no imageUrl -> 400 AI_SERVER_REQUIRED (fall-through)", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    const noImg = {item: VALID_ITEM.item}
    expect(await bodyOf(await POST(postReq(noImg)))).toEqual({
      status: 400,
      json: {error: "imageUrl and AI_SERVER_URL required", code: "AI_SERVER_REQUIRED"},
    })
  })

  it("QUIRK: AI_SERVER_URL unset (even with imageUrl) -> 400 AI_SERVER_REQUIRED, NOT 502", async () => {
    // The `if (body.imageUrl && AI_SERVER_URL)` gate is false when env unset,
    // so it falls through to the 400 branch — it never reaches the engine.
    const POST = await loadRoute({AI_SERVER_URL: undefined})
    expect(await bodyOf(await POST(postReq(VALID_ITEM)))).toEqual({
      status: 400,
      json: {error: "imageUrl and AI_SERVER_URL required", code: "AI_SERVER_REQUIRED"},
    })
  })
})

describe("find/search — v6 success envelope (byte-shape, port-seam contract)", () => {
  it("general-only (no brandFilter) -> 200 engine:v6, general group, strongMatches:[]", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockRpc.mockResolvedValue({data: [v6Row()], error: null})

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
      engine: "v6",
    })
    // general-only: exactly ONE search_products_v6 RPC (no strong call
    // without brandFilter — strong arm resolves to null).
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][0]).toBe("search_products_v6")
  })

  it("brandFilter present -> strong + general groups, two RPC calls", async () => {
    mockResolve.mockResolvedValue([{brandName: "Acme"}])
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockRpc.mockResolvedValue({data: [v6Row()], error: null})

    const {status, json} = await bodyOf(
      await POST(postReq({...VALID_ITEM, taggedHandles: ["@acme"]})),
    )
    expect(status).toBe(200)
    const j = json as Record<string, unknown>
    expect(j.engine).toBe("v6")
    expect(j.resolvedBrands).toEqual([{brandName: "Acme"}])
    expect((j.strongMatches as unknown[]).length).toBe(1)
    expect((j.general as unknown[]).length).toBe(1)
    expect(mockRpc).toHaveBeenCalledTimes(2) // strong + general in parallel
  })

  it("QUIRK: engine ran but 0 rows -> still 200 engine:v6 with empty groups (NOT 502)", async () => {
    // generalRows is a (non-null) empty array. The 200/502 decision gates on
    // generalRows===null (DB failure), NOT on row count — verbatim v5-parity
    // gate reproduced by v6-adapter.
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockRpc.mockResolvedValue({data: [], error: null})
    const {status, json} = await bodyOf(await POST(postReq(VALID_ITEM)))
    expect(status).toBe(200)
    expect(json).toEqual({
      item: VALID_ITEM.item,
      resolvedBrands: [],
      strongMatches: [],
      general: [],
      engine: "v6",
    })
  })

  it("QUIRK: strong RPC fails but general ok -> still 200 (only general gates 200/502)", async () => {
    mockResolve.mockResolvedValue([{brandName: "Acme"}])
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockRpc.mockImplementation(async (_fn: string, args: Record<string, unknown>) => {
      // strong call passes a non-null p_brand_names; general passes null.
      const isStrong = args.p_brand_names !== null
      if (isStrong) return {data: null, error: {message: "strong boom"}}
      return {data: [v6Row()], error: null}
    })
    const {status, json} = await bodyOf(
      await POST(postReq({...VALID_ITEM, taggedHandles: ["@acme"]})),
    )
    expect(status).toBe(200)
    const j = json as Record<string, unknown>
    expect(j.engine).toBe("v6")
    expect(j.strongMatches).toEqual([]) // strong failed -> empty, no 502
    expect((j.general as unknown[]).length).toBe(1)
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it("QUIRK: null price -> '' (not '₩0'); price 0 -> '₩0' (verbatim toSearchProduct)", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockRpc.mockResolvedValue({
      data: [v6Row({id: 1, price: null}), v6Row({id: 2, price: 0})],
      error: null,
    })
    const j = (await (await POST(postReq(VALID_ITEM))).json()) as Record<
      string,
      Array<{products: Array<{price: string}>}>
    >
    const prices = j.general[0].products.map((p) => p.price)
    expect(prices).toEqual(["", "₩0"])
  })

  it("engine:v6-degraded provenance echoed verbatim (ratified §13 결정 1 fallback)", async () => {
    // search_products_v6 sets degraded:true on the category-only fallback
    // (REQ-V6-034). v6-adapter surfaces it as engine:"v6-degraded"; the
    // route echoes result.engine verbatim.
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockRpc.mockResolvedValue({data: [v6Row({degraded: true})], error: null})
    const {status, json} = await bodyOf(await POST(postReq(VALID_ITEM)))
    expect(status).toBe(200)
    expect((json as Record<string, unknown>).engine).toBe("v6-degraded")
  })
})

describe("find/search — v6 failure -> 502 AI_SERVER_FAILED (route 502 contract UNCHANGED)", () => {
  it("query embedding throws -> failed:true -> 502 AI_SERVER_FAILED", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockBuildQueryEmbedding.mockRejectedValue(new Error("Modal /embed down"))
    expect(await bodyOf(await POST(postReq(VALID_ITEM)))).toEqual({
      status: 502,
      json: {error: "AI server unavailable", code: "AI_SERVER_FAILED"},
    })
  })

  it("general RPC errors -> generalRows null -> 502 AI_SERVER_FAILED", async () => {
    const POST = await loadRoute({AI_SERVER_URL: AI_URL})
    mockRpc.mockResolvedValue({data: null, error: {message: "db down"}})
    expect(await bodyOf(await POST(postReq(VALID_ITEM)))).toEqual({
      status: 502,
      json: {error: "AI server unavailable", code: "AI_SERVER_FAILED"},
    })
  })
})
