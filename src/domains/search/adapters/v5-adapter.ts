// @MX:ANCHOR: [AUTO] v5 active SearchEngine adapter — verbatim extract of route.ts callAIServer + toSearchProduct + strong/general grouping (SPEC-SEARCH-UNIFY-001 REQ-SU-003)
// @MX:REASON: Single source of post-RPC scoring/diversity stays in ai; this adapter is the byte-identical v5 path the PRESERVE 1 net pins. Any drift here breaks the v5-success envelope.
// @MX:SPEC: SPEC-SEARCH-UNIFY-001
import "server-only"
import {logger} from "@/lib/logger"
import type {
  RecommendRequest,
  RecommendResponse,
  SearchEngine,
  SearchProduct,
} from "../engine-port"

/**
 * SPEC-SEARCH-UNIFY-001 IMPROVE 2/6 — v5 adapter (active engine).
 *
 * This is the `callAIServer` + `toSearchProduct` + strong/general
 * `Promise.all` block EXTRACTED VERBATIM from
 * `src/app/api/find/search/route.ts` (the analyze.md §2 seam). Behavior is
 * byte-identical to the inline v5 path:
 *   - module-scope env read (same const-capture-at-import-time semantics the
 *     PRESERVE 1 test exercises via vi.resetModules + dynamic import)
 *   - `callAIServer`: POST {AI_SERVER_URL}/recommend, AbortController timeout,
 *     null on !AI_SERVER_URL / non-2xx / any fetch|abort throw
 *   - strong call ONLY when brandFilter non-empty; general always
 *   - `toSearchProduct`: price quirk (null -> "", 0 -> "₩0"), null coalescing
 *   - 200/502 gate on `generalAI` truthiness ONLY (not result count, not
 *     strong success) -> mapped to RecommendResponse.failed
 *
 * The v5-success envelope the route builds from this adapter's output MUST
 * stay byte-identical (find-search-route.test.ts, 13 tests, frozen).
 */

const AI_SERVER_URL = process.env.AI_SERVER_URL
const AI_SERVER_TIMEOUT_MS = Number(process.env.AI_SERVER_TIMEOUT_MS ?? "60000")

interface AICandidate {
  id: string
  brand: string
  name: string
  price: number | null
  imageUrl: string | null
  productUrl: string | null
  platform: string | null
  subcategory: string | null
  score: number
}

interface AIRecommendResponse {
  itemId: string
  results: AICandidate[]
  counts: Record<string, number>
  latencyMs: Record<string, number>
}

async function callAIServer(
  payload: Record<string, unknown>,
  label: string,
): Promise<AIRecommendResponse | null> {
  if (!AI_SERVER_URL) return null
  const url = `${AI_SERVER_URL.replace(/\/$/, "")}/recommend`
  const t0 = Date.now()
  const item = (payload.item as {id?: string; subcategory?: string; searchQuery?: string}) ?? {}
  logger.info(
    `[STEP 3.5][find/search][${label}] AI 서버 호출 시작 — POST ${url} | timeout=${AI_SERVER_TIMEOUT_MS}ms | item.id=${item.id} subcategory=${item.subcategory ?? "(none)"} searchQuery="${(item.searchQuery ?? "").slice(0, 60)}" gender=${payload.gender ?? "(none)"} brandFilter=${JSON.stringify((payload as Record<string, unknown>).brandFilter ?? null)} tolerance=${payload.tolerance}`,
  )
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), AI_SERVER_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload),
      signal: ctl.signal,
    })
    const elapsed = Date.now() - t0
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      logger.warn(
        `[STEP 3.6][find/search][${label}] ⚠️ AI 서버 non-2xx — ${elapsed}ms | status=${res.status} | body=${text.slice(0, 300)} → 폴백 진행`,
      )
      return null
    }
    const json = (await res.json()) as AIRecommendResponse
    const top = json.results.slice(0, 3).map((r) => `${r.brand}|${r.score.toFixed(3)}`)
    logger.info(
      `[STEP 3.6][find/search][${label}] ✅ AI 서버 응답 — ${elapsed}ms | results=${json.results.length} | counts=${JSON.stringify(json.counts)} | latency_ms=${JSON.stringify(json.latencyMs)} | top3=${JSON.stringify(top)}`,
    )
    return json
  } catch (err) {
    logger.warn(
      `[STEP 3.6][find/search][${label}] ❌ AI 서버 호출 실패 — ${Date.now() - t0}ms | err=${(err as Error).message} → 폴백 진행`,
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Frontend (find-result.tsx SearchProduct) expects: brand/title/price(string)/platform/imageUrl/link
// AI server (AICandidate) returns: brand/name/price(number|null)/platform(null)/imageUrl(null)/productUrl(null)
// Map shape + wrap in single group per side. Verbatim from route.ts:178-185.
const toSearchProduct = (c: AICandidate): SearchProduct => ({
  brand: c.brand,
  title: c.name,
  price: c.price != null ? `₩${c.price.toLocaleString("ko-KR")}` : "",
  platform: c.platform ?? "",
  imageUrl: c.imageUrl ?? "",
  link: c.productUrl ?? "",
})

/**
 * v5 active engine. Reproduces route.ts:142-207 verbatim:
 * commonAI assembly -> Promise.all([strong?, general]) -> generalAI gate.
 */
export const v5Adapter: SearchEngine = {
  version: "v5",

  async search(req: RecommendRequest): Promise<RecommendResponse> {
    const commonAI = {
      item: req.item,
      imageUrl: req.imageUrl,
      gender: req.gender,
      styleNode: req.styleNode,
      moodTags: req.moodTags,
      priceFilter: req.priceFilter,
    }

    const [strongAI, generalAI] = await Promise.all([
      req.brandFilter.length > 0
        ? callAIServer(
            {
              ...commonAI,
              brandFilter: req.brandFilter,
              tolerance: req.strongTolerance,
            },
            "strong",
          )
        : Promise.resolve(null),
      callAIServer(
        {
          ...commonAI,
          tolerance: req.generalTolerance,
        },
        "general",
      ),
    ])

    if (generalAI) {
      return {
        strongMatches:
          strongAI && strongAI.results.length > 0
            ? [{id: "strong", products: strongAI.results.map(toSearchProduct)}]
            : [],
        general:
          generalAI.results.length > 0
            ? [{id: "general", products: generalAI.results.map(toSearchProduct)}]
            : [],
        engine: "v5",
        failed: false,
      }
    }

    return {strongMatches: [], general: [], engine: "v5", failed: true}
  },
}
