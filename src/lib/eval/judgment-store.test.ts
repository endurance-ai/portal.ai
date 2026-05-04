import { beforeEach, describe, expect, it, vi } from "vitest"

// Chainable mock builder. Each test resets mockResult and inspects mockCalls.
interface MockState {
  upsertResult: { data: unknown; error: { message: string } | null }
  selectListResult: { data: unknown; error: { message: string } | null }
  lastFromTable: string | null
  lastUpsertPayload: unknown
  lastUpsertOptions: unknown
  lastSelectFilters: Array<{ column: string; value: unknown }>
  lastOrder: { column: string; ascending: boolean } | null
}

const state: MockState = {
  upsertResult: { data: null, error: null },
  selectListResult: { data: [], error: null },
  lastFromTable: null,
  lastUpsertPayload: null,
  lastUpsertOptions: null,
  lastSelectFilters: [],
  lastOrder: null,
}

function resetState() {
  state.upsertResult = { data: null, error: null }
  state.selectListResult = { data: [], error: null }
  state.lastFromTable = null
  state.lastUpsertPayload = null
  state.lastUpsertOptions = null
  state.lastSelectFilters = []
  state.lastOrder = null
}

vi.mock("server-only", () => ({}))

vi.mock("@/lib/supabase", () => {
  const buildUpsertChain = () => ({
    select: () => ({
      single: async () => state.upsertResult,
    }),
  })

  const buildSelectChain = () => {
    const chain: {
      eq: (column: string, value: unknown) => typeof chain
      order: (
        column: string,
        opts: { ascending: boolean },
      ) => Promise<{ data: unknown; error: unknown }>
    } = {
      eq(column: string, value: unknown) {
        state.lastSelectFilters.push({ column, value })
        return chain
      },
      order(column: string, opts: { ascending: boolean }) {
        state.lastOrder = { column, ascending: opts.ascending }
        return Promise.resolve(state.selectListResult)
      },
    }
    return chain
  }

  return {
    supabase: {
      from(table: string) {
        state.lastFromTable = table
        return {
          upsert(payload: unknown, options: unknown) {
            state.lastUpsertPayload = payload
            state.lastUpsertOptions = options
            return buildUpsertChain()
          },
          select() {
            return buildSelectChain()
          },
        }
      },
    },
  }
})

import {
  loadJudgmentsForQuery,
  routeAlgorithmVersion,
  upsertJudgment,
  type JudgmentRow,
} from "./judgment-store"

beforeEach(() => {
  resetState()
})

describe("routeAlgorithmVersion", () => {
  it("'v4' → 'v4' 통과", () => {
    expect(routeAlgorithmVersion("v4")).toBe("v4")
  })

  it("'v6' → SPEC-V6-CORE 미머지로 throw", () => {
    expect(() => routeAlgorithmVersion("v6")).toThrowError(/SPEC-V6-CORE/)
  })

  it("알 수 없는 값 → throw", () => {
    expect(() => routeAlgorithmVersion("garbage")).toThrowError(
      /unknown algorithm_version/,
    )
  })
})

