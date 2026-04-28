import {NextResponse} from "next/server"
import {logger} from "@/lib/logger"
import {resolveIgHandlesToBrands} from "@/lib/find/resolve-brands"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 메인 플로우 v3: AI 서버(/recommend) 만 사용. v4 폴백 제거.
// Modal cold start (~30s) + 검색까지 견딜 수 있게 timeout 60s.

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
  label: string
): Promise<AIRecommendResponse | null> {
  if (!AI_SERVER_URL) return null
  const url = `${AI_SERVER_URL.replace(/\/$/, "")}/recommend`
  const t0 = Date.now()
  const item = (payload.item as {id?: string; subcategory?: string; searchQuery?: string}) ?? {}
  logger.info(
    `[STEP 3.5][find/search][${label}] AI 서버 호출 시작 — POST ${url} | timeout=${AI_SERVER_TIMEOUT_MS}ms | item.id=${item.id} subcategory=${item.subcategory ?? "(none)"} searchQuery="${(item.searchQuery ?? "").slice(0, 60)}" gender=${payload.gender ?? "(none)"} brandFilter=${JSON.stringify((payload as Record<string, unknown>).brandFilter ?? null)} tolerance=${payload.tolerance}`
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
        `[STEP 3.6][find/search][${label}] ⚠️ AI 서버 non-2xx — ${elapsed}ms | status=${res.status} | body=${text.slice(0, 300)} → 폴백 진행`
      )
      return null
    }
    const json = (await res.json()) as AIRecommendResponse
    const top = json.results.slice(0, 3).map((r) => `${r.brand}|${r.score.toFixed(3)}`)
    logger.info(
      `[STEP 3.6][find/search][${label}] ✅ AI 서버 응답 — ${elapsed}ms | results=${json.results.length} | counts=${JSON.stringify(json.counts)} | latency_ms=${JSON.stringify(json.latencyMs)} | top3=${JSON.stringify(top)}`
    )
    return json
  } catch (err) {
    logger.warn(
      `[STEP 3.6][find/search][${label}] ❌ AI 서버 호출 실패 — ${Date.now() - t0}ms | err=${(err as Error).message} → 폴백 진행`
    )
    return null
  } finally {
    clearTimeout(timer)
  }
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
  if (body.imageUrl && AI_SERVER_URL) {
    logger.info(
      `[STEP 3.3][find/search] AI 서버 분기 진입 — AI_SERVER_URL=${AI_SERVER_URL} timeout=${AI_SERVER_TIMEOUT_MS}ms | brandFilter ${brandFilter.length > 0 ? "있음 → strongAI+generalAI 병렬 호출" : "없음 → generalAI 만 호출"}`
    )
    const commonAI = {
      item: body.item,
      imageUrl: body.imageUrl,
      gender: body.gender,
      styleNode: body.styleNode,
      moodTags: body.moodTags,
      priceFilter: body.priceFilter,
    }

    const [strongAI, generalAI] = await Promise.all([
      brandFilter.length > 0
        ? callAIServer(
            {
              ...commonAI,
              brandFilter,
              tolerance: body.strongMatchTolerance ?? 0.5,
            },
            "strong"
          )
        : Promise.resolve(null),
      callAIServer(
        {
          ...commonAI,
          tolerance: body.generalTolerance ?? 0.5,
        },
        "general"
      ),
    ])

    if (generalAI) {
      logger.info(
        `[STEP 3.9][find/search] ✅ 응답 (engine=v5) — strongMatches=${(strongAI?.results ?? []).length} general=${generalAI.results.length} | 총 ${Date.now() - reqStart}ms`
      )
      return NextResponse.json({
        item: body.item,
        resolvedBrands: resolved,
        strongMatches: strongAI?.results ?? [],
        general: generalAI.results,
        engine: "v5",
      })
    }

    logger.error(
      `[STEP 3.8][find/search] ❌ AI 서버 실패 — 502 응답 (v4 폴백 제거됨)`
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
