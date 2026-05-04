import { beforeEach, describe, expect, it, vi } from "vitest"

interface InsertCall {
  table: string
  payload: unknown
}

interface UpdateCall {
  table: string
  patch: unknown
  filterColumn: string | null
  filterValue: unknown
}

interface MockState {
  insertResult: { data: unknown; error: { message: string } | null }
  // Result for the latest-v4-aggregate lookup chain in freezeBaseline
  selectMaybeSingleResult: { data: unknown; error: { message: string } | null }
  updateResult: { data: unknown; error: { message: string } | null }
  insertCalls: InsertCall[]
  updateCalls: UpdateCall[]
  // judgment-store mock
  loadCalls: Array<{
    goldenQueryId: string
    algorithmVersion: string
    productOrder?: string[]
  }>
  // grade map keyed by goldenQueryId
  loadResults: Map<string, number[]>
}

const state: MockState = {
  insertResult: { data: null, error: null },
  selectMaybeSingleResult: { data: null, error: null },
  updateResult: { data: null, error: null },
  insertCalls: [],
  updateCalls: [],
  loadCalls: [],
  loadResults: new Map(),
}

function reset() {
  state.insertResult = { data: null, error: null }
  state.selectMaybeSingleResult = { data: null, error: null }
  state.updateResult = { data: null, error: null }
  state.insertCalls = []
  state.updateCalls = []
  state.loadCalls = []
  state.loadResults = new Map()
}

vi.mock("server-only", () => ({}))

vi.mock("./judgment-store", () => ({
  loadJudgmentsForQuery: vi.fn(
    async (
      goldenQueryId: string,
      algorithmVersion: string,
      productOrder?: string[],
    ) => {
      state.loadCalls.push({ goldenQueryId, algorithmVersion, productOrder })
      const grades = state.loadResults.get(goldenQueryId)
      if (grades) return grades
      // default: zero-fill
      return productOrder ? productOrder.map(() => 0) : []
    },
  ),
}))

vi.mock("@/lib/supabase", () => {
  // insert chain: from(t).insert(p).select().single()
  const buildInsertChain = (table: string, payload: unknown) => {
    state.insertCalls.push({ table, payload })
    return {
      select: () => ({
        single: async () => state.insertResult,
      }),
    }
  }

  // update chain: from(t).update(p).eq(c, v).select().single()
  const buildUpdateChain = (table: string, patch: unknown) => {
    const call: UpdateCall = {
      table,
      patch,
      filterColumn: null,
      filterValue: null,
    }
    state.updateCalls.push(call)
    return {
      eq(column: string, value: unknown) {
        call.filterColumn = column
        call.filterValue = value
        return {
          select: () => ({
            single: async () => state.updateResult,
          }),
        }
      },
    }
  }

  // select chain for freezeBaseline:
  //   from(t).select("*").eq().is().order().limit().maybeSingle()
  const buildSelectChain = () => {
    const chain: {
      eq: (c: string, v: unknown) => typeof chain
      is: (c: string, v: unknown) => typeof chain
      order: (c: string, opts: unknown) => typeof chain
      limit: (n: number) => typeof chain
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>
    } = {
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => state.selectMaybeSingleResult,
    }
    return chain
  }

  return {
    supabase: {
      from(table: string) {
        return {
          insert(payload: unknown) {
            return buildInsertChain(table, payload)
          },
          update(patch: unknown) {
            return buildUpdateChain(table, patch)
          },
          select() {
            return buildSelectChain()
          },
        }
      },
    },
  }
})

import { computeRun, freezeBaseline } from "./run-snapshot"

beforeEach(() => {
  reset()
})

