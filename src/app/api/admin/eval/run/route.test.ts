import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const state = {
  goldenRow: { data: null as unknown, error: null as { message: string } | null },
  productRow: { data: null as unknown, error: null as { message: string } | null },
  upsertCalls: [] as Array<Record<string, unknown>>,
}

function reset() {
  state.goldenRow = { data: null, error: null }
  state.productRow = { data: { id: "prod-uuid" }, error: null }
  state.upsertCalls = []
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      return {
        select() {
          const chain = {
            eq() { return chain },
            maybeSingle: async () => (table === "eval_golden_queries" ? state.goldenRow : state.productRow),
          }
          return chain
        },
      }
    },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  requireApprovedAdmin: vi.fn(async () => ({ user: { id: "uid", email: "admin@test" } })),
}))

vi.mock("@/lib/eval/judgment-store", () => ({
  routeAlgorithmVersion: (v: string) => {
    if (v === "v4") return "v4"
    if (v === "v6") throw new Error("algorithm_version 'v6' not yet supported — blocked until SPEC-V6-CORE merge")
    throw new Error(`unknown algorithm_version: ${v}`)
  },
  upsertJudgment: vi.fn(async (input: Record<string, unknown>) => {
    state.upsertCalls.push(input)
    return { id: "j-mock", ...input, labeledAt: "2026-05-04T00:00:00Z" }
  }),
}))

import { POST } from "./route"

const fetchMock = vi.fn()

beforeEach(() => {
  reset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function req(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/admin/eval/run"), {
    method: "POST",
    body: JSON.stringify(body),
  } as RequestInit)
}

describe("POST /api/admin/eval/run", () => {
  it("happy path: 10 products returned, 10 upserts created", async () => {
    state.goldenRow = {
      data: { id: "gq-1", instagram_url: null, query_signature: "blue blazer", intent_note: "blue blazer" },
      error: null,
    }
    const products = Array.from({ length: 10 }, (_, i) => ({
      brand: "B", title: `T${i}`, link: `https://x/${i}`, imageUrl: "", price: "1", platform: "p",
    }))
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ id: "eval-q", products }] }),
    })

    const res = await POST(req({ goldenQueryId: "gq-1", algorithmVersion: "v4" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.rankedProducts).toHaveLength(10)
    expect(json.judgmentRowsCreated).toBe(10)
    expect(state.upsertCalls).toHaveLength(10)
    expect(state.upsertCalls[0].relevanceGrade).toBe(0)
    expect(state.upsertCalls[0].algorithmVersion).toBe("v4")
  })

  it("golden query not found → 404", async () => {
    state.goldenRow = { data: null, error: null }
    const res = await POST(req({ goldenQueryId: "missing", algorithmVersion: "v4" }))
    expect(res.status).toBe(404)
  })

  it("search-products 5xx → 502 + judgmentRows 필드 omit", async () => {
    state.goldenRow = {
      data: { id: "gq-1", query_signature: "x", intent_note: "x" },
      error: null,
    }
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    const res = await POST(req({ goldenQueryId: "gq-1", algorithmVersion: "v4" }))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.code).toBe("SEARCH_PRODUCTS_FAILED")
    // SPEC-V6-EVAL-V2 REQ-001 D3: 502 응답에서 judgmentRows 키 자체가 omit
    expect("judgmentRows" in json).toBe(false)
  })

  it("happy path: judgmentRows 응답 포함 (productId/productKey 매핑)", async () => {
    state.goldenRow = {
      data: { id: "gq-1", instagram_url: null, query_signature: "blue blazer", intent_note: "blue blazer" },
      error: null,
    }
    const products = [
      { brand: "B1", title: "T1", link: "https://shop/p/A", imageUrl: "", price: "$10", platform: "p" },
      { brand: "B2", title: "T2", link: "https://shop/p/B", imageUrl: "", price: "$20", platform: "p" },
    ]
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ id: "eval-q", products }] }),
    })
    const res = await POST(req({ goldenQueryId: "gq-1", algorithmVersion: "v4" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.judgmentRows)).toBe(true)
    expect(json.judgmentRows).toHaveLength(2)
    expect(json.judgmentRows[0]).toMatchObject({
      id: "j-mock",
      productId: "prod-uuid",
      productKey: "https://shop/p/A",
    })
    expect(json.judgmentRows[1].productKey).toBe("https://shop/p/B")
    expect(json.judgmentRowsCreated).toBe(2)
  })

  it("algorithmVersion='v6' → 400 with SPEC-V6-CORE message", async () => {
    const res = await POST(req({ goldenQueryId: "gq-1", algorithmVersion: "v6" }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/SPEC-V6-CORE/)
  })

  it("empty products → 200 with judgmentRowsCreated=0", async () => {
    state.goldenRow = {
      data: { id: "gq-1", query_signature: "x", intent_note: "x" },
      error: null,
    }
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
    const res = await POST(req({ goldenQueryId: "gq-1", algorithmVersion: "v4" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.rankedProducts).toEqual([])
    expect(json.judgmentRowsCreated).toBe(0)
  })
})
