// @MX:ANCHOR: [AUTO] SearchEngine port — find/search calls this, not a concrete engine (SPEC-SEARCH-V6-001 §6/§10c REQ-V6-001)
// @MX:REASON: [AUTO] Single seam between /api/find/search and the sole v6 engine implementation; the route caller diff must stay 0 if the engine body ever changes again. SPEC-SEARCH-UNIFY-001 multi-engine machine retired (P2, AC-024) — interface preserved per §10c.
// @MX:SPEC: SPEC-SEARCH-V6-001
import "server-only"

/**
 * SPEC-SEARCH-V6-001 §10c — `SearchEngine` port (interface preserved, single
 * v6 implementation).
 *
 * `/api/find/search` calls `selectEngine().search(req)` instead of any
 * concrete engine. The sole engine (v6-adapter, embedding-first) implements
 * THIS interface. The SPEC-SEARCH-UNIFY-001 multi-engine selection machine
 * (v5/v4 adapters, circuit breaker, version env branching) was retired in P2
 * (§10b, AC-024); the port interface itself is kept on purpose as the clean
 * route↔engine seam (§10c HARD: interface preserved, machine removed).
 *
 * Contract shape mirrors the INFERRED ai `/recommend` working contract
 * (analyze.md section 4, Assumption A1 — app-side observed). The
 * find-search-route.test.ts regression net pins the route ENVELOPE + 400/200/
 * 502 gating + grouping against the v6 engine (re-pointed in P2 — the prior
 * v5-success byte-identity pin was retired with v5-adapter; SPEC §10b).
 *
 * Why the port returns pre-grouped `strongMatches`/`general` SearchProduct
 * groups (not raw candidates): the route owns only the outer HTTP envelope;
 * the engine owns the strong/general orchestration AND the `toSearchProduct`
 * translation, handing the route exactly the two group arrays it wraps.
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
 * envelope: `"v6"` (embedding-first) or `"v6-degraded"` (ratified §13 결정 1
 * category-only fallback — SPEC-SEARCH-V6-001 REQ-V6-034, surfaced via this
 * tag, no extra response field). `failed` signals total engine failure ->
 * the route maps it to its existing 502 `AI_SERVER_FAILED` contract (the
 * engine owns the general-path failure decision).
 */
export interface RecommendResponse {
  strongMatches: SearchProductGroup[]
  general: SearchProductGroup[]
  engine: string
  /** True => the general path failed entirely; route returns 502 AI_SERVER_FAILED (verbatim current behavior). */
  failed: boolean
}

/** The engine port. The sole v6-adapter implements this (§10c). */
export interface SearchEngine {
  readonly version: string
  search(req: RecommendRequest): Promise<RecommendResponse>
}
