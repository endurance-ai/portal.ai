// @MX:ANCHOR: [AUTO] versioned SearchEngine port — find/search calls this, not a concrete engine (SPEC-SEARCH-UNIFY-001 REQ-SU-001)
// @MX:REASON: Single seam between /api/find/search and {v5 active / v4 degraded fallback / v6 drop-in}; caller diff must stay 0 across engine swaps.
// @MX:SPEC: SPEC-SEARCH-UNIFY-001
import "server-only"

/**
 * SPEC-SEARCH-UNIFY-001 — versioned `SearchEngine` port.
 *
 * `/api/find/search` calls `selectEngine(version).search(req)` instead of any
 * concrete engine. The active engine (v5), the degraded fallback (v4), and a
 * future drop-in (v6) all implement THIS interface — zero caller change.
 *
 * Contract shape mirrors the INFERRED ai `/recommend` working contract
 * (analyze.md section 4, Assumption A1 — app-side observed, ai repo NOT read).
 * The PRESERVE 1 regression net (find-search-route.test.ts, 13 tests) is the
 * enforcement mechanism for v5-success byte-identity.
 *
 * Why the port returns pre-grouped `strongMatches`/`general` SearchProduct
 * groups (not raw candidates): the route TODAY owns both the strong/general
 * Promise.all orchestration AND the `toSearchProduct` envelope translation
 * inline (route.ts:151-198). To keep the v5-success envelope byte-identical,
 * the v5-adapter reproduces that orchestration+translation verbatim and hands
 * the route exactly the two group arrays it already emits. The route then
 * only wraps them in the outer envelope.
 */

/** One product as the find-result UI consumes it (route envelope slot). */
export interface SearchProduct {
  brand: string
  title: string
  price: string
  platform: string
  imageUrl: string
  link: string
}

/** A result group (`strong` or `general`) as the route envelope wraps it. */
export interface SearchProductGroup {
  id: string
  products: SearchProduct[]
}

/**
 * Engine request — assembled by the route from the find/search body AFTER
 * input validation + IG-handle->brand resolution. Mirrors the observed
 * `commonAI` + strong/general split (analyze.md section 4.1). The engine owns
 * the strong-vs-general call decision internally (driven by `brandFilter`).
 */
export interface RecommendRequest {
  item: {
    id: string
    category: string
    subcategory?: string
    fit?: string
    fabric?: string
    colorFamily?: string
    searchQuery: string
    searchQueryKo?: string
  }
  imageUrl: string
  gender?: string
  styleNode?: {primary: string; secondary?: string}
  moodTags?: string[]
  priceFilter?: {minPrice?: number; maxPrice?: number}
  /** Resolved brand names from taggedHandles. Non-empty => engine also runs the "strong" call. */
  brandFilter: string[]
  /** Tolerance for the brand-filtered "strong" call (route default 0.5). */
  strongTolerance: number
  /** Tolerance for the always-run "general" call (route default 0.5). */
  generalTolerance: number
}

/**
 * Engine response. Empty array means "ran, no results" (matches the route's
 * `results.length > 0 ? [...] : []` shape).
 *
 * `engine` is the observable provenance tag the route echoes into its
 * envelope: `"v5"` (active, byte-identical), `"v4-degraded"` (fallback),
 * future `"v6"`. `failed` signals total engine failure -> the route maps it
 * to its existing 502 `AI_SERVER_FAILED` contract (only `general` failure
 * gated 200/502 today; the engine owns that decision now).
 */
export interface RecommendResponse {
  strongMatches: SearchProductGroup[]
  general: SearchProductGroup[]
  engine: string
  /** True => the general path failed entirely; route returns 502 AI_SERVER_FAILED (verbatim current behavior). */
  failed: boolean
}

/** The versioned engine port. All adapters (v5/v4/v6) implement this. */
export interface SearchEngine {
  readonly version: string
  search(req: RecommendRequest): Promise<RecommendResponse>
}

/**
 * Global single active version. `SEARCH_ENGINE_VERSION` unset => `v5-direct`
 * (today's reality: inline v5, 502 on failure, NO circuit breaker, NO v4
 * fallback). The breaker + v4 fallback only engage when the env opts in.
 */
export type EngineVersion = "v5-direct" | "v5" | "v4" | "v6"

export function resolveEngineVersion(
  raw: string | undefined,
): EngineVersion {
  if (raw === "v5" || raw === "v4" || raw === "v6") return raw
  // unset / unknown => v5-direct (single-env-toggle rollback default)
  return "v5-direct"
}
