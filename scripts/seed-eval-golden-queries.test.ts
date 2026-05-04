import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  ALGORITHM_VERSION,
  CREATED_BY,
  deriveRow,
  printCounts,
  seedGoldenQueries,
  type AnalysisRow,
  type SeedCounts,
} from "./seed-eval-golden-queries"

/**
 * Build a mock Supabase client whose:
 *   - .from("analyses").select(...).order(...).limit(N) → analysesRows
 *   - .from("eval_golden_queries").upsert(payload, opts).select(...).maybeSingle()
 *       → null if payload.query_signature ∈ existingSignatures (duplicate)
 *         else { id: <generated> } and adds to existingSignatures.
 */
function buildClient(opts: {
  analysesRows: AnalysisRow[]
  existingSignatures?: Set<string>
  analysesError?: { message: string } | null
  upsertError?: { message: string } | null
}) {
  const existing = opts.existingSignatures ?? new Set<string>()
  const upsertCalls: Array<{ payload: Record<string, unknown>; options: Record<string, unknown> }> = []
  let upsertCounter = 0

  const fakeClient = {
    from(table: string) {
      if (table === "analyses") {
        const chain = {
          select: () => chain,
          order: () => chain,
          limit: async () => ({
            data: opts.analysesError ? null : opts.analysesRows,
            error: opts.analysesError ?? null,
          }),
        }
        return chain as unknown as ReturnType<SupabaseClient["from"]>
      }

      if (table === "eval_golden_queries") {
        return {
          upsert(payload: Record<string, unknown>, options: Record<string, unknown>) {
            upsertCalls.push({ payload, options })
            const sig = String(payload.query_signature ?? "")
            const isDup = existing.has(sig)
            if (!isDup) existing.add(sig)
            return {
              select: () => ({
                maybeSingle: async () => {
                  if (opts.upsertError) {
                    return { data: null, error: opts.upsertError }
                  }
                  if (isDup) {
                    return { data: null, error: null }
                  }
                  upsertCounter += 1
                  return { data: { id: `golden-${upsertCounter}` }, error: null }
                },
              }),
            }
          },
        } as unknown as ReturnType<SupabaseClient["from"]>
      }

      throw new Error(`unexpected table: ${table}`)
    },
  } as unknown as SupabaseClient

  return { fakeClient, upsertCalls, existing }
}

function makeRow(id: number, opts: { prompt?: string | null; itemQuery?: string | null } = {}): AnalysisRow {
  return {
    id: `a-${id}`,
    prompt_text: opts.prompt ?? null,
    items: opts.itemQuery == null ? null : [{ searchQuery: opts.itemQuery }],
    image_filename: null,
  }
}

describe("deriveRow", () => {
  it("uses prompt_text when present", () => {
    const r = makeRow(1, { prompt: "bone-white knit fit" })
    expect(deriveRow(r)).toEqual({
      query_signature: "bone-white knit fit",
      intent_note: "bone-white knit fit",
    })
  })

  it("falls back to items[0].searchQuery when prompt empty", () => {
    const r = makeRow(2, { prompt: "  ", itemQuery: "denim wide jeans" })
    expect(deriveRow(r)).toEqual({
      query_signature: "denim wide jeans",
      intent_note: "denim wide jeans",
    })
  })

  it("returns null when both prompt and items are empty", () => {
    expect(deriveRow(makeRow(3, { prompt: null, itemQuery: null }))).toBeNull()
    expect(deriveRow(makeRow(4, { prompt: "", itemQuery: "" }))).toBeNull()
  })

  it("truncates intent_note to 200 chars from prompt", () => {
    const long = "x".repeat(500)
    const r = makeRow(5, { prompt: long })
    const derived = deriveRow(r)
    expect(derived?.intent_note.length).toBe(200)
    // signature keeps full prompt (raw signal — UNIQUE INDEX uses full string)
    expect(derived?.query_signature.length).toBe(500)
  })
})