describe("computeRun", () => {
  function mockInsertedRun(overrides: Record<string, unknown> = {}) {
    state.insertResult = {
      data: {
        id: "run-1",
        algorithm_version: "v4",
        golden_query_id: null,
        ndcg_at_10: 1.0,
        precision_at_5: 1.0,
        query_count: 0,
        judgment_count: 0,
        frozen: false,
        computed_at: "2026-05-04T00:00:00Z",
        notes: null,
        ...overrides,
      },
      error: null,
    }
  }

  it("rankedResults 2건 → loadJudgmentsForQuery 2회 호출 + eval_runs INSERT 1회", async () => {
    state.loadResults.set("q-1", [3, 3, 2, 1, 0, 0, 0, 0, 0, 0])
    state.loadResults.set("q-2", [3, 2, 1, 0, 0, 0, 0, 0, 0, 0])
    mockInsertedRun({ query_count: 2, judgment_count: 7 })

    await computeRun({
      algorithmVersion: "v4",
      rankedResults: [
        { goldenQueryId: "q-1", productOrder: Array(10).fill(0).map((_, i) => `p-1-${i}`) },
        { goldenQueryId: "q-2", productOrder: Array(10).fill(0).map((_, i) => `p-2-${i}`) },
      ],
    })

    expect(state.loadCalls).toHaveLength(2)
    expect(state.loadCalls[0].goldenQueryId).toBe("q-1")
    expect(state.loadCalls[1].goldenQueryId).toBe("q-2")
    expect(state.insertCalls).toHaveLength(1)
    expect(state.insertCalls[0].table).toBe("eval_runs")
  })

  it("aggregate 는 per-query mean: 두 쿼리 모두 perfect ranking → ndcg=1.0, precision=1.0", async () => {
    // perfect rankings for both queries
    state.loadResults.set("q-1", [3, 3, 3, 3, 3, 3, 3, 3, 3, 3])
    state.loadResults.set("q-2", [3, 3, 3, 3, 3, 3, 3, 3, 3, 3])
    mockInsertedRun()

    await computeRun({
      algorithmVersion: "v4",
      rankedResults: [
        { goldenQueryId: "q-1", productOrder: Array(10).fill("p") },
        { goldenQueryId: "q-2", productOrder: Array(10).fill("p") },
      ],
    })

    const payload = state.insertCalls[0].payload as Record<string, unknown>
    expect(payload.ndcg_at_10).toBe(1.0)
    expect(payload.precision_at_5).toBe(1.0)
    expect(payload.query_count).toBe(2)
    expect(payload.judgment_count).toBe(20)
    expect(payload.frozen).toBe(false)
    expect(payload.golden_query_id).toBeNull()
    expect(payload.algorithm_version).toBe("v4")
  })

  it("queryCount=총 쿼리 수, judgmentCount=labeled grade 합계 (grade>0 만 카운트)", async () => {
    state.loadResults.set("q-1", [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]) // 1 labeled
    state.loadResults.set("q-2", [2, 1, 0, 0, 0, 0, 0, 0, 0, 0]) // 2 labeled
    mockInsertedRun()

    await computeRun({
      algorithmVersion: "v4",
      rankedResults: [
        { goldenQueryId: "q-1", productOrder: Array(10).fill("p") },
        { goldenQueryId: "q-2", productOrder: Array(10).fill("p") },
      ],
    })

    const payload = state.insertCalls[0].payload as Record<string, unknown>
    expect(payload.query_count).toBe(2)
    expect(payload.judgment_count).toBe(3)
  })

  it("Supabase insert error (e.g., frozen baseline trigger) 를 throw 로 전파", async () => {
    state.loadResults.set("q-1", [3, 3, 3, 3, 3, 0, 0, 0, 0, 0])
    state.insertResult = {
      data: null,
      error: { message: "baseline already frozen for v4 aggregate" },
    }
    await expect(
      computeRun({
        algorithmVersion: "v4",
        rankedResults: [
          { goldenQueryId: "q-1", productOrder: Array(10).fill("p") },
        ],
      }),
    ).rejects.toThrowError(/baseline already frozen/)
  })

  it("빈 rankedResults → throw (계산할 쿼리 없음)", async () => {
    await expect(
      computeRun({ algorithmVersion: "v4", rankedResults: [] }),
    ).rejects.toThrowError(/at least one rankedResult/)
    expect(state.insertCalls).toHaveLength(0)
  })
})

describe("freezeBaseline", () => {
  it("기존 v4 aggregate row 를 찾아 frozen=true 로 UPDATE", async () => {
    state.selectMaybeSingleResult = {
      data: {
        id: "run-1",
        algorithm_version: "v4",
        golden_query_id: null,
        ndcg_at_10: 0.8,
        precision_at_5: 0.6,
        query_count: 30,
        judgment_count: 300,
        frozen: false,
        computed_at: "2026-05-04T00:00:00Z",
        notes: null,
      },
      error: null,
    }
    state.updateResult = {
      data: {
        id: "run-1",
        algorithm_version: "v4",
        golden_query_id: null,
        ndcg_at_10: 0.8,
        precision_at_5: 0.6,
        query_count: 30,
        judgment_count: 300,
        frozen: true,
        computed_at: "2026-05-04T00:00:00Z",
        notes: null,
      },
      error: null,
    }

    const result = await freezeBaseline()

    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].table).toBe("eval_runs")
    expect((state.updateCalls[0].patch as { frozen: boolean }).frozen).toBe(
      true,
    )
    expect(state.updateCalls[0].filterColumn).toBe("id")
    expect(state.updateCalls[0].filterValue).toBe("run-1")
    expect(result.frozen).toBe(true)
    expect(result.id).toBe("run-1")
  })

  it("v4 aggregate row 부재 → throw", async () => {
    state.selectMaybeSingleResult = { data: null, error: null }
    await expect(freezeBaseline()).rejects.toThrowError(
      /no v4 aggregate row/,
    )
    expect(state.updateCalls).toHaveLength(0)
  })
})
