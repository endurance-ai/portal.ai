import { NextRequest, NextResponse } from "next/server"
import { requireApprovedAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabase"

// SPEC-V6-EVAL T-011 — judgments PATCH (REQ-V6-EVAL-002)
// 항상 labeled_at = now() 갱신 (DP1 #4: always-update labeled_at).

interface PatchBody {
  relevanceGrade?: number
  notes?: string | null
}

const PG_CHECK_VIOLATION = "23514"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as PatchBody
  if (
    body.relevanceGrade === undefined ||
    !Number.isInteger(body.relevanceGrade) ||
    body.relevanceGrade < 0 ||
    body.relevanceGrade > 3
  ) {
    return NextResponse.json(
      { error: "relevanceGrade must be integer in [0, 3]" },
      { status: 400 },
    )
  }

  const patch: Record<string, unknown> = {
    relevance_grade: body.relevanceGrade,
    labeled_at: new Date().toISOString(),
  }
  if (body.notes !== undefined) patch.notes = body.notes

  const { data, error } = await supabase
    .from("eval_judgments")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === PG_CHECK_VIOLATION) {
      return NextResponse.json({ error: "relevance_grade CHECK 위반" }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(data)
}
