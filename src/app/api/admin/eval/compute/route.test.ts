import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

const state = {
  judgmentRows: { data: [] as unknown, error: null as { message: string } | null },
  computeImpl: vi.fn(),
}

function reset() {
  state.judgmentRows = { data: [], error: null }
  state.computeImpl.mockReset()
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from() {
      return {
        select() {
          const chain = {
            in() { return chain },
            eq() { return chain },
            not: async () => state.judgmentRows,
          }
          return chain
        },
      }
    },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  requireApprovedAdmin: vi.fn(async () => ({ user: { id: "uid" } })),
}))

vi.mock("@/lib/eval/judgment-store", () => ({
  routeAlgorithmVersion: (v: string) => {
    if (v === "v4") return "v4"
    throw new Error("only v4")
  },
}))

vi.mock("@/lib/eval/run-snapshot", () => ({
  computeRun: (...args: unknown[]) => state.computeImpl(...args),
}))

import { POST } from "./route"

beforeEach(() => reset())

function req(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/admin/eval/compute"), {
    method: "POST",
    body: JSON.stringify(body),
  } as RequestInit)
}

describe("POST /api/admin/eval/compute", () => {
  it("happy path → 201 RunResult", async () => {
    state.judgmentRows = {
      data: [{ golden_query_id: "gq-1" }, { golden_query_id: "gq-2" }],
      error: null,
    }
    state.computeImpl.mockResolvedValueOnce({
      id: "run-1", algorithmVersion: "v4", goldenQueryId: null,
      ndcgAt10: 0.8, precisionAt5: 0.6, queryCount: 2, judgmentCount: 20, frozen: false,
      computedAt: "2026-05-04T00:00:00Z", notes: null,
    })
    const res = await POST(req({
      algorithmVersion: "v4",
      rankedResults: [
        { goldenQueryId: "gq-1", productOrder: ["p1"] },
        { goldenQueryId: "gq-2", productOrder: ["p2"] },
      ],
    }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe("run-1")
  })

  it("미라벨 쿼리 존재 → 422 with missingGoldenQueryIds", async () => {
    state.judgmentRows = { data: [{ golden_query_id: "gq-1" }], error: null }
    const res = await POST(req({
      algorithmVersion: "v4",
      rankedResults: [
        { goldenQueryId: "gq-1", productOrder: [] },
        { goldenQueryId: "gq-MISS", productOrder: [] },
      ],
    }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.missingGoldenQueryIds).toEqual(["gq-MISS"])
  })

  it("computeRun frozen baseline 위반 throw → 409", async () => {
    state.judgmentRows = { data: [{ golden_query_id: "gq-1" }], error: null }
    state.computeImpl.mockRejectedValueOnce(new Error("baseline already frozen for v4"))
    const res = await POST(req({
      algorithmVersion: "v4",
      rankedResults: [{ goldenQueryId: "gq-1", productOrder: [] }],
    }))
    expect(res.status).toBe(409)
  })

  it("rankedResults 빈 배열 → 400", async () => {
    const res = await POST(req({ algorithmVersion: "v4", rankedResults: [] }))
    expect(res.status).toBe(400)
  })
})
