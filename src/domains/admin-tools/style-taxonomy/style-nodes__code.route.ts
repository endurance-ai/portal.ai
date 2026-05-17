import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {invalidateStyleNodesCache} from "@/lib/style-nodes-db"

type Ctx = {params: Promise<{code: string}>}

/**
 * GET /api/admin/style-nodes/[code] — 단건 조회.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {code} = await ctx.params
  const {data, error} = await supabase
    .from("style_nodes")
    .select(
      "id, code, name_en, name_ko, mood, include_rule, exclude_rule, keywords_en, keywords_ko, is_active, created_at, updated_at",
    )
    .eq("code", code)
    .maybeSingle()
  if (error) return NextResponse.json({error: error.message}, {status: 500})
  if (!data) return NextResponse.json({error: "node not found"}, {status: 404})
  return NextResponse.json({node: data})
}

/**
 * PATCH /api/admin/style-nodes/[code] — 노드 수정.
 * 가능한 필드: name_en, name_ko, mood, include_rule, exclude_rule, keywords_en, keywords_ko, is_active.
 * code 는 immutable (URL path 로만 식별).
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {code} = await ctx.params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400})
  }

  const patch: Record<string, unknown> = {}
  for (const k of [
    "name_en",
    "name_ko",
    "mood",
    "include_rule",
    "exclude_rule",
  ] as const) {
    if (k in body) patch[k] = body[k]
  }
  for (const k of ["keywords_en", "keywords_ko"] as const) {
    if (k in body && Array.isArray(body[k])) patch[k] = body[k]
  }
  if ("is_active" in body) patch.is_active = !!body.is_active

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({error: "no fields to update"}, {status: 400})
  }

  const {data, error} = await supabase
    .from("style_nodes")
    .update(patch)
    .eq("code", code)
    .select()
    .single()
  if (error) return NextResponse.json({error: error.message}, {status: 400})
  if (!data) return NextResponse.json({error: "node not found"}, {status: 404})

  invalidateStyleNodesCache()
  return NextResponse.json({node: data})
}

/**
 * DELETE /api/admin/style-nodes/[code] — 노드 비활성 (soft delete).
 * 실제 row 삭제는 하지 않음 (brand FK 깨질 위험).
 */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {code} = await ctx.params
  const {data, error} = await supabase
    .from("style_nodes")
    .update({is_active: false})
    .eq("code", code)
    .select()
    .single()
  if (error) return NextResponse.json({error: error.message}, {status: 400})
  if (!data) return NextResponse.json({error: "node not found"}, {status: 404})

  invalidateStyleNodesCache()
  return NextResponse.json({node: data})
}
