// @MX:ANCHOR: [AUTO] v4 searchByEnums orchestration — extracted & exported from search-products/route.ts (SPEC-ARCH-APP-001 REQ-APP-004)
// @MX:REASON: Public domain entry point for the v4 engine; thin route handler + SPEC-SEARCH-UNIFY-001 fallback adapter depend on this signature.
// @MX:SPEC: SPEC-ARCH-APP-001
import {fetchCandidates} from "./query-builder"
import {scoreRow, passesScoreFilter} from "./scorer"
import {rankAndCap} from "./ranker"
import type {SearchQuery, ScoredProduct, BrandDna} from "./types"

/**
 * v4 PAI-based enum-matching search for a single query item.
 * Verbatim composition of the route.ts `searchByEnums` pipeline:
 *   fetchCandidates (3 PostgREST paths + merge) → scoreRow + filter → rank/cap.
 */
export async function searchByEnums(
  item: SearchQuery,
  genderFilter: string | null,
  dbCategories: string[] | null,
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
  moodTags: string[] | undefined,
  priceFilter: { minPrice?: number; maxPrice?: number } | undefined,
  itemKeywords: string[],
  brandDnaMap: Map<string, BrandDna>,
  brandFilter: string[] | null,
): Promise<ScoredProduct[]> {
  const merged = await fetchCandidates(item, genderFilter, dbCategories, priceFilter, brandFilter)

  if (!merged.length) return []

  const scored = merged
    .map((row) =>
      scoreRow(
        row,
        item,
        genderFilter,
        primaryNode,
        secondaryNode,
        moodTags,
        priceFilter,
        itemKeywords,
        brandDnaMap,
      ),
    )
    .filter((p): p is ScoredProduct => passesScoreFilter(p, item))

  return rankAndCap(scored, item, brandFilter)
}
