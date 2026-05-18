/**
 * SPEC-SEARCH-V6-001 P1 — v6 engine unit tests (engine body + grouping +
 * fallback provenance + failed-gate). Modal /embed and the search_products_v6
 * RPC are mocked — this pins the ADAPTER's pipeline orchestration + envelope
 * translation, not Modal inference or DB ranking (P5 golden-set scope).
 */

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {v6Adapter} from "./v6-adapter"
import type {RecommendRequest} from "../engine-port"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/logger", () => ({
  logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
}))

const mockBuildQueryEmbedding = vi.fn()
vi.mock("../query-embed", () => ({
  buildQueryEmbedding: (...a: unknown[]) => mockBuildQueryEmbedding(...a),
  toVectorLiteral: (v: number[]) => `[${v.join(",")}]`,
}))

const mockGetStyleNodeByCode = vi.fn()
vi.mock("@/lib/style-nodes-db", () => ({
  getStyleNodeByCode: (c: string) => mockGetStyleNodeByCode(c),
}))

const mockRpc = vi.fn()
vi.mock("@/lib/supabase", () => ({
  supabase: {rpc: (...a: unknown[]) => mockRpc(...a)},
}))

function reqOf(over: Partial<RecommendRequest> = {}): RecommendRequest {
  return {
    item: {id: "i1", category: "Top", searchQuery: "black wool coat"},
    imageUrl: "https://img/post.jpg",
    styleNode: {primary: "C"},
    brandFilter: [],
    strongTolerance: 0.5,
    generalTolerance: 0.5,
    ...over,
  }
}

const ROW = {
  id: 42,
  brand: "Acme",
  name: "Wool Coat",
  price: 129000,
  image_url: "https://img/x.jpg",
  product_url: "https://shop/x",
  platform: "cafe24",
  subcategory: "overcoat",
  distance: 0.12,
  degraded: false,
}

beforeEach(() => {
  mockBuildQueryEmbedding.mockResolvedValue({embedding: [0.1, 0.2], fused: true})
  mockGetStyleNodeByCode.mockResolvedValue({id: 7, code: "C"})
  mockRpc.mockResolvedValue({data: [ROW], error: null})
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("v6Adapter — port shape", () => {
  it("version is 'v6'", () => {
    expect(v6Adapter.version).toBe("v6")
  })
})

describe("v6Adapter — general path (no brandFilter)", () => {
  it("returns engine:v6, general group, strongMatches:[], one RPC call", async () => {
    const res = await v6Adapter.search(reqOf())
    expect(res).toEqual({
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
      failed: false,
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    // FILTER 1 anchor: node CODE → style_nodes.id resolved before RPC.
    expect(mockGetStyleNodeByCode).toHaveBeenCalledWith("C")
    expect(mockRpc).toHaveBeenCalledWith(
      "search_products_v6",
      expect.objectContaining({p_style_node_id: 7, p_category: "Top"}),
    )
  })
})

describe("v6Adapter — strong path (brandFilter present)", () => {
  it("runs strong + general (two RPC calls), both groups populated", async () => {
    const res = await v6Adapter.search(reqOf({brandFilter: ["Acme"]}))
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(res.strongMatches.length).toBe(1)
    expect(res.general.length).toBe(1)
    expect(res.failed).toBe(false)
    // strong call narrows by brand names; general does not.
    const calls = mockRpc.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(calls.some((c) => c.p_brand_names === null)).toBe(true)
    expect(
      calls.some(
        (c) => JSON.stringify(c.p_brand_names) === JSON.stringify(["Acme"]),
      ),
    ).toBe(true)
  })

  it("QUIRK: strong RPC fails but general ok → still not failed, strongMatches:[]", async () => {
    mockRpc
      .mockResolvedValueOnce({data: null, error: {message: "boom"}}) // strong
      .mockResolvedValueOnce({data: [ROW], error: null}) // general
    const res = await v6Adapter.search(reqOf({brandFilter: ["Acme"]}))
    expect(res.failed).toBe(false)
    expect(res.strongMatches).toEqual([])
    expect(res.general.length).toBe(1)
  })
})

describe("v6Adapter — degrade provenance (ratified §13 결정 1)", () => {
  it("degraded general rows → engine:'v6-degraded' (no new response field)", async () => {
    mockRpc.mockResolvedValue({data: [{...ROW, degraded: true}], error: null})
    const res = await v6Adapter.search(reqOf())
    expect(res.engine).toBe("v6-degraded")
    expect(res.failed).toBe(false)
    expect(res.general.length).toBe(1)
  })

  it("unmapped node code → null node id passed → RPC takes degraded path", async () => {
    mockGetStyleNodeByCode.mockResolvedValue(null)
    mockRpc.mockResolvedValue({data: [{...ROW, degraded: true}], error: null})
    const res = await v6Adapter.search(reqOf())
    expect(mockRpc).toHaveBeenCalledWith(
      "search_products_v6",
      expect.objectContaining({p_style_node_id: null}),
    )
    expect(res.engine).toBe("v6-degraded")
  })

  it("ran-but-empty general → not failed, empty group, engine:v6", async () => {
    mockRpc.mockResolvedValue({data: [], error: null})
    const res = await v6Adapter.search(reqOf())
    expect(res).toEqual({
      strongMatches: [],
      general: [],
      engine: "v6",
      failed: false,
    })
  })
})

describe("v6Adapter — failed gate (→ route 502 AI_SERVER_FAILED)", () => {
  it("image embedding fails entirely → failed:true", async () => {
    mockBuildQueryEmbedding.mockRejectedValue(new Error("Modal /embed down"))
    const res = await v6Adapter.search(reqOf())
    expect(res).toEqual({
      strongMatches: [],
      general: [],
      engine: "v6",
      failed: true,
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("general RPC fails entirely → failed:true", async () => {
    mockRpc.mockResolvedValue({data: null, error: {message: "db down"}})
    const res = await v6Adapter.search(reqOf())
    expect(res.failed).toBe(true)
    expect(res.engine).toBe("v6")
  })
})
