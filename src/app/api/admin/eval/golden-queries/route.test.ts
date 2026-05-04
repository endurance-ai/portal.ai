import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

interface DbResult { data: unknown; error: { message: string; code?: string } | null; count?: number | null }

const state = {
  selectListResult: { data: [] as unknown, error: null as { message: string; code?: string } | null, count: 0 as number | null } as DbResult,
  insertSingleResult: { data: null, error: null } as DbResult,
  updateMaybeSingleResult: { data: null, error: null } as DbResult,
  deleteResult: { data: null, error: null, count: 0 as number | null } as DbResult,
  lastTable: null as string | null,
  lastInsertPayload: null as unknown,
  lastUpdatePatch: null as unknown,
  lastFilters: [] as Array<{ column: string; value: unknown }>,
}

function reset() {
  state.selectListResult = { data: [], error: null, count: 0 }
  state.insertSingleResult = { data: null, error: null }
  state.updateMaybeSingleResult = { data: null, error: null }
  state.deleteResult = { data: null, error: null, count: 0 }
  state.lastTable = null
  state.lastInsertPayload = null
  state.lastUpdatePatch = null
  state.lastFilters = []
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      state.lastTable = table
      return {
        select() {
          // chain: select().order().range() → resolves
          const chain = {
            eq(column: string, value: unknown) { state.lastFilters.push({ column, value }); return chain },
            order() { return chain },
            range: async () => state.selectListResult,
          }
          return chain
        },
        insert(payload: unknown) {
          state.lastInsertPayload = payload
          return {
            select: () => ({
              single: async () => state.insertSingleResult,
            }),
          }
        },
        update(patch: unknown) {
          state.lastUpdatePatch = patch
          const chain = {
            eq(column: string, value: unknown) { state.lastFilters.push({ column, value }); return chain },
            select: () => ({
              maybeSingle: async () => state.updateMaybeSingleResult,
            }),
          }
          return chain
        },
        delete() {
          const chain = {
            eq: async (column: string, value: unknown) => {
              state.lastFilters.push({ column, value })
              return state.deleteResult
            },
          }
          return chain
        },
      }
    },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  requireApprovedAdmin: vi.fn(async () => ({ user: { id: "admin-uid" } })),
}))

import { GET, POST, PATCH, DELETE } from "./route"

beforeEach(() => reset())

function req(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init as RequestInit)
}

describe("GET /api/admin/eval/golden-queries", () => {
  it("페이지네이션된 items + total 반환", async () => {
    state.selectListResult = {
      data: [{ id: "g-1", intent_note: "test" }],
      error: null,
      count: 7,
    }
    const res = await GET(req("http://localhost/api/admin/eval/golden-queries?page=1&pageSize=20"))
    const json = await res.json()
    expect(state.lastTable).toBe("eval_golden_queries")
    expect(res.status).toBe(200)
    expect(json.total).toBe(7)
    expect(json.items).toHaveLength(1)
  })
})

describe("POST /api/admin/eval/golden-queries", () => {
  it("성공 → 201 with row", async () => {
    state.insertSingleResult = {
      data: { id: "new-id", intent_note: "n" },
      error: null,
    }
    const res = await POST(
      req("http://localhost/api/admin/eval/golden-queries", {
        method: "POST",
        body: JSON.stringify({
          instagramUrl: "https://instagram.com/p/x",
          intentNote: "n",
          createdBy: "admin@test",
          algorithmVersion: "v4",
        }),
      }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe("new-id")
    const payload = state.lastInsertPayload as Record<string, unknown>
    expect(payload.algorithm_version).toBe("v4")
    expect(payload.instagram_url).toBe("https://instagram.com/p/x")
  })

  it("identity 둘 다 누락 → 400", async () => {
    const res = await POST(
      req("http://localhost/api/admin/eval/golden-queries", {
        method: "POST",
        body: JSON.stringify({ intentNote: "n", createdBy: "a" }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("dual identity 중복 → 409", async () => {
    state.insertSingleResult = {
      data: null,
      error: { message: "duplicate key", code: "23505" },
    }
    const res = await POST(
      req("http://localhost/api/admin/eval/golden-queries", {
        method: "POST",
        body: JSON.stringify({
          instagramUrl: "u",
          intentNote: "n",
          createdBy: "a",
        }),
      }),
    )
    expect(res.status).toBe(409)
  })
})

describe("PATCH /api/admin/eval/golden-queries", () => {
  it("성공 → 200 with row", async () => {
    state.updateMaybeSingleResult = {
      data: { id: "g-1", intent_note: "updated" },
      error: null,
    }
    const res = await PATCH(
      req("http://localhost/api/admin/eval/golden-queries?id=g-1", {
        method: "PATCH",
        body: JSON.stringify({ intentNote: "updated" }),
      }),
    )
    expect(res.status).toBe(200)
    const patch = state.lastUpdatePatch as Record<string, unknown>
    expect(patch.intent_note).toBe("updated")
  })

  it("not found → 404", async () => {
    state.updateMaybeSingleResult = { data: null, error: null }
    const res = await PATCH(
      req("http://localhost/api/admin/eval/golden-queries?id=missing", {
        method: "PATCH",
        body: JSON.stringify({ intentNote: "x" }),
      }),
    )
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/admin/eval/golden-queries", () => {
  it("성공 → 204", async () => {
    state.deleteResult = { data: null, error: null, count: 1 }
    const res = await DELETE(req("http://localhost/api/admin/eval/golden-queries?id=g-1", { method: "DELETE" }))
    expect(res.status).toBe(204)
  })

  it("id 없음 → 400", async () => {
    const res = await DELETE(req("http://localhost/api/admin/eval/golden-queries", { method: "DELETE" }))
    expect(res.status).toBe(400)
  })
})
