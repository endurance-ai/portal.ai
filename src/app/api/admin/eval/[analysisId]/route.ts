import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { analysisId } = await params

  const analysisRes = await supabase
    .from("analyses").select("*").eq("id", analysisId).single()

  if (analysisRes.error) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

  let reviews: unknown[] = []
  let items: unknown[] = []
  let goldenSet: unknown = null

  try {
    const { data } = await supabase
      .from("eval_reviews").select("*").eq("analysis_id", analysisId).order("created_at", { ascending: false })
    if (data) reviews = data
  } catch { /* table may not exist */ }

  try {
    const { data } = await supabase
      .from("analysis_items").select("*").eq("analysis_id", analysisId).order("item_index")
    if (data) items = data
  } catch { /* table may not exist */ }

  try {
    const { data } = await supabase
      .from("eval_golden_set").select("id, added_by, created_at").eq("analysis_id", analysisId).maybeSingle()
    goldenSet = data
  } catch { /* table may not exist */ }

  return NextResponse.json({ analysis: analysisRes.data, reviews, items, goldenSet })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { analysisId } = await params
  const body = await request.json()
  const { verdict, comment, addToGoldenSet, prompt_version } = body

  const VALID_VERDICTS = ["pass", "fail", "partial"]
  if (!verdict || !VALID_VERDICTS.includes(verdict)) {
    return NextResponse.json({ error: "invalid verdict" }, { status: 400 })
  }

  const { error: reviewError } = await supabase.from("eval_reviews").insert({
    analysis_id: analysisId,
    reviewer_email: user.email,
    verdict,
    comment: comment || null,
    prompt_version: prompt_version || null,
  })

  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 })

  if (addToGoldenSet) {
    const { data: analysis } = await supabase
      .from("analyses")
      .select("style_node_primary, style_node_secondary, items, image_url")
      .eq("id", analysisId).single()

    if (analysis) {
      await supabase.from("eval_golden_set").insert({
        analysis_id: analysisId,
        image_url: analysis.image_url || "",
        expected_node_primary: analysis.style_node_primary,
        expected_node_secondary: analysis.style_node_secondary,
        expected_items: analysis.items,
        added_by: user.email,
      })
    }
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { analysisId } = await params
  const body = await request.json()
  const { reviewId, verdict, comment, is_pinned, prompt_version } = body

  if (!reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 })

  const VALID_VERDICTS = ["pass", "fail", "partial"]
  if (verdict !== undefined && !VALID_VERDICTS.includes(verdict)) {
    return NextResponse.json({ error: "invalid verdict" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = { reviewer_email: user.email }
  if (verdict !== undefined) updates.verdict = verdict
  if (comment !== undefined) updates.comment = comment || null
  if (is_pinned !== undefined) updates.is_pinned = is_pinned
  if (prompt_version !== undefined) updates.prompt_version = prompt_version || null

  const { error } = await supabase
    .from("eval_reviews")
    .update(updates)
    .eq("id", reviewId)
    .eq("analysis_id", analysisId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { analysisId } = await params
  const { searchParams } = request.nextUrl
  const reviewId = searchParams.get("reviewId")

  if (!reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 })

  const { error } = await supabase
    .from("eval_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("analysis_id", analysisId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
