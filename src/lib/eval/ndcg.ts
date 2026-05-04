// @MX:NOTE: [AUTO] NDCG@k 계산 — SPEC-V6-EVAL REQ-003. relevance_grade 0~3 정수, k 기본 10.

/**
 * Normalized Discounted Cumulative Gain at rank k.
 *
 * @param relevanceGrades - Ordered list of relevance grades (0~3) for ranked results.
 *                          Index 0 = top-ranked product.
 * @param k - Rank cutoff (default 10 per SPEC-V6-EVAL REQ-003).
 * @returns NDCG@k score in [0, 1]. Returns 0 when input is empty or no relevant items.
 */
export function computeNdcg(relevanceGrades: number[], k = 10): number {
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error("k must be a positive integer")
  }
  for (const g of relevanceGrades) {
    if (!Number.isInteger(g) || g < 0 || g > 3) {
      throw new Error("relevance_grade must be 0..3 integer")
    }
  }
  if (relevanceGrades.length === 0) return 0

  const dcg = dcgAtK(relevanceGrades, k)
  const ideal = [...relevanceGrades].sort((a, b) => b - a)
  const idcg = dcgAtK(ideal, k)

  if (idcg === 0) return 0
  return dcg / idcg
}

function dcgAtK(grades: number[], k: number): number {
  const limit = Math.min(k, grades.length)
  let sum = 0
  for (let i = 0; i < limit; i++) {
    const rel = grades[i]
    // gain = 2^rel - 1, discount = log2(i + 2) since rank is 1-indexed
    sum += (Math.pow(2, rel) - 1) / Math.log2(i + 2)
  }
  return sum
}
