// @MX:NOTE: [AUTO] Precision@k 계산 — SPEC-V6-EVAL REQ-003. relevance_grade>=threshold 를 relevant 로 간주, denominator=k.

/**
 * Precision at rank k. Treats relevance_grade >= relevanceThreshold as "relevant".
 *
 * Note: denominator is k (NOT min(k, len)) — partial rankings are penalized.
 *
 * @param relevanceGrades - Ordered list of relevance grades (0~3) for ranked results.
 * @param k - Rank cutoff (default 5 per SPEC-V6-EVAL REQ-003).
 * @param relevanceThreshold - Minimum grade to count as relevant (default 2 = "good").
 * @returns Precision in [0, 1].
 */
export function computePrecisionAtK(
  relevanceGrades: number[],
  k = 5,
  relevanceThreshold = 2,
): number {
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error("k must be a positive integer")
  }
  if (
    !Number.isInteger(relevanceThreshold) ||
    relevanceThreshold < 0 ||
    relevanceThreshold > 3
  ) {
    throw new Error("relevanceThreshold must be an integer in [0, 3]")
  }
  for (const g of relevanceGrades) {
    if (!Number.isInteger(g) || g < 0 || g > 3) {
      throw new Error("relevance_grade must be 0..3 integer")
    }
  }
  if (relevanceGrades.length === 0) return 0

  const limit = Math.min(k, relevanceGrades.length)
  let relevantCount = 0
  for (let i = 0; i < limit; i++) {
    if (relevanceGrades[i] >= relevanceThreshold) relevantCount++
  }
  return relevantCount / k
}
