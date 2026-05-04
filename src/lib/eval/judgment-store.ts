import "server-only"
import { supabase } from "@/lib/supabase"

// @MX:NOTE: [AUTO] judgment-store — SPEC-V6-EVAL REQ-002/REQ-003. service-role 클라이언트 사용 (RLS 우회: route handler가 admin 인증 선행).

export type AlgorithmVersion = "v4" | "v6"

export interface JudgmentRow {
  goldenQueryId: string
  productId: string
  relevanceGrade: 0 | 1 | 2 | 3
  labelerId: string
  algorithmVersion: AlgorithmVersion
  notes?: string | null
}

export interface JudgmentLoaded extends JudgmentRow {
  id: string
  labeledAt: string
}

interface JudgmentDbRow {
  id: string
  golden_query_id: string
  product_id: string
  relevance_grade: number
  labeler_id: string
  labeled_at: string
  algorithm_version: string
  notes: string | null
}

function mapRow(row: JudgmentDbRow): JudgmentLoaded {
  return {
    id: row.id,
    goldenQueryId: row.golden_query_id,
    productId: row.product_id,
    relevanceGrade: row.relevance_grade as 0 | 1 | 2 | 3,
    labelerId: row.labeler_id,
    labeledAt: row.labeled_at,
    algorithmVersion: row.algorithm_version as AlgorithmVersion,
    notes: row.notes,
  }
}

/**
 * Validates algorithmVersion is supported in this codebase.
 * v4: supported (current production)
 * v6: throws — SPEC-V6-CORE not yet delivered.
 *
 * @MX:TODO: [AUTO] v6 unblock when SPEC-V6-CORE merged (임베딩 풀배치 완료 시점).
 */
export function routeAlgorithmVersion(version: string): AlgorithmVersion {
  if (version === "v4") return "v4"
  if (version === "v6") {
    throw new Error(
      "algorithm_version 'v6' not yet supported — blocked until SPEC-V6-CORE merge",
    )
  }
  throw new Error(`unknown algorithm_version: ${version}`)
}

/**
 * Upsert a judgment row. Conflict target: (golden_query_id, product_id, algorithm_version).
 * Always updates labeled_at to NOW() (Open Question #4 frozen at DP1).
 */
export async function upsertJudgment(
  input: JudgmentRow,
): Promise<JudgmentLoaded> {
  if (
    !Number.isInteger(input.relevanceGrade) ||
    input.relevanceGrade < 0 ||
    input.relevanceGrade > 3
  ) {
    throw new Error("relevanceGrade must be integer in [0, 3]")
  }

  const payload = {
    golden_query_id: input.goldenQueryId,
    product_id: input.productId,
    relevance_grade: input.relevanceGrade,
    labeler_id: input.labelerId,
    algorithm_version: input.algorithmVersion,
    notes: input.notes ?? null,
    labeled_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("eval_judgments")
    .upsert(payload, {
      onConflict: "golden_query_id,product_id,algorithm_version",
    })
    .select()
    .single()

  if (error) {
    throw new Error(`upsertJudgment failed: ${error.message}`)
  }
  return mapRow(data as JudgmentDbRow)
}

/**
 * Load judgments for a (goldenQueryId, algorithmVersion) pair.
 *
 * - Without productOrder: returns full JudgmentLoaded[] in labeled_at ASC order.
 * - With productOrder: returns number[] of grades aligned to productOrder (missing → 0),
 *   suitable as direct input to computeNdcg / computePrecisionAtK.
 */
export async function loadJudgmentsForQuery(
  goldenQueryId: string,
  algorithmVersion: AlgorithmVersion,
  productOrder?: string[],
): Promise<number[] | JudgmentLoaded[]> {
  const { data, error } = await supabase
    .from("eval_judgments")
    .select("*")
    .eq("golden_query_id", goldenQueryId)
    .eq("algorithm_version", algorithmVersion)
    .order("labeled_at", { ascending: true })

  if (error) {
    throw new Error(`loadJudgmentsForQuery failed: ${error.message}`)
  }

  const rows = (data ?? []) as JudgmentDbRow[]
  const mapped = rows.map(mapRow)

  if (productOrder === undefined) {
    return mapped
  }

  const gradeByProduct = new Map<string, number>()
  for (const r of mapped) {
    gradeByProduct.set(r.productId, r.relevanceGrade)
  }
  return productOrder.map((pid) => gradeByProduct.get(pid) ?? 0)
}
