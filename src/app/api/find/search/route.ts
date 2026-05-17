import {NextResponse} from "next/server"
import {logger} from "@/lib/logger"
import {resolveIgHandlesToBrands} from "@/lib/find/resolve-brands"
import {selectEngine} from "@/domains/search/registry"
import {resolveEngineVersion} from "@/domains/search/engine-port"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// SPEC-SEARCH-UNIFY-001 IMPROVE 5/6 — engine invocation is delegated behind
// the versioned `SearchEngine` port (selectEngine). Input validation, the
// taggedHandles→brand resolution, the `imageUrl && AI_SERVER_URL` gate, and
// the HTTP envelope ALL stay in the route VERBATIM (analyze.md §2.1 seam).
// DEFAULT (SEARCH_ENGINE_VERSION unset ⇒ v5-direct): pure v5 adapter, NO
// circuit breaker, NO v4 fallback ⇒ byte-identical to the prior inline v5
// path (200 v5 envelope on success, 502 AI_SERVER_FAILED on v5 failure).
// Single-env-toggle rollback: SEARCH_ENGINE_VERSION unset = today's reality.

const AI_SERVER_URL = process.env.AI_SERVER_URL
const AI_SERVER_TIMEOUT_MS = Number(process.env.AI_SERVER_TIMEOUT_MS ?? "60000")

interface SearchBody {
  item?: {
    id: string
    category: string
    subcategory?: string
    fit?: string
    fabric?: string
    colorFamily?: string
    searchQuery: string
    searchQueryKo?: string
  }
  imageUrl?: string
  taggedHandles?: string[]
  gender?: string
  styleNode?: {primary: string; secondary?: string}
  moodTags?: string[]
  priceFilter?: {minPrice?: number; maxPrice?: number}
  strongMatchTolerance?: number
  generalTolerance?: number
}

export async function POST(request: Request) {
  const reqStart = Date.now()
  let body: SearchBody
  try {
    body = (await request.json()) as SearchBody
  } catch {
    return NextResponse.json({error: "Invalid JSON"}, {status: 400})
  }

  if (!body.item || typeof body.item !== "object") {
    return NextResponse.json({error: "Missing `item`"}, {status: 400})
  }
  if (!body.item.searchQuery || typeof body.item.searchQuery !== "string") {
    return NextResponse.json(
      {error: "item.searchQuery is required"},
      {status: 400}
    )
  }

  logger.info(
    `[STEP 3.1][find/search] 진입 — item.id=${body.item.id} subcategory=${body.item.subcategory ?? "(none)"} searchQuery="${body.item.searchQuery.slice(0, 80)}" searchQueryKo="${(body.item.searchQueryKo ?? "").slice(0, 80)}" gender=${body.gender ?? "(none)"} taggedHandles=${(body.taggedHandles ?? []).length} strongTol=${body.strongMatchTolerance ?? 0.5} genTol=${body.generalTolerance ?? 0.5} hasImage=${!!body.imageUrl}`
  )

  // brandFilter — post-level mentioned users 만 사용 (슬라이드별 태그 없음, by Apify spec)
  const handles = Array.isArray(body.taggedHandles)
    ? body.taggedHandles
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.replace(/^@/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    : []

  const resolveT0 = Date.now()
  const resolved = handles.length > 0 ? await resolveIgHandlesToBrands(handles) : []
  const brandFilter = resolved.map((r) => r.brandName)
  logger.info(
    `[STEP 3.2][find/search] taggedHandles → brandFilter — ${Date.now() - resolveT0}ms | handles=${handles.length} resolved=${resolved.length} brandFilter=${JSON.stringify(brandFilter)}`
  )

  // ── 1) AI 서버 우선 (imageUrl 있을 때만 — embedding 필요) ──────────────
  // GATE VERBATIM (analyze.md QUIRK, pinned by find-search-route.test.ts):
  // false (incl. AI_SERVER_URL unset even w/ imageUrl) ⇒ falls through to
  // the 400 AI_SERVER_REQUIRED branch — NEVER reaches the engine / 502.
  if (body.imageUrl && AI_SERVER_URL) {
    const engineVersion = resolveEngineVersion(process.env.SEARCH_ENGINE_VERSION)
    logger.info(
      `[STEP 3.3][find/search] AI 서버 분기 진입 — AI_SERVER_URL=${AI_SERVER_URL} timeout=${AI_SERVER_TIMEOUT_MS}ms engine=${engineVersion} | brandFilter ${brandFilter.length > 0 ? "있음 → strong+general" : "없음 → general 만"}`
    )

    const engine = selectEngine(process.env.SEARCH_ENGINE_VERSION)
    const result = await engine.search({
      item: body.item,
      imageUrl: body.imageUrl,
      gender: body.gender,
      styleNode: body.styleNode,
      moodTags: body.moodTags,
      priceFilter: body.priceFilter,
      brandFilter,
      strongTolerance: body.strongMatchTolerance ?? 0.5,
      generalTolerance: body.generalTolerance ?? 0.5,
    })

    if (!result.failed) {
      logger.info(
        `[STEP 3.9][find/search] ✅ 응답 (engine=${result.engine}) — strongMatches=${result.strongMatches.length} general=${result.general.length} | 총 ${Date.now() - reqStart}ms`
      )
      return NextResponse.json({
        item: body.item,
        resolvedBrands: resolved,
        strongMatches: result.strongMatches,
        general: result.general,
        engine: result.engine,
      })
    }

    logger.error(
      `[STEP 3.8][find/search] ❌ 검색 엔진 실패 (engine=${result.engine}) — 502 응답`
    )
    return NextResponse.json(
      {error: "AI server unavailable", code: "AI_SERVER_FAILED"},
      {status: 502}
    )
  }

  logger.error(
    `[STEP 3.3][find/search] ❌ 진입 거부 — hasImage=${!!body.imageUrl} hasAIServerURL=${!!AI_SERVER_URL} (v5 전용 — v4 폴백 제거됨)`
  )
  return NextResponse.json(
    {error: "imageUrl and AI_SERVER_URL required", code: "AI_SERVER_REQUIRED"},
    {status: 400}
  )
}
