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

  return NextResponse.json({
    analysis: analysisRes.data,
    reviews,
    items,
  })
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
  const { verdict, comment, addToGoldenSet } = body

  const { error: reviewError } = await supabase.from("eval_reviews").insert({
    analysis_id: analysisId,
    reviewer_email: user.email,
    verdict,
    comment: comment || null,
  })

  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 })

  if (addToGoldenSet) {
    const { data: analysis } = await supabase
      .from("analyses")
      .select("style_node_primary, style_node_secondary, items, image_filename")
      .eq("id", analysisId).single()

    if (analysis) {
      await supabase.from("eval_golden_set").insert({
        analysis_id: analysisId,
        image_url: analysis.image_filename || "",
        expected_node_primary: analysis.style_node_primary,
        expected_node_secondary: analysis.style_node_secondary,
        expected_items: analysis.items,
        added_by: user.email,
      })
    }
  }

  return NextResponse.json({ success: true })
}
