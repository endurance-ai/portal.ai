import {NextResponse} from "next/server"
import {resolveIgHandlesToBrands} from "@/lib/find/resolve-brands"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 이 엔드포인트는 analyze-post 결과 + 태그 브랜드를 받아
// /api/search-products 를 2회(strong + general) 호출하여 합쳐 반환한다.
//
// 프론트에서 2번 호출해도 되지만 태그 handle 리졸브가 공통이고 실패 경로도 여기서
// 한 번에 처리하는 게 UI 코드가 깔끔하다.

interface SearchBody {
  items?: Array<{
    id: string
    category: string
    subcategory?: string
    fit?: string
    fabric?: string
    colorFamily?: string
    searchQuery: string
    searchQueryKo?: string
  }>
  taggedHandles?: string[]
  gender?: string
  styleNode?: {primary: string; secondary?: string}
  moodTags?: string[]
  priceFilter?: {minPrice?: number; maxPrice?: number}
  strongMatchTolerance?: number
  generalTolerance?: number
}

async function callSearchProducts(
  origin: string,
  cookie: string | null,
  payload: Record<string, unknown>
) {
  const res = await fetch(`${origin}/api/search-products`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? {cookie} : {}),
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    return {ok: false as const, status: res.status, body: await res.text()}
  }
  return {ok: true as const, json: await res.json()}
}

export async function POST(request: Request) {
  let body: SearchBody
  try {
    body = (await request.json()) as SearchBody
  } catch {
    return NextResponse.json({error: "Invalid JSON"}, {status: 400})
  }

  const items = Array.isArray(body.items) ? body.items.slice(0, 10) : []
  if (items.length === 0) {
    return NextResponse.json({error: "Missing items"}, {status: 400})
  }

  const handles = Array.isArray(body.taggedHandles)
    ? body.taggedHandles
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.replace(/^@/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20)
    : []

  const resolved = handles.length > 0 ? await resolveIgHandlesToBrands(handles) : []
  const brandFilter = resolved.map((r) => r.brandName)

  // self-origin 호출 — 배포 환경 가변 처리
  const url = new URL(request.url)
  const origin = `${url.protocol}//${url.host}`
  const cookie = request.headers.get("cookie")

  const commonPayload = {
    queries: items,
    gender: body.gender,
    styleNode: body.styleNode,
    moodTags: body.moodTags,
    priceFilter: body.priceFilter,
  }

  const [strong, general] = await Promise.all([
    brandFilter.length > 0
      ? callSearchProducts(origin, cookie, {
          ...commonPayload,
          brandFilter,
          styleTolerance: body.strongMatchTolerance ?? 0.5,
        })
      : Promise.resolve({ok: true as const, json: {results: []}}),
    callSearchProducts(origin, cookie, {
      ...commonPayload,
      styleTolerance: body.generalTolerance ?? 0.5,
    }),
  ])

  if (!general.ok) {
    return NextResponse.json(
      {error: "General search failed", status: general.status, detail: general.body},
      {status: 502}
    )
  }

  return NextResponse.json({
    resolvedBrands: resolved,
    strongMatches:
      strong.ok && Array.isArray(strong.json.results)
        ? strong.json.results
        : [],
    general: Array.isArray(general.json.results) ? general.json.results : [],
  })
}
