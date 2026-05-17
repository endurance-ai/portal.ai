// @MX:ANCHOR: [AUTO] v5 circuit breaker — closed/open/half-open over v5 with v4 degraded fallback (SPEC-SEARCH-UNIFY-001 REQ-SU-005)
// @MX:REASON: Gates whether v4 degraded engages; CB_ENABLED=false is the no-downtime rollback lever back to pure v5-direct. Wrong state logic ⇒ silent quality regression.
// @MX:SPEC: SPEC-SEARCH-UNIFY-001
import "server-only"
import {logger} from "@/lib/logger"
import type {
  RecommendRequest,
  RecommendResponse,
  SearchEngine,
} from "./engine-port"

/**
 * SPEC-SEARCH-UNIFY-001 IMPROVE 4/6 — circuit breaker.
 *
 * Wraps the v5 (active) engine with the v4 (degraded) fallback. State machine
 * (analyze.md §2.2):
 *
 *   closed    → v5.search(req)
 *                  success      → reset failure count, return v5 result
 *                  failed/throw → failure++ ; if ≥ threshold ⇒ OPEN
 *                               → v4 fallback (engine:"v4-degraded")
 *   open      → fast-fail, no v5 call → v4 fallback
 *                  after cooldown elapsed → HALF-OPEN on next call
 *   half-open → probe v5 once
 *                  success → CLOSE (reset)
 *                  fail    → re-OPEN (restart cooldown) → v4 fallback
 *
 * `CB_ENABLED=false` ⇒ breaker bypassed entirely: pure v5 pass-through, NO
 * v4 fallback, NO state. This is the single-env no-downtime ROLLBACK lever
 * back to today's v5-direct reality (502 on v5 failure).
 *
 * Env config (read at module scope — same const-at-import semantics as the
 * rest of the search stack):
 *   CB_ENABLED            (default "true";  "false" ⇒ bypass)
 *   CB_FAILURE_THRESHOLD  (default 5)
 *   CB_COOLDOWN_MS        (default 30000)
 */

const CB_ENABLED = (process.env.CB_ENABLED ?? "true") !== "false"
const CB_FAILURE_THRESHOLD = Number(process.env.CB_FAILURE_THRESHOLD ?? "5")
const CB_COOLDOWN_MS = Number(process.env.CB_COOLDOWN_MS ?? "30000")

export type BreakerState = "closed" | "open" | "half-open"

export interface BreakerConfig {
  enabled: boolean
  failureThreshold: number
  cooldownMs: number
  /** Injectable clock for deterministic tests (default Date.now). */
  now?: () => number
}

const DEFAULT_CONFIG: BreakerConfig = {
  enabled: CB_ENABLED,
  failureThreshold: CB_FAILURE_THRESHOLD,
  cooldownMs: CB_COOLDOWN_MS,
}

/**
 * A circuit breaker that is itself a SearchEngine. `version` reflects the
 * active engine it fronts ("v5"); the response `engine` tag is whatever the
 * delegated engine returns ("v5" on success, "v4-degraded" on fallback).
 */
export class CircuitBreaker implements SearchEngine {
  readonly version = "v5"

  private state: BreakerState = "closed"
  private failureCount = 0
  private openedAt = 0
  private readonly cfg: BreakerConfig
  private readonly now: () => number

  constructor(
    private readonly primary: SearchEngine,
    private readonly fallback: SearchEngine,
    config: Partial<BreakerConfig> = {},
  ) {
    this.cfg = {...DEFAULT_CONFIG, ...config}
    this.now = this.cfg.now ?? (() => Date.now())
  }

  getState(): BreakerState {
    return this.state
  }

  private open(): void {
    this.state = "open"
    this.openedAt = this.now()
    logger.warn(
      `[find/search][circuit-breaker] OPEN — v5 failures ≥ ${this.cfg.failureThreshold}; fast-failing to v4 degraded for ${this.cfg.cooldownMs}ms`,
    )
  }

  private close(): void {
    if (this.state !== "closed") {
      logger.info(`[find/search][circuit-breaker] CLOSE — v5 recovered`)
    }
    this.state = "closed"
    this.failureCount = 0
  }

  /** v5 result counts as a "failure" for the breaker iff failed === true. */
  private async tryPrimary(
    req: RecommendRequest,
  ): Promise<{ok: boolean; res: RecommendResponse | null}> {
    try {
      const res = await this.primary.search(req)
      return {ok: !res.failed, res}
    } catch (err) {
      logger.warn(
        `[find/search][circuit-breaker] v5 threw — ${(err as Error).message}`,
      )
      return {ok: false, res: null}
    }
  }

  async search(req: RecommendRequest): Promise<RecommendResponse> {
    // Rollback lever: bypass breaker entirely ⇒ pure v5 pass-through.
    // Reproduces today's v5-direct reality (502 on v5 failure, no v4).
    if (!this.cfg.enabled) {
      return this.primary.search(req)
    }

    // OPEN: if cooldown elapsed, transition to half-open and probe;
    // otherwise fast-fail to the degraded fallback.
    if (this.state === "open") {
      if (this.now() - this.openedAt >= this.cfg.cooldownMs) {
        this.state = "half-open"
        logger.info(
          `[find/search][circuit-breaker] HALF-OPEN — cooldown elapsed, probing v5`,
        )
      } else {
        return this.fallback.search(req)
      }
    }

    // HALF-OPEN: single probe. Success ⇒ close. Fail ⇒ re-open + fallback.
    if (this.state === "half-open") {
      const {ok, res} = await this.tryPrimary(req)
      if (ok && res) {
        this.close()
        return res
      }
      this.open()
      return this.fallback.search(req)
    }

    // CLOSED: normal path.
    const {ok, res} = await this.tryPrimary(req)
    if (ok && res) {
      this.failureCount = 0
      return res
    }
    this.failureCount += 1
    if (this.failureCount >= this.cfg.failureThreshold) {
      this.open()
    }
    return this.fallback.search(req)
  }
}
