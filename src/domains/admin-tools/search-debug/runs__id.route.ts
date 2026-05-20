import "server-only"
import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

interface PatchBody {
  rating?: number | null
  notes?: string | null
  tags?: string[]
}

export async function GET(
  _request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const {id: rawId} = await params
  const id = parseInt(rawId, 10)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }
  const {data, error} = await supabase
    .from("search_debug_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  if (!data) return NextResponse.json({error: "not found"}, {status: 404})
  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const {id: rawId} = await params
  const id = parseInt(rawId, 10)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({error: "invalid JSON"}, {status: 400})
  }
  if (body.rating != null && (body.rating < 1 || body.rating > 5)) {
    return NextResponse.json({error: "rating must be 1..5"}, {status: 400})
  }

  const patch: Record<string, unknown> = {}
  if ("rating" in body) patch.rating = body.rating
  if ("notes" in body) patch.notes = body.notes
  if ("tags" in body) patch.tags = body.tags ?? []
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({error: "nothing to update"}, {status: 400})
  }

  const {data, error} = await supabase
    .from("search_debug_runs")
    .update(patch)
    .eq("id", id)
    .select("id, rating, notes, tags")
    .single()
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const {id: rawId} = await params
  const id = parseInt(rawId, 10)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({error: "invalid id"}, {status: 400})
  }
  const {error} = await supabase.from("search_debug_runs").delete().eq("id", id)
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  return NextResponse.json({ok: true})
}
