import "server-only"
import { supabase } from "@/lib/supabase"
import { computeNdcg } from "./ndcg"
import { computePrecisionAtK } from "./precision"
import {
  loadJudgmentsForQuery,
  type AlgorithmVersion,
} from "./judgment-store"

// @MX:NOTE: [AUTO] run-snapshot — eval_runs aggregate row contract: golden_query_id IS NULL
//           means cross-query aggregate. Per-query snapshots use non-NULL golden_query_id.
//           Frozen baseline trigger (migration 033) enforces single v4 aggregate frozen row.

export interface RunResult {
  id: string
  algorithmVersion: AlgorithmVersion
  goldenQueryId: string | null
  ndcgAt10: number
  precisionAt5: number
  queryCount: number
  judgmentCount: number
  frozen: boolean
  computedAt: string
  notes?: string | null
}

export interface ComputeRunInput {
  algorithmVersion: AlgorithmVersion
  rankedResults: Array<{
    goldenQueryId: string
    productOrder: string[]
  }>
  notes?: string
}

interface RunDbRow {
  id: string
  algorithm_version: string
  golden_query_id: string | null
  ndcg_at_10: number | string
  precision_at_5: number | string
  query_count: number
  judgment_count: number
  frozen: boolean
  computed_at: string
  notes: string | null
}

function mapRunRow(row: RunDbRow): RunResult {
  return {
    id: row.id,
    algorithmVersion: row.algorithm_version as AlgorithmVersion,
    goldenQueryId: row.golden_query_id,
    ndcgAt10:
      typeof row.ndcg_at_10 === "string"
        ? Number(row.ndcg_at_10)
        : row.ndcg_at_10,
    precisionAt5:
      typeof row.precision_at_5 === "string"
        ? Number(row.precision_at_5)
        : row.precision_at_5,
    queryCount: row.query_count,
    judgmentCount: row.judgment_count,
    frozen: row.frozen,
    computedAt: row.computed_at,
    notes: row.notes,
  }
}

/**
 * Compute aggregate NDCG@10 + Precision@5 across all golden queries for the given algorithm.
 * Inserts ONE eval_runs row with golden_query_id=NULL (aggregate).
 *
 * Process:
 * 1. For each rankedResult: load judgments aligned to productOrder
 * 2. Compute per-query NDCG@10 + Precision@5
 * 3. Aggregate via mean across queries that have at least one judgment
 * 4. INSERT eval_runs row
 */
export async function computeRun(input: ComputeRunInput): Promise<RunResult> {
  if (input.rankedResults.length === 0) {
    throw new Error("computeRun requires at least one rankedResult")
  }

  let ndcgSum = 0
  let precisionSum = 0
  let scoredQueryCount = 0
  let totalJudgments = 0

  for (const rr of input.rankedResults) {
    const grades = (await loadJudgmentsForQuery(
      rr.goldenQueryId,
      input.algorithmVersion,
      rr.productOrder,
    )) as number[]

    const labeledCount = grades.filter((g) => g > 0).length
    totalJudgments += labeledCount

    if (labeledCount === 0) {
      continue
    }

    ndcgSum += computeNdcg(grades, 10)
    precisionSum += computePrecisionAtK(grades, 5, 2)
    scoredQueryCount += 1
  }

  const ndcgAt10 = scoredQueryCount > 0 ? ndcgSum / scoredQueryCount : 0
  const precisionAt5 =
    scoredQueryCount > 0 ? precisionSum / scoredQueryCount : 0

  const payload = {
    algorithm_version: input.algorithmVersion,
    golden_query_id: null,
    ndcg_at_10: Number(ndcgAt10.toFixed(4)),
    precision_at_5: Number(precisionAt5.toFixed(4)),
    query_count: input.rankedResults.length,
    judgment_count: totalJudgments,
    frozen: false,
    notes: input.notes ?? null,
  }

  const { data, error } = await supabase
    .from("eval_runs")
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw new Error(`computeRun insert failed: ${error.message}`)
  }
  return mapRunRow(data as RunDbRow)
}

/**
 * Mark the most recent v4 aggregate baseline row as frozen=true.
 * Throws if no v4 aggregate row exists. The DB trigger handles re-freeze rejection.
 */
export async function freezeBaseline(): Promise<RunResult> {
  // Locate latest v4 aggregate row
  const { data: existing, error: selectError } = await supabase
    .from("eval_runs")
    .select("*")
    .eq("algorithm_version", "v4")
    .is("golden_query_id", null)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (selectError) {
    throw new Error(`freezeBaseline lookup failed: ${selectError.message}`)
  }
  if (!existing) {
    throw new Error("freezeBaseline: no v4 aggregate row to freeze")
  }

  const existingRow = existing as RunDbRow

  const { data, error } = await supabase
    .from("eval_runs")
    .update({ frozen: true })
    .eq("id", existingRow.id)
    .select()
    .single()

  if (error) {
    throw new Error(`freezeBaseline update failed: ${error.message}`)
  }
  return mapRunRow(data as RunDbRow)
}
