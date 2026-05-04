/**
 * Characterization tests for /admin/eval golden set tab.
 *
 * SPEC-V6-EVAL Phase 2A PRESERVE — T-004.
 *
 * Captures observable behavior of the golden set tab on EvalPage:
 *   - tab activation switches to EvalGoldenSet and triggers /api/admin/eval/golden-set fetch
 *   - empty state copy
 *   - rendering of items (image, expected_node_primary, expected_items count)
 *   - delete-confirmation dialog presence
 *
 * CHARACTERIZATION NOTES:
 *   - The golden set tab does NOT have an "Add" / "추가" button. Items are
 *     populated by checking "Golden Set에 추가" inside the review detail page,
 *     per the empty-state copy. We capture that absence below.
 *   - Delete is per-item (trash icon, opacity-0 hover-revealed) → opens
 *     a Dialog with "골든셋에서 제거" title.
 *
 * Do NOT modify production code to make these tests pass.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react"
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

const EMPTY_GOLDEN_RESPONSE = { goldenSet: [] }

const TWO_ITEM_GOLDEN_RESPONSE = {
  goldenSet: [
    {
      id: "g-001",
      analysis_id: "a-001",
      image_url: "https://example.com/a.jpg",
      expected_node_primary: "Minimal",
      expected_node_secondary: "Clean",
      expected_items: [
        { category: "knit", color: "beige" },
        { category: "pants", color: "black" },
      ],
      test_type: "regression",
      notes: "first golden item",
      added_by: "alice@example.com",
      created_at: "2026-04-30T10:00:00.000Z",
    },
    {
      id: "g-002",
      analysis_id: "a-002",
      image_url: "https://example.com/b.jpg",
      expected_node_primary: "Street",
      expected_node_secondary: null,
      expected_items: [{ category: "tee", color: "white" }],
      test_type: null,
      notes: null,
      added_by: "bob@example.com",
      created_at: "2026-04-29T10:00:00.000Z",
    },
  ],
}

// --------------------------------------------------------------------------
// Fetch mock
// --------------------------------------------------------------------------

interface FetchCall {
  url: string
}

function installFetchMock(routes: {
  evalQueue?: unknown
  goldenSet?: unknown
}): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url })

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
  installFetchMock({})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("EvalPage — golden set tab characterization (T-004)", () => {
  it("clicking '골든셋' tab triggers fetch to /api/admin/eval/golden-set", async () => {
    const { calls } = installFetchMock({
      evalQueue: EMPTY_QUEUE_RESPONSE,
      goldenSet: EMPTY_GOLDEN_RESPONSE,
    })
    render(<EvalPage />)

    // Wait for queue tab initial fetch to land
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "골든셋" })).not.toBeNull()
    })

    // Before clicking, golden-set endpoint should NOT have been called yet
    // (EvalGoldenSet fetches on mount, which only happens once tab switches)
    expect(calls.find((c) => c.url.startsWith("/api/admin/eval/golden-set"))).toBeUndefined()

    fireEvent.click(screen.getByRole("button", { name: "골든셋" }))

    await waitFor(() => {
      expect(
        calls.find((c) => c.url.startsWith("/api/admin/eval/golden-set")),
      ).toBeDefined()
    })
  })

  it("empty golden set: shows '아직 골든셋이 없습니다' empty-state with hint", async () => {
    installFetchMock({
      evalQueue: EMPTY_QUEUE_RESPONSE,
      goldenSet: EMPTY_GOLDEN_RESPONSE,
    })
    render(<EvalPage />)

    await waitFor(() => expect(screen.getByRole("button", { name: "골든셋" })).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: "골든셋" }))

    await waitFor(() => {
      expect(screen.getByText("아직 골든셋이 없습니다")).not.toBeNull()
    })

    // Hint copy guides user to the review detail page (no "Add" button on this tab)
    expect(
      screen.getByText(/품질 평가에서.*Golden Set에 추가.*체크하면 여기에 표시됩니다/),
    ).not.toBeNull()
  })

  it("renders 2 golden items with expected_node_primary and item-count", async () => {
    installFetchMock({
      evalQueue: EMPTY_QUEUE_RESPONSE,
      goldenSet: TWO_ITEM_GOLDEN_RESPONSE,
    })
    render(<EvalPage />)

    await waitFor(() => expect(screen.getByRole("button", { name: "골든셋" })).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: "골든셋" }))

    await waitFor(() => {
      expect(screen.getByText("Minimal")).not.toBeNull()
    })

    expect(screen.getByText("Street")).not.toBeNull()
    expect(screen.getByText("Clean")).not.toBeNull() // secondary node

    // expected_items count is rendered as "{N} 아이템"
    expect(screen.getByText("2 아이템")).not.toBeNull()
    expect(screen.getByText("1 아이템")).not.toBeNull()

    // Empty-state copy must NOT appear
    expect(screen.queryByText("아직 골든셋이 없습니다")).toBeNull()
  })

  it("CHARACTERIZATION: golden tab has NO 'add' button — items must be created from review detail page", async () => {
    installFetchMock({
      evalQueue: EMPTY_QUEUE_RESPONSE,
      goldenSet: TWO_ITEM_GOLDEN_RESPONSE,
    })
    render(<EvalPage />)

    await waitFor(() => expect(screen.getByRole("button", { name: "골든셋" })).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: "골든셋" }))

    await waitFor(() => expect(screen.getByText("Minimal")).not.toBeNull())

    // No button labelled "추가" or "Add" on the golden set tab
    expect(screen.queryByRole("button", { name: /^추가$/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Add$/i })).toBeNull()
  })

  it("delete dialog: opens with title '골든셋에서 제거' on per-item delete trigger", async () => {
    installFetchMock({
      evalQueue: EMPTY_QUEUE_RESPONSE,
      goldenSet: TWO_ITEM_GOLDEN_RESPONSE,
    })
    render(<EvalPage />)

    await waitFor(() => expect(screen.getByRole("button", { name: "골든셋" })).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: "골든셋" }))

    await waitFor(() => expect(screen.getByText("Minimal")).not.toBeNull())

    // Delete buttons are icon-only (Trash2). They live next to ExternalLink anchor.
    // CHARACTERIZATION: They have no accessible name (no aria-label), only a destructive
    // text-color class. We locate them by class signature among rendered buttons.
    const allButtons = screen.getAllByRole("button")
    const trashCandidates = allButtons.filter((b) =>
      b.className.includes("text-destructive"),
    )
    // 2 items × 1 trash button each = 2 candidates
    expect(trashCandidates.length).toBe(2)

    fireEvent.click(trashCandidates[0])

    await waitFor(() => {
      expect(screen.getByText("골든셋에서 제거")).not.toBeNull()
    })
    // Dialog body copy
    expect(screen.getByText("이 항목을 골든셋에서 제거할까요?")).not.toBeNull()
    // Dialog action buttons
    expect(screen.getByRole("button", { name: "취소" })).not.toBeNull()
    expect(screen.getByRole("button", { name: "제거" })).not.toBeNull()
  })
})
