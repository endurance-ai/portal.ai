import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {getAdminStatus, requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

// 어드민 v6 검색 디버거 — Run 히스토리 CRUD.
// 공유 — 모든 승인 어드민이 본다. created_by 는 audit 용.

interface SaveBody {
  mode: "text" | "image" | "fused"
  query_text?: string
  image_url?: string
  source_url?: string
  filters?: Record<string, unknown>
  steps?: Record<string, unknown>
  response: Record<string, unknown>
  rating?: number | null
  notes?: string | null
  tags?: string[]
}

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const status = await getAdminStatus()
  const createdBy = status.user?.email ?? null

  let body: SaveBody
  try {
    body = (await request.json()) as SaveBody
  } catch {
    return NextResponse.json({error: "invalid JSON"}, {status: 400})
  }

  if (!body.mode || !body.response) {
    return NextResponse.json({error: "mode and response required"}, {status: 400})
  }
  if (body.rating != null && (body.rating < 1 || body.rating > 5)) {
    return NextResponse.json({error: "rating must be 1..5"}, {status: 400})
  }

  const {data, error} = await supabase
    .from("search_debug_runs")
    .insert({
      created_by: createdBy,
      mode: body.mode,
      query_text: body.query_text ?? null,
      image_url: body.image_url ?? null,
      source_url: body.source_url ?? null,
      filters: body.filters ?? {},
      steps: body.steps ?? {},
      response: body.response,
      rating: body.rating ?? null,
      notes: body.notes ?? null,
      tags: body.tags ?? [],
    })
    .select("id, created_at")
    .single()

  if (error) return NextResponse.json({error: error.message}, {status: 500})
  return NextResponse.json({id: (data as {id: number}).id, created_at: (data as {created_at: string}).created_at})
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {searchParams} = request.nextUrl
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30"), 1), 100)
  const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0)
  const ratingFilter = searchParams.get("rating")
  const tagFilter = searchParams.get("tag")
  const modeFilter = searchParams.get("mode")

  let q = supabase
    .from("search_debug_runs")
    .select(
      "id, created_at, created_by, mode, query_text, image_url, source_url, filters, steps, rating, notes, tags",
      {count: "exact"}
    )
    .order("created_at", {ascending: false})

  if (ratingFilter) q = q.eq("rating", parseInt(ratingFilter))
  if (modeFilter) q = q.eq("mode", modeFilter)
  if (tagFilter) q = q.contains("tags", [tagFilter])

  q = q.range(offset, offset + limit - 1)

  const {data, count, error} = await q
  if (error) return NextResponse.json({error: error.message}, {status: 500})

  // 결과 distance min / returned count 같은 summary metric 만 추출
  return NextResponse.json({
    runs: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
}
