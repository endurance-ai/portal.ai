// @MX:ANCHOR: [AUTO] selectEngine registry — single seam consulted by find/search (SPEC-SEARCH-V6-001 §6/§10c)
// @MX:REASON: [AUTO] The single registration point. The route only ever calls selectEngine().search(req); collapsing to one engine here keeps that caller diff at 0. SPEC-SEARCH-UNIFY-001 version branching + circuit breaker retired (P2, AC-024); v6 is the sole engine per §10c.
// @MX:SPEC: SPEC-SEARCH-V6-001
import "server-only"
import type {SearchEngine} from "./engine-port"
import {v6Adapter} from "./adapters/v6-adapter"

/**
 * SPEC-SEARCH-V6-001 §10c — engine registry (single v6 engine).
 *
 * `selectEngine()` returns the sole `SearchEngine` implementation (v6-adapter,
 * embedding-first). The route only ever calls `selectEngine().search(req)`,
 * so the port seam is preserved even though the multi-engine machine is gone.
 *
 * Retired in P2 (SPEC-SEARCH-V6-001 §10b, AC-024 — SPEC-SEARCH-UNIFY-001
 * debt cleanup): the v5/v4 adapters, the circuit breaker, the version env
 * branching (`SEARCH_ENGINE_VERSION` / `EngineVersion` / `resolveEngineVersion`
 * / `selectEngineByVersion`), and the lazy v4 supabase deferral. v6 has no
 * fallback machine (REQ-V6-033): its ratified §13 결정 1 category-only
 * degrade lives inside `search_products_v6` (engine:"v6-degraded" provenance).
 *
 * v6-adapter is statically imported but keeps its DB chain (@/lib/supabase,
 * query-embed, style-nodes-db) behind LAZY imports inside `search()` — so
 * importing this module stays side-effect-free (the find-search-route net
 * does not mock supabase; @/lib/supabase throws at module-eval without DB
 * env). See v6-adapter.ts module-scope @MX:NOTE.
 */
export function selectEngine(): SearchEngine {
  return v6Adapter
}
