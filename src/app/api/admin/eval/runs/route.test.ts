import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

interface DbResult { data: unknown; error: { message: string } | null }

const state = {
  selectResult: { data: [] as unknown, error: null as { message: string } | null } as DbResult,
  lastTable: null as string | null,
  lastFilters: [] as Array<{ column: string; value: unknown }>,
  lastLimit: null as number | null,
}

function reset() {
  state.selectResult = { data: [], error: null }
  state.lastTable = null
  state.lastFilters = []
  state.lastLimit = null
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      state.lastTable = table
      const chain = {
        select() { return chain },
        eq(column: string, value: unknown) { state.lastFilters.push({ column, value }); return chain },
        order() { return chain },
        limit(n: number) {
          state.lastLimit = n
          return Promise.resolve(state.selectResult)
        },
      }
      return chain
    },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  requireApprovedAdmin: vi.fn(async () => ({ user: { id: "admin-uid" } })),
}))

import { GET } from "./route"

beforeEach(() => reset())

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost"))
}

describe("GET /api/admin/eval/runs", () => {
  it("기본 limit=20 + items 반환", async () => {
    state.selectResult = {
      data: [
        { id: "r-1", algorithm_version: "v4", ndcg_at_10: 0.85 },
        { id: "r-2", algorithm_version: "v4", ndcg_at_10: 0.82 },
      ],
      error: null,
    }
    const res = await GET(req("http://localhost/api/admin/eval/runs"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(state.lastTable).toBe("eval_runs")
    expect(state.lastLimit).toBe(20)
    expect(json.items).toHaveLength(2)
  })

  it("algorithm_version=v4 필터 적용", async () => {
    state.selectResult = { data: [], error: null }
    await GET(req("http://localhost/api/admin/eval/runs?algorithm_version=v4&limit=5"))
    expect(state.lastFilters).toContainEqual({ column: "algorithm_version", value: "v4" })
    expect(state.lastLimit).toBe(5)
  })
})
