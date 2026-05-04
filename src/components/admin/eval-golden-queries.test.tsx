/**
 * Component tests for EvalGoldenQueries (T-014).
 *
 * Lightweight contract checks — backend logic is covered by route tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react"
import { EvalGoldenQueries } from "./eval-golden-queries"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

interface FetchCall { url: string; init?: RequestInit }

function installFetchMock(payload: { items: unknown[] }): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url, init })
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

describe("EvalGoldenQueries", () => {
  it("초기 마운트 시 /api/admin/eval/golden-queries fetch + 빈 상태 표시", async () => {
    const { calls } = installFetchMock({ items: [] })
    render(<EvalGoldenQueries />)

    await waitFor(() => {
      expect(screen.getByText("아직 골든셋 쿼리가 없습니다")).not.toBeNull()
    })

    expect(calls.some(c => c.url.startsWith("/api/admin/eval/golden-queries"))).toBe(true)
    expect(screen.getByRole("button", { name: /추가/ })).not.toBeNull()
  })

  it("items 존재 시 테이블 행 렌더링", async () => {
    installFetchMock({
      items: [
        {
          id: "g-1",
          instagram_url: "https://instagram.com/p/abc",
          query_signature: "minimal beige",
          intent_note: "minimalist outfit",
          created_by: "admin@team",
          algorithm_version: "v4",
          created_at: "2026-05-01T10:00:00.000Z",
        },
      ],
    })
    render(<EvalGoldenQueries />)

    await waitFor(() => {
      expect(screen.getByText("minimalist outfit")).not.toBeNull()
    })
    expect(screen.getByText("https://instagram.com/p/abc")).not.toBeNull()
    expect(screen.getByText("admin@team")).not.toBeNull()
  })

  it("'추가' 버튼 클릭 시 다이얼로그 오픈", async () => {
    installFetchMock({ items: [] })
    render(<EvalGoldenQueries />)

    await waitFor(() => expect(screen.getByText("아직 골든셋 쿼리가 없습니다")).not.toBeNull())

    fireEvent.click(screen.getByRole("button", { name: /추가/ }))

    await waitFor(() => {
      expect(screen.getByText("골든셋 쿼리 추가")).not.toBeNull()
    })
    // form fields visible
    expect(screen.getByPlaceholderText(/instagram.com/)).not.toBeNull()
    expect(screen.getByPlaceholderText(/admin@team/)).not.toBeNull()
  })
})
