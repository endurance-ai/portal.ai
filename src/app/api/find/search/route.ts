import {NextRequest, NextResponse} from "next/server"
import {resolveIgHandlesToBrands} from "@/lib/find/resolve-brands"
import {POST as searchProductsPost} from "@/app/api/search-products/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 이 엔드포인트는 analyze-post 결과 + 태그 브랜드를 받아
// search-products 핸들러를 2회(strong + general) in-process로 호출하여 합쳐 반환한다.
//
// self-origin HTTP fetch 대신 핸들러 직접 import — cookie 포워딩/host-header SSRF 제거 + 라운드트립 제거.

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
  payload: Record<string, unknown>
): Promise<
  | {ok: true; json: {results?: unknown}}
  | {ok: false; status: number; body: string}
> {
  // NextRequest 생성 — URL은 내부 호출이라 의미 없음(placeholder), 쿠키/헤더 일절 없음.
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

  const commonPayload = {
    queries: items,
    gender: body.gender,
    styleNode: body.styleNode,
    moodTags: body.moodTags,
    priceFilter: body.priceFilter,
  }

  const [strong, general] = await Promise.all([
    brandFilter.length > 0
      ? callSearchProducts({
          ...commonPayload,
          brandFilter,
          styleTolerance: body.strongMatchTolerance ?? 0.5,
        })
      : Promise.resolve({ok: true as const, json: {results: []}}),
    callSearchProducts({
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

  const generalJson = general.json as {results?: unknown}
  const strongJson = strong.ok ? (strong.json as {results?: unknown}) : {results: []}

  return NextResponse.json({
    resolvedBrands: resolved,
    strongMatches: Array.isArray(strongJson.results) ? strongJson.results : [],
    general: Array.isArray(generalJson.results) ? generalJson.results : [],
  })
}