describe("upsertJudgment", () => {
  const baseInput: JudgmentRow = {
    goldenQueryId: "q-1",
    productId: "p-1",
    relevanceGrade: 3,
    labelerId: "admin@test",
    algorithmVersion: "v4",
  }

  it("eval_judgments 테이블에 snake_case + onConflict 3-tuple 로 upsert 호출", async () => {
    state.upsertResult = {
      data: {
        id: "j-1",
        golden_query_id: "q-1",
        product_id: "p-1",
        relevance_grade: 3,
        labeler_id: "admin@test",
        labeled_at: "2026-05-04T00:00:00Z",
        algorithm_version: "v4",
        notes: null,
      },
      error: null,
    }

    const result = await upsertJudgment(baseInput)

    expect(state.lastFromTable).toBe("eval_judgments")
    const payload = state.lastUpsertPayload as Record<string, unknown>
    expect(payload.golden_query_id).toBe("q-1")
    expect(payload.product_id).toBe("p-1")
    expect(payload.relevance_grade).toBe(3)
    expect(payload.labeler_id).toBe("admin@test")
    expect(payload.algorithm_version).toBe("v4")
    expect(payload.notes).toBe(null)
    expect(typeof payload.labeled_at).toBe("string")
    expect(state.lastUpsertOptions).toEqual({
      onConflict: "golden_query_id,product_id,algorithm_version",
    })

    expect(result.id).toBe("j-1")
    expect(result.relevanceGrade).toBe(3)
    expect(result.labeledAt).toBe("2026-05-04T00:00:00Z")
  })

  it("Supabase error → throw", async () => {
    state.upsertResult = { data: null, error: { message: "RLS deny" } }
    await expect(upsertJudgment(baseInput)).rejects.toThrowError(/RLS deny/)
  })

  it("relevanceGrade=4 → DB 호출 전 입력 검증으로 throw", async () => {
    await expect(
      upsertJudgment({ ...baseInput, relevanceGrade: 4 as 0 | 1 | 2 | 3 }),
    ).rejects.toThrowError(/relevanceGrade/)
    expect(state.lastFromTable).toBeNull()
  })
})

describe("loadJudgmentsForQuery", () => {
  const mockRows = [
    {
      id: "j-A",
      golden_query_id: "q-1",
      product_id: "p-A",
      relevance_grade: 3,
      labeler_id: "admin",
      labeled_at: "2026-05-04T00:00:00Z",
      algorithm_version: "v4",
      notes: null,
    },
    {
      id: "j-B",
      golden_query_id: "q-1",
      product_id: "p-B",
      relevance_grade: 1,
      labeler_id: "admin",
      labeled_at: "2026-05-04T00:01:00Z",
      algorithm_version: "v4",
      notes: null,
    },
  ]

  it("productOrder 미지정 → 전체 JudgmentLoaded 배열 (camelCase 매핑)", async () => {
    state.selectListResult = { data: mockRows, error: null }

    const result = (await loadJudgmentsForQuery("q-1", "v4")) as Array<{
      id: string
      productId: string
      relevanceGrade: number
    }>

    expect(state.lastFromTable).toBe("eval_judgments")
    expect(state.lastSelectFilters).toEqual([
      { column: "golden_query_id", value: "q-1" },
      { column: "algorithm_version", value: "v4" },
    ])
    expect(state.lastOrder).toEqual({ column: "labeled_at", ascending: true })
    expect(result).toHaveLength(2)
    expect(result[0].productId).toBe("p-A")
    expect(result[0].relevanceGrade).toBe(3)
  })

  it("productOrder 지정 → 순서대로 grade 배열 반환, 누락 product 는 0", async () => {
    state.selectListResult = { data: mockRows, error: null }
    const grades = (await loadJudgmentsForQuery("q-1", "v4", [
      "p-B",
      "p-A",
      "p-MISSING",
    ])) as number[]
    expect(grades).toEqual([1, 3, 0])
  })

  it("빈 결과 + productOrder → 0 으로 채운 배열", async () => {
    state.selectListResult = { data: [], error: null }
    const grades = (await loadJudgmentsForQuery("q-1", "v4", [
      "p-X",
      "p-Y",
    ])) as number[]
    expect(grades).toEqual([0, 0])
  })

  it("빈 결과 + productOrder 미지정 → 빈 배열", async () => {
    state.selectListResult = { data: [], error: null }
    const result = (await loadJudgmentsForQuery("q-1", "v4")) as unknown[]
    expect(result).toEqual([])
  })

  it("Supabase error → throw", async () => {
    state.selectListResult = { data: null, error: { message: "boom" } }
    await expect(loadJudgmentsForQuery("q-1", "v4")).rejects.toThrowError(
      /boom/,
    )
  })
})
