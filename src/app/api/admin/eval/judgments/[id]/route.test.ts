import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("server-only", () => ({}))

const state = {
  updateResult: { data: null as unknown, error: null as { message: string; code?: string } | null },
  lastPatch: null as unknown,
  adminGate: null as unknown,
}

function reset() {
  state.updateResult = { data: null, error: null }
  state.lastPatch = null
  state.adminGate = { user: { id: "uid" } }
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from() {
      return {
        update(patch: unknown) {
          state.lastPatch = patch
          const chain = {
            eq() { return chain },
            select: () => ({
              maybeSingle: async () => state.updateResult,
            }),
          }
          return chain
        },
      }
    },
  },
}))

vi.mock("@/lib/admin-auth", () => ({
  requireApprovedAdmin: vi.fn(async () => state.adminGate),
}))

import { PATCH } from "./route"

beforeEach(() => reset())

function req(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/admin/eval/judgments/j-1"), {
    method: "PATCH",
    body: JSON.stringify(body),
  } as RequestInit)
}

const ctx = { params: Promise.resolve({ id: "j-1" }) }

describe("PATCH /api/admin/eval/judgments/[id]", () => {
  it("happy path: 200 + labeled_at refreshed", async () => {
    state.updateResult = {
      data: { id: "j-1", relevance_grade: 3, labeled_at: "2026-05-04T01:00:00Z" },
      error: null,
    }
    const res = await PATCH(req({ relevanceGrade: 3 }), ctx)
    expect(res.status).toBe(200)
    const patch = state.lastPatch as Record<string, unknown>
    expect(patch.relevance_grade).toBe(3)
    expect(typeof patch.labeled_at).toBe("string")
  })

  it("relevanceGrade=5 → 400", async () => {
    const res = await PATCH(req({ relevanceGrade: 5 }), ctx)
    expect(res.status).toBe(400)
  })

  it("not found → 404", async () => {
    state.updateResult = { data: null, error: null }
    const res = await PATCH(req({ relevanceGrade: 2 }), ctx)
    expect(res.status).toBe(404)
  })

  it("non-admin → guard returns NextResponse 401/403", async () => {
    state.adminGate = NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const res = await PATCH(req({ relevanceGrade: 1 }), ctx)
    expect(res.status).toBe(401)
  })
})
