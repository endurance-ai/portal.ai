/**
 * Component tests for EvalRunsDashboard (T-014).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { EvalRunsDashboard } from "./eval-runs-dashboard"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

interface FetchCall { url: string }

function installFetchMock(payload: { items: unknown[] }): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url })
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
  return { calls }
}

beforeEach(() => {
  installFetchMock({ items: [] })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("EvalRunsDashboard", () => {
  it("초기 마운트 시 /api/admin/eval/runs fetch + 빈 상태", async () => {
    const { calls } = installFetchMock({ items: [] })
    render(<EvalRunsDashboard />)

    await waitFor(() => {
      expect(screen.getByText("아직 실행된 run 이 없습니다")).not.toBeNull()
    })
    expect(calls.some(c => c.url.startsWith("/api/admin/eval/runs"))).toBe(true)
  })

  it("v4 aggregate row 존재 시 latest NDCG/Precision 카드 표시", async () => {
    installFetchMock({
      items: [
        {
          id: "r-1",
          algorithm_version: "v4",
          golden_query_id: null,
          ndcg_at_10: 0.8523,
          precision_at_5: 0.7234,
          query_count: 30,
          judgment_count: 300,
          frozen: false,
          computed_at: "2026-05-01T10:00:00.000Z",
          notes: null,
        },
      ],
    })
    render(<EvalRunsDashboard />)

    await waitFor(() => {
      // value appears in both summary card AND table row
      expect(screen.getAllByText(/0\.8523/).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/0\.7234/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Freeze v4 Baseline/)).not.toBeNull()
  })

  it("frozen baseline 존재 시 Freeze 버튼 비표시 + BASELINE 배지 표시", async () => {
    installFetchMock({
      items: [
        {
          id: "r-1",
          algorithm_version: "v4",
          golden_query_id: null,
          ndcg_at_10: 0.85,
          precision_at_5: 0.72,
          query_count: 30,
          judgment_count: 300,
          frozen: true,
          computed_at: "2026-05-01T10:00:00.000Z",
          notes: null,
        },
      ],
    })
    render(<EvalRunsDashboard />)

    await waitFor(() => {
      expect(screen.getAllByText(/BASELINE/).length).toBeGreaterThan(0)
    })
    // Freeze button must NOT appear when already frozen
    expect(screen.queryByText(/Freeze v4 Baseline/)).toBeNull()
  })
})
