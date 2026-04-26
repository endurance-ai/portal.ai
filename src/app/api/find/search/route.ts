import {NextRequest, NextResponse} from "next/server"
import {resolveIgHandlesToBrands} from "@/lib/find/resolve-brands"
import {POST as searchProductsPost} from "@/app/api/search-products/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 메인 플로우 v3: AI 서버(/recommend) 우선 호출 → 실패 시 v4 in-process 폴백.
// AI_SERVER_URL 환경변수 미설정 또는 5xx/timeout 시 자동 폴백 (브라우저는 모름).

const AI_SERVER_URL = process.env.AI_SERVER_URL
const AI_SERVER_TIMEOUT_MS = Number(process.env.AI_SERVER_TIMEOUT_MS ?? "8000")

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
  payload: Record<string, unknown>
): Promise<AIRecommendResponse | null> {
  if (!AI_SERVER_URL) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), AI_SERVER_TIMEOUT_MS)
  try {
    const res = await fetch(`${AI_SERVER_URL.replace(/\/$/, "")}/recommend`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload),
      signal: ctl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.warn("[find/search] AI server non-2xx — falling back", {
        status: res.status,
        body: text.slice(0, 300),
      })
      return null
    }
    return (await res.json()) as AIRecommendResponse
  } catch (err) {
    console.warn("[find/search] AI server failed — falling back", {
      err: (err as Error).message,
    })
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function callV4Fallback(
  payload: Record<string, unknown>
): Promise<
  | {ok: true; json: {results?: unknown}}
  | {ok: false; status: number; body: string}
> {
  const req = new NextRequest("http://internal/api/search-products", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(payload),
  })
  const res = await searchProductsPost(req)
  if (!res.ok) {
    return {ok: false, status: res.status, body: await res.text()}
  }
  return {ok: true, json: (await res.json()) as {results?: unknown}}
}

export async function POST(request: Request) {
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

  // brandFilter — post-level mentioned users 만 사용 (슬라이드별 태그 없음, by Apify spec)
  const handles = Array.isArray(body.taggedHandles)
    ? body.taggedHandles
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.replace(/^@/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    : []

  const resolved = handles.length > 0 ? await resolveIgHandlesToBrands(handles) : []
  const brandFilter = resolved.map((r) => r.brandName)

  // ── 1) AI 서버 우선 (imageUrl 있을 때만 — embedding 필요) ──────────────
  if (body.imageUrl && AI_SERVER_URL) {
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
        ? callAIServer({
            ...commonAI,
            brandFilter,
            tolerance: body.strongMatchTolerance ?? 0.5,
          })
        : Promise.resolve(null),
      callAIServer({
        ...commonAI,
        tolerance: body.generalTolerance ?? 0.5,
      }),
    ])

    if (generalAI) {
      // AI 서버 응답 모양 → v4 결과 모양에 맞춤 (기존 UI 호환)
      return NextResponse.json({
        item: body.item,
        resolvedBrands: resolved,
        strongMatches: strongAI?.results ?? [],
        general: generalAI.results,
        engine: "v5",
      })
    }
    // generalAI 실패 시 폴백으로 떨어짐
  }

  // ── 2) v4 폴백 (in-process) ─────────────────────────────────────────
  const commonV4 = {
    queries: [body.item],
    gender: body.gender,
    styleNode: body.styleNode,
    moodTags: body.moodTags,
    priceFilter: body.priceFilter,
  }

  const [strong, general] = await Promise.all([
    brandFilter.length > 0
      ? callV4Fallback({
          ...commonV4,
          brandFilter,
          styleTolerance: body.strongMatchTolerance ?? 0.5,
        })
      : Promise.resolve({ok: true as const, json: {results: []}}),
    callV4Fallback({
      ...commonV4,
      styleTolerance: body.generalTolerance ?? 0.5,
    }),
  ])

  if (!general.ok) {
    console.error("[find/search] v4 폴백도 실패", {
      status: general.status,
      body: general.body.slice(0, 500),
    })
    return NextResponse.json(
      {error: "Search failed", code: "SEARCH_FAILED"},
      {status: 502}
    )
  }

  const generalJson = general.json as {results?: unknown}
  const strongJson = strong.ok ? (strong.json as {results?: unknown}) : {results: []}

  return NextResponse.json({
    item: body.item,
    resolvedBrands: resolved,
    strongMatches: Array.isArray(strongJson.results) ? strongJson.results : [],
    general: Array.isArray(generalJson.results) ? generalJson.results : [],
    engine: "v4",
  })
}
