// @MX:ANCHOR: [AUTO] selectEngine registry — version→engine composition consulted by find/search (SPEC-SEARCH-UNIFY-001 REQ-SU-002/006)
// @MX:REASON: The single registration point. v6 drop-in = add a branch here + set SEARCH_ENGINE_VERSION=v6; route caller diff stays 0. Default must equal today's v5-direct and must NOT load the v4 supabase chain.
// @MX:SPEC: SPEC-SEARCH-UNIFY-001
import "server-only"
import type {
  EngineVersion,
  RecommendRequest,
  RecommendResponse,
  SearchEngine,
} from "./engine-port"
import {resolveEngineVersion} from "./engine-port"
import {v5Adapter} from "./adapters/v5-adapter"
import {v6Adapter} from "./adapters/v6-adapter"
import {CircuitBreaker} from "./circuit-breaker"

/**
 * SPEC-SEARCH-UNIFY-001 IMPROVE 5/6 — engine registry.
 *
 * `selectEngine` maps the resolved version to a `SearchEngine`. The route only
 * ever calls `selectEngine(...).search(req)` — adding v6 (or any future
 * engine) is a registry branch + an env value, ZERO route caller diff
 * (REQ-SU-006 forward-compat gate).
 *
 * v4 adapter is loaded LAZILY (dynamic import) — it transitively pulls
 * `@/lib/supabase` → `@/repositories/clients/postgrest` which THROWS at
 * module-eval without DB env. The DEFAULT v5-direct path must never load it
 * (byte-identity: the find-search-route PRESERVE net does not mock supabase,
 * and the prior inline route never imported the v4 chain). Lazy loading also
 * keeps the degraded fallback off the active path's load graph.
 *
 * Version semantics (analyze.md §2.2):
 *   v5-direct (DEFAULT, env unset) → v5 adapter ALONE. NO breaker, NO v4.
 *                                    Byte-identical to today's inline v5
 *                                    (502 on v5 failure). ROLLBACK default.
 *   v5                             → CircuitBreaker(v5, lazy v4 fallback).
 *   v4                             → v4 degraded fallback (lazy), forced.
 *   v6                             → v6 drop-in SEAM (stub; NOT in scope).
 */

async function loadV4Fallback(): Promise<SearchEngine> {
  const mod = await import("./adapters/v4-fallback-adapter")
  return mod.v4FallbackAdapter
}

/**
 * Thin lazy engine: defers the v4 (supabase-coupled) import until the first
 * `search()` call. Used for the forced `v4` version so `selectEngine` stays
 * synchronous and import-side-effect-free on non-v4 paths.
 */
const lazyV4Engine: SearchEngine = {
  version: "v4-degraded",
  async search(req: RecommendRequest): Promise<RecommendResponse> {
    const v4 = await loadV4Fallback()
    return v4.search(req)
  },
}

export function selectEngineByVersion(version: EngineVersion): SearchEngine {
  switch (version) {
    case "v5-direct":
      // DEFAULT: pure v5, no breaker, no fallback — today's exact behavior.
      // Does NOT reference the v4 module ⇒ supabase chain never loaded.
      return v5Adapter
    case "v5":
      // Opt-in: breaker fronts v5 with the LAZY v4 degraded fallback.
      return new CircuitBreaker(v5Adapter, loadV4Fallback)
    case "v4":
      return lazyV4Engine
    case "v6":
      return v6Adapter
  }
}

/**
 * Resolve `SEARCH_ENGINE_VERSION` (unset ⇒ v5-direct) and return the engine.
 * The only entry point the route calls.
 */
export function selectEngine(
  rawVersion: string | undefined = process.env.SEARCH_ENGINE_VERSION,
): SearchEngine {
  return selectEngineByVersion(resolveEngineVersion(rawVersion))
}
