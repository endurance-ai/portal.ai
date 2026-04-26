import {NextRequest, NextResponse} from "next/server"
import {resolveIgHandlesToBrands} from "@/lib/find/resolve-brands"
import {POST as searchProductsPost} from "@/app/api/search-products/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 메인 플로우 v2: analyze-post 가 검출한 items 중 사용자가 선택한 단일 아이템으로 검색.
// brandFilter 는 post-level taggedUsers + 캡션 mentions (Apify가 슬라이드별 태그 보존 X).
// strong + general 두 갈래 동시 실행.

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

  const commonPayload = {
    queries: [body.item], // 단일 아이템 → queries 배열 길이 1
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
    // 내부 search-products 에러 body 는 클라이언트에 노출 X (DB/스택 정보 차단)
    console.error("[find/search] search-products handler failed", {
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
  })
}
