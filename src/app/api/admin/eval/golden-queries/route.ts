import { NextRequest, NextResponse } from "next/server"
import { requireApprovedAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabase"

// SPEC-V6-EVAL T-009 — Golden Queries CRUD (REQ-V6-EVAL-001)
// dual identity: instagram_url + query_signature, UNIQUE 위반 시 409.

const PG_UNIQUE_VIOLATION = "23505"

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const algorithmVersion = sp.get("algorithm_version")
  const page = Math.max(1, parseInt(sp.get("page") || "1") || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20") || 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from("eval_golden_queries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (algorithmVersion === "v4" || algorithmVersion === "v6") {
    query = query.eq("algorithm_version", algorithmVersion)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [], total: count ?? 0 })
}

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const body = (await request.json().catch(() => ({}))) as {
    instagramUrl?: string | null
    querySignature?: string | null
    intentNote?: string
    createdBy?: string
    algorithmVersion?: string
  }

  const instagramUrl = body.instagramUrl?.trim() || null
  const querySignature = body.querySignature?.trim() || null
  if (!instagramUrl && !querySignature) {
    return NextResponse.json(
      { error: "instagramUrl 또는 querySignature 중 최소 한 가지 식별자 필요" },
      { status: 400 },
    )
  }
  if (!body.intentNote || !body.createdBy) {
    return NextResponse.json(
      { error: "intentNote, createdBy 필수" },
      { status: 400 },
    )
  }
  const algorithmVersion = body.algorithmVersion === "v6" ? "v6" : "v4"

  const { data, error } = await supabase
    .from("eval_golden_queries")
    .insert({
      instagram_url: instagramUrl,
      query_signature: querySignature,
      intent_note: body.intentNote,
      created_by: body.createdBy,
      algorithm_version: algorithmVersion,
    })
    .select()
    .single()

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return NextResponse.json({ error: "duplicate identity (instagram_url + query_signature)" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as {
    intentNote?: string
    querySignature?: string | null
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.intentNote !== undefined) patch.intent_note = body.intentNote
  if (body.querySignature !== undefined) patch.query_signature = body.querySignature

  const { data, error } = await supabase
    .from("eval_golden_queries")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return NextResponse.json({ error: "duplicate identity" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 })

  const { error, count } = await supabase
    .from("eval_golden_queries")
    .delete({ count: "exact" })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: "not found" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
