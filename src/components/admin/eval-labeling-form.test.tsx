/**
 * Component tests for EvalLabelingForm — SPEC-V6-EVAL-V2 REQ-002a + REQ-002b.
 *
 * 검증 범위:
 * - REQ-002a: mount → judgmentRows 매핑 → grade 버튼 enable / 빈 응답 시 안내 + disabled 유지
 * - REQ-002b: grade 클릭 → 정확한 judgmentId 로 PATCH / 재클릭 시 동일 id 재호출 + 다른 카드 격리
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react"
import { EvalLabelingForm } from "./eval-labeling-form"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// next/image: jsdom 환경에서 fill / sizes prop 경고 회피용 stub
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt } = props as { src?: string; alt?: string }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} />
  },
}))

interface FetchCall {
  url: string
  init?: RequestInit
}

function installFetchMock(handler: (url: string, init?: RequestInit) => Response): {
  calls: FetchCall[]
} {
  const calls: FetchCall[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url, init })
    return handler(url, init)
  }) as typeof fetch
  return { calls }
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const RUN_RESPONSE_HAPPY = {
  rankedProducts: [
    {
      brand: "B1",
      title: "T1",
      link: "https://shop/p/A",
      imageUrl: "",
      price: "$10",
      platform: "P1",
    },
    {
      brand: "B2",
      title: "T2",
      link: "https://shop/p/B",
      imageUrl: "",
      price: "$20",
      platform: "P2",
    },
  ],
  judgmentRowsCreated: 2,
  judgmentRows: [
    { id: "J_A", productId: "P_A", productKey: "https://shop/p/A" },
    { id: "J_B", productId: "P_B", productKey: "https://shop/p/B" },
  ],
}

const RUN_RESPONSE_EMPTY = {
  rankedProducts: [
    {
      brand: "B1",
      title: "T1",
      link: "https://shop/p/A",
      imageUrl: "",
      price: "$10",
      platform: "P1",
    },
  ],
  judgmentRowsCreated: 0,
  judgmentRows: [],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("EvalLabelingForm — REQ-002a (mount mapping + grade enable)", () => {
  it("마운트 → judgmentRows 매핑 → 모든 grade 버튼 enabled", async () => {
    installFetchMock((url) => {
      if (url.includes("/api/admin/eval/run")) return jsonRes(RUN_RESPONSE_HAPPY)
      return jsonRes({})
    })
    render(<EvalLabelingForm goldenQueryId="Q1" algorithmVersion="v4" />)

    // 두 카드 렌더링 대기
    await waitFor(() => {
      expect(screen.getByText("T1")).not.toBeNull()
      expect(screen.getByText("T2")).not.toBeNull()
    })

    // 8 grade 버튼 (2 카드 × 4 grade) 모두 enabled
    const buttons = screen
      .getAllByRole("button")
      .filter((b) => /^[0-3]\s/.test(b.getAttribute("aria-label") ?? ""))
    expect(buttons.length).toBe(8)
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(false)
    }

    // "라벨링 가능한 상품이 없습니다" 안내는 표시되지 않음
    expect(screen.queryByText("라벨링 가능한 상품이 없습니다")).toBeNull()
  })

  it("빈 judgmentRows → 안내 표시 + grade 버튼 disabled 유지", async () => {
    installFetchMock((url) => {
      if (url.includes("/api/admin/eval/run")) return jsonRes(RUN_RESPONSE_EMPTY)
      return jsonRes({})
    })
    render(<EvalLabelingForm goldenQueryId="Q1" algorithmVersion="v4" />)

    await waitFor(() => {
      expect(screen.getByText("라벨링 가능한 상품이 없습니다")).not.toBeNull()
    })

    const buttons = screen
      .getAllByRole("button")
      .filter((b) => /^[0-3]\s/.test(b.getAttribute("aria-label") ?? ""))
    expect(buttons.length).toBe(4)
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    }
  })
})

describe("EvalLabelingForm — REQ-002b (click → PATCH)", () => {
  it("grade 클릭 → 정확한 judgmentId / body 로 PATCH 호출 + 다른 카드 격리", async () => {
    const { calls } = installFetchMock((url) => {
      if (url.includes("/api/admin/eval/run")) return jsonRes(RUN_RESPONSE_HAPPY)
      if (url.includes("/api/admin/eval/judgments/")) return jsonRes({ ok: true })
      return jsonRes({})
    })
    render(<EvalLabelingForm goldenQueryId="Q1" algorithmVersion="v4" />)

    await waitFor(() => {
      expect(screen.getByText("T1")).not.toBeNull()
    })

    // 첫 카드 grade=2 버튼 클릭
    const grade2Buttons = screen.getAllByLabelText("2 good")
    fireEvent.click(grade2Buttons[0])

    await waitFor(() => {
      const patchCalls = calls.filter((c) => c.init?.method === "PATCH")
      expect(patchCalls.length).toBe(1)
    })

    const patchCall = calls.find((c) => c.init?.method === "PATCH")!
    expect(patchCall.url).toBe("/api/admin/eval/judgments/J_A")
    expect(patchCall.init?.body).toBe(JSON.stringify({ relevanceGrade: 2 }))

    // 두 번째 카드(J_B) PATCH 미발생
    const jbPatch = calls.filter(
      (c) => c.init?.method === "PATCH" && c.url.includes("J_B"),
    )
    expect(jbPatch.length).toBe(0)
  })

  it("동일 카드 grade 재변경 → 동일 judgmentId 로 PATCH 재호출", async () => {
    const { calls } = installFetchMock((url) => {
      if (url.includes("/api/admin/eval/run")) return jsonRes(RUN_RESPONSE_HAPPY)
      if (url.includes("/api/admin/eval/judgments/")) return jsonRes({ ok: true })
      return jsonRes({})
    })
    render(<EvalLabelingForm goldenQueryId="Q1" algorithmVersion="v4" />)

    await waitFor(() => {
      expect(screen.getByText("T1")).not.toBeNull()
    })

    // 첫 클릭 grade=2
    fireEvent.click(screen.getAllByLabelText("2 good")[0])
    await waitFor(() => {
      expect(calls.filter((c) => c.init?.method === "PATCH").length).toBe(1)
    })

    // 재클릭 grade=3 (동일 카드)
    fireEvent.click(screen.getAllByLabelText("3 excellent")[0])
    await waitFor(() => {
      expect(calls.filter((c) => c.init?.method === "PATCH").length).toBe(2)
    })

    const patchCalls = calls.filter((c) => c.init?.method === "PATCH")
    // 모두 동일 judgmentId (J_A) 로 호출됨
    for (const c of patchCalls) {
      expect(c.url).toBe("/api/admin/eval/judgments/J_A")
    }
    expect(patchCalls[1].init?.body).toBe(JSON.stringify({ relevanceGrade: 3 }))

    // 다른 카드(J_B) PATCH 발생 안 함
    const jbPatch = patchCalls.filter((c) => c.url.includes("J_B"))
    expect(jbPatch.length).toBe(0)
  })
})
