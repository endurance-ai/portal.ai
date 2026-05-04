/**
 * Characterization tests for /admin/eval queue tab.
 *
 * SPEC-V6-EVAL Phase 2A PRESERVE — T-003.
 *
 * These tests capture the OBSERVABLE behavior of the current eval page as of
 * 2026-05-04. They are intentionally resilient to internal refactors (state
 * shape, hook structure) but MUST fail if user-visible contract changes:
 *   - tab labels rename
 *   - filter button labels change
 *   - fetch URL shape (`/api/admin/eval?page=&filter=`) changes
 *   - empty-state copy disappears
 *   - pagination button enable/disable rules change
 *
 * Do NOT modify production code to make these tests pass — if a test fails
 * after a refactor, decide whether the contract change is intentional and
 * update the test deliberately (and document in the commit).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, fireEvent, within } from "@testing-library/react"
import EvalPage from "../page"

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const EMPTY_QUEUE_RESPONSE = {
  metrics: {
    totalAnalyses: 0,
    reviewed: 0,
    pending: 0,
    verdictDist: { pass: 0, fail: 0, partial: 0 },
  },
  queue: [],
}

const THREE_ITEM_QUEUE_RESPONSE = {
  metrics: {
    totalAnalyses: 3,
    reviewed: 1,
    pending: 2,
    verdictDist: { pass: 1, fail: 0, partial: 0 },
  },
  queue: [
    {
      id: "q-001",
      created_at: "2026-04-30T10:00:00.000Z",
      image_filename: "a.jpg",
      prompt_text: "minimalist beige knit",
      style_node_primary: null,
      style_node_confidence: null,
      detected_gender: null,
      items: [],
      verdict: "pass",
      review_comment: null,
      reviews: [],
      is_pinned: false,
    },
    {
      id: "q-002",
      created_at: "2026-04-29T10:00:00.000Z",
      image_filename: "b.jpg",
      prompt_text: "olive cargo pants outfit",
      style_node_primary: null,
      style_node_confidence: null,
      detected_gender: null,
      items: [],
      verdict: null,
      review_comment: null,
      reviews: [],
      is_pinned: false,
    },
    {
      id: "q-003",
      created_at: "2026-04-28T10:00:00.000Z",
      image_filename: "c.jpg",
      prompt_text: "linen shirt summer fit",
      style_node_primary: null,
      style_node_confidence: null,
      detected_gender: null,
      items: [],
      verdict: null,
      review_comment: null,
      reviews: [],
      is_pinned: false,
    },
  ],
}

const TWENTY_ITEM_QUEUE_RESPONSE = {
  metrics: {
    totalAnalyses: 50,
    reviewed: 0,
    pending: 50,
    verdictDist: { pass: 0, fail: 0, partial: 0 },
  },
  // 20 items triggers the "queue.length >= 20" condition that ENABLES the next button
  queue: Array.from({ length: 20 }, (_, i) => ({
    id: `q-page-${i}`,
    created_at: "2026-04-28T10:00:00.000Z",
    image_filename: `${i}.jpg`,
    prompt_text: `prompt number ${i}`,
    style_node_primary: null,
    style_node_confidence: null,
    detected_gender: null,
    items: [],
    verdict: null,
    review_comment: null,
    reviews: [],
    is_pinned: false,
  })),
}

const EMPTY_GOLDEN_RESPONSE = { goldenSet: [] }

// --------------------------------------------------------------------------
// Fetch mock helpers
// --------------------------------------------------------------------------

interface FetchCall {
  url: string
  init?: RequestInit
}

function installFetchMock(routes: {
  evalQueue?: unknown
  goldenSet?: unknown
}): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url, init })

    if (url.startsWith("/api/admin/eval/golden-set")) {
      return new Response(JSON.stringify(routes.goldenSet ?? EMPTY_GOLDEN_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (url.startsWith("/api/admin/eval")) {
      return new Response(JSON.stringify(routes.evalQueue ?? EMPTY_QUEUE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch
  return { calls }
}

beforeEach(() => {
  installFetchMock({ evalQueue: EMPTY_QUEUE_RESPONSE, goldenSet: EMPTY_GOLDEN_RESPONSE })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("EvalPage — queue tab characterization (T-003)", () => {
  it("renders both main tabs '평가 대기열' and '골든셋', queue tab is default active", async () => {
    installFetchMock({ evalQueue: EMPTY_QUEUE_RESPONSE })
    render(<EvalPage />)

    // Wait for initial fetch to settle
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "평가 대기열" })).not.toBeNull()
    })

    expect(screen.getByRole("button", { name: "골든셋" })).not.toBeNull()
    expect(screen.getByRole("heading", { name: "품질 평가" })).not.toBeNull()

    // Queue tab default active → filter tabs ("전체"/"대기"/"완료") visible.
    // CHARACTERIZATION: Active tab is encoded in className only (border-turquoise),
    // not in aria-selected. We assert filter tabs presence as a proxy for "queue tab is active".
    expect(screen.getByRole("button", { name: "전체" })).not.toBeNull()
    // CHARACTERIZATION: Filter buttons "대기" / "완료" embed a count span as a sibling text node;
    // the accessible name in jsdom is the concatenated textContent. Match by textContent prefix.
    const allBtns = screen.getAllByRole("button")
    expect(allBtns.some((b) => b.textContent?.trim().startsWith("대기") && b.textContent.match(/\d/))).toBe(true)
    expect(allBtns.some((b) => b.textContent?.trim().startsWith("완료") && b.textContent.match(/\d/))).toBe(true)
  })

  it("empty queue: shows '항목이 없습니다' empty-state and zero metrics", async () => {
    installFetchMock({ evalQueue: EMPTY_QUEUE_RESPONSE })
    render(<EvalPage />)

    await waitFor(() => {
      expect(screen.getByText("항목이 없습니다")).not.toBeNull()
    })

    // Metric cards render: "전체 분석", "리뷰 완료", "리뷰 대기", "Pass율"
    expect(screen.getByText("전체 분석")).not.toBeNull()
    expect(screen.getByText("리뷰 완료")).not.toBeNull()
    expect(screen.getByText("리뷰 대기")).not.toBeNull()
    expect(screen.getByText("Pass율")).not.toBeNull()

    // Pass율 with zero reviewed → em-dash placeholder ("—")
    expect(screen.getByText("—")).not.toBeNull()
  })

  it("renders 3 queue items with prompt_text substrings visible", async () => {
    installFetchMock({ evalQueue: THREE_ITEM_QUEUE_RESPONSE })
    render(<EvalPage />)

    await waitFor(() => {
      expect(screen.getByText(/minimalist beige knit/)).not.toBeNull()
    })

    expect(screen.getByText(/olive cargo pants outfit/)).not.toBeNull()
    expect(screen.getByText(/linen shirt summer fit/)).not.toBeNull()

    // Empty-state copy must NOT appear
    expect(screen.queryByText("항목이 없습니다")).toBeNull()
  })

  it("filter buttons toggle and reset page; '완료' filter triggers verdict-dropdown UI", async () => {
    const { calls } = installFetchMock({ evalQueue: THREE_ITEM_QUEUE_RESPONSE })
    render(<EvalPage />)

    await waitFor(() => expect(screen.getByText(/minimalist beige knit/)).not.toBeNull())

    // Default fetch should be filter=all
    const initialAllCall = calls.find((c) => c.url.includes("/api/admin/eval?") && c.url.includes("filter=all"))
    expect(initialAllCall, "initial fetch should use filter=all").toBeDefined()

    // Click "완료" filter — locate by textContent (button name calculation is unreliable for mixed text+span)
    const reviewedBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.trim().startsWith("완료") && /\d/.test(b.textContent),
    )
    expect(reviewedBtn).toBeDefined()
    fireEvent.click(reviewedBtn!)

    await waitFor(() => {
      const reviewedCall = calls.find((c) => c.url.includes("filter=reviewed"))
      expect(reviewedCall, "click on 완료 should fetch with filter=reviewed").toBeDefined()
    })

    // The verdict multi-select dropdown trigger ("상태 전체") only renders when filter=reviewed
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /상태 전체|개 상태/ })).not.toBeNull()
    })
  })

  it("pagination: prev disabled at page 0; next enabled when queue.length >= 20", async () => {
    installFetchMock({ evalQueue: TWENTY_ITEM_QUEUE_RESPONSE })
    render(<EvalPage />)

    await waitFor(() => {
      expect(screen.getByText("1 페이지")).not.toBeNull()
    })

    // Two pagination icon buttons: prev (ChevronLeft) and next (ChevronRight).
    // CHARACTERIZATION: They have no accessible name — only a Lucide icon.
    // Locate them by class/role within the pagination row containing "1 페이지".
    const pageLabel = screen.getByText("1 페이지")
    const paginationRow = pageLabel.parentElement!
    const buttons = within(paginationRow).getAllByRole("button")
    expect(buttons).toHaveLength(2)
    const [prevBtn, nextBtn] = buttons

    expect(prevBtn.hasAttribute("disabled")).toBe(true)
    // queue.length === 20 → next is ENABLED (disabled = queue.length < 20)
    expect(nextBtn.hasAttribute("disabled")).toBe(false)
  })

  it("pagination: next disabled when queue.length < 20", async () => {
    installFetchMock({ evalQueue: THREE_ITEM_QUEUE_RESPONSE })
    render(<EvalPage />)

    await waitFor(() => expect(screen.getByText("1 페이지")).not.toBeNull())

    const paginationRow = screen.getByText("1 페이지").parentElement!
    const buttons = within(paginationRow).getAllByRole("button")
    const [prevBtn, nextBtn] = buttons

    expect(prevBtn.hasAttribute("disabled")).toBe(true)
    expect(nextBtn.hasAttribute("disabled")).toBe(true)
  })
})
