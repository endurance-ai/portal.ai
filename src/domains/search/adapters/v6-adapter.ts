// @MX:NOTE: [AUTO] v6 drop-in SEAM STUB ONLY — NOT a v6 implementation (SPEC-SEARCH-UNIFY-001 REQ-SU-006)
// @MX:SPEC: SPEC-SEARCH-UNIFY-001
import "server-only"
import type {
  RecommendRequest,
  RecommendResponse,
  SearchEngine,
} from "../engine-port"

/**
 * SPEC-SEARCH-UNIFY-001 IMPROVE 5/6 — v6 drop-in SEAM STUB.
 *
 * This is NOT a v6 implementation. The user is actively developing v6 in a
 * separate effort (NOT in scope — spec "What NOT to Build"). This stub exists
 * ONLY to prove the REQ-SU-006 forward-compat acceptance gate: a v6 adapter
 * registered behind the identical `SearchEngine` port + `SEARCH_ENGINE_VERSION=v6`
 * routes through `/api/find/search` with ZERO caller diff.
 *
 * When the real v6 lands, its author replaces THIS file's body with the real
 * engine — same interface, same registry key, zero route change. The stub
 * surfaces a clearly-degraded failed response so it can never be mistaken for
 * a live engine if accidentally selected in production.
 */
export const v6Adapter: SearchEngine = {
  version: "v6",
  async search(_req: RecommendRequest): Promise<RecommendResponse> {
    // Stub: no engine wired. failed:true ⇒ route maps to its 502 contract.
    return {
      strongMatches: [],
      general: [],
      engine: "v6",
      failed: true,
    }
  },
}