describe("seedGoldenQueries — Scenario 3.x mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("Scenario 3.1: empty analyses → all zeros, no upsert calls", async () => {
    const { fakeClient, upsertCalls } = buildClient({ analysesRows: [] })
    const counts = await seedGoldenQueries(fakeClient)

    expect(counts).toEqual<SeedCounts>({
      total: 0,
      seeded: 0,
      skipped_duplicate: 0,
      skipped_invalid: 0,
    })
    expect(upsertCalls).toHaveLength(0)
  })

  it("Scenario 3.2 (first run): 30 valid rows → 30 seeded / 0 duplicate", async () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      makeRow(i, { prompt: `prompt ${i}` })
    )
    const { fakeClient, upsertCalls } = buildClient({ analysesRows: rows })
    const counts = await seedGoldenQueries(fakeClient)

    expect(counts).toEqual<SeedCounts>({
      total: 30,
      seeded: 30,
      skipped_duplicate: 0,
      skipped_invalid: 0,
    })
    expect(upsertCalls).toHaveLength(30)

    // Validate payload shape on a sample call
    expect(upsertCalls[0].payload).toMatchObject({
      instagram_url: null,
      query_signature: "prompt 0",
      intent_note: "prompt 0",
      created_by: CREATED_BY,
      algorithm_version: ALGORITHM_VERSION,
    })
    // onConflict target must match migration 033 line 33-34
    expect(upsertCalls[0].options).toMatchObject({
      onConflict: "instagram_url,query_signature",
      ignoreDuplicates: true,
    })
  })

  it("Scenario 3.2 (idempotent re-run): 30 duplicates → 0 seeded / 30 duplicate", async () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      makeRow(i, { prompt: `prompt ${i}` })
    )
    // Pre-populate existing signatures to simulate prior seed run
    const existing = new Set<string>(rows.map((_, i) => `prompt ${i}`))
    const { fakeClient } = buildClient({
      analysesRows: rows,
      existingSignatures: existing,
    })

    const counts = await seedGoldenQueries(fakeClient)

    expect(counts).toEqual<SeedCounts>({
      total: 30,
      seeded: 0,
      skipped_duplicate: 30,
      skipped_invalid: 0,
    })
  })

  it("Scenario 3.3: 5 rows (3 valid + 2 invalid) → 3 seeded / 2 invalid", async () => {
    const rows: AnalysisRow[] = [
      makeRow(1, { prompt: "valid prompt 1", itemQuery: "Q1" }),
      makeRow(2, { prompt: "valid prompt 2", itemQuery: "Q2" }),
      makeRow(3, { prompt: "valid prompt 3", itemQuery: "Q3" }),
      makeRow(4, { prompt: null, itemQuery: null }),
      makeRow(5, { prompt: "", itemQuery: "" }),
    ]
    const { fakeClient, upsertCalls } = buildClient({ analysesRows: rows })
    const counts = await seedGoldenQueries(fakeClient)

    expect(counts).toEqual<SeedCounts>({
      total: 5,
      seeded: 3,
      skipped_duplicate: 0,
      skipped_invalid: 2,
    })
    expect(upsertCalls).toHaveLength(3) // invalids never reach UPSERT
  })

  it("propagates analyses SELECT errors as throw", async () => {
    const { fakeClient } = buildClient({
      analysesRows: [],
      analysesError: { message: "permission denied" },
    })
    await expect(seedGoldenQueries(fakeClient)).rejects.toThrow(/analyses SELECT failed/)
  })

  it("propagates UPSERT error as throw on first failing row", async () => {
    const { fakeClient } = buildClient({
      analysesRows: [makeRow(1, { prompt: "p" })],
      upsertError: { message: "constraint violation" },
    })
    await expect(seedGoldenQueries(fakeClient)).rejects.toThrow(/eval_golden_queries UPSERT failed/)
  })
})

describe("printCounts canonical output (4 lines, fixed order)", () => {
  it("prints exactly the 4 expected lines in the canonical order", () => {
    const lines: string[] = []
    printCounts(
      {
        total: 30,
        seeded: 25,
        skipped_duplicate: 4,
        skipped_invalid: 1,
      },
      (l) => lines.push(l)
    )

    expect(lines).toEqual([
      "total candidates: 30",
      "seeded: 25",
      "skipped (duplicate): 4",
      "skipped (invalid): 1",
    ])
  })

  it("Scenario 3.1 zeros all rendered", () => {
    const lines: string[] = []
    printCounts(
      { total: 0, seeded: 0, skipped_duplicate: 0, skipped_invalid: 0 },
      (l) => lines.push(l)
    )
    expect(lines).toEqual([
      "total candidates: 0",
      "seeded: 0",
      "skipped (duplicate): 0",
      "skipped (invalid): 0",
    ])
  })
})
