import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const state = {
  freezeImpl: vi.fn(),
}

vi.mock("@/lib/admin-auth", () => ({
  requireApprovedAdmin: vi.fn(async () => ({ user: { id: "uid" } })),
}))

vi.mock("@/lib/eval/run-snapshot", () => ({
  freezeBaseline: () => state.freezeImpl(),
}))

import { POST } from "./route"

beforeEach(() => state.freezeImpl.mockReset())

describe("POST /api/admin/eval/freeze-baseline", () => {
  it("happy path → 200 with frozen=true row", async () => {
    state.freezeImpl.mockResolvedValueOnce({
      id: "run-1", algorithmVersion: "v4", goldenQueryId: null,
      ndcgAt10: 0.75, precisionAt5: 0.6, queryCount: 30, judgmentCount: 300, frozen: true,
      computedAt: "2026-05-04T00:00:00Z", notes: null,
    })
    const res = await POST()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.frozen).toBe(true)
  })

  it("no v4 aggregate row → 404", async () => {
    state.freezeImpl.mockRejectedValueOnce(new Error("freezeBaseline: no v4 aggregate row to freeze"))
    const res = await POST()
    expect(res.status).toBe(404)
  })

  it("already frozen → 409", async () => {
    state.freezeImpl.mockRejectedValueOnce(new Error("baseline already frozen for v4 aggregate"))
    const res = await POST()
    expect(res.status).toBe(409)
  })
})
