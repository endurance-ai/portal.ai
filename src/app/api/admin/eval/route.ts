import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get("page") || "0")
  const limit = 20

  const { count: totalAnalyses } = await supabase
    .from("analyses").select("*", { count: "exact", head: true })

  let allReviews: { analysis_id: string; verdict: string }[] = []
  try {
    const { data, error } = await supabase
      .from("eval_reviews").select("analysis_id, verdict")
    if (!error && data) allReviews = data
  } catch {
    // table doesn't exist yet
  }

  const reviewedIds = new Set(allReviews.map(r => r.analysis_id))
  const reviewedCount = reviewedIds.size
  const pendingCount = (totalAnalyses || 0) - reviewedCount

  const verdictDist = { pass: 0, fail: 0, partial: 0 }
  allReviews.forEach(v => { verdictDist[v.verdict as keyof typeof verdictDist]++ })

  let queue
  if (reviewedIds.size > 0) {
    const { data } = await supabase
      .from("analyses")
      .select("id, created_at, image_filename, style_node_primary, style_node_confidence, detected_gender, items")
      .not("id", "in", `(${[...reviewedIds].join(",")})`)
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)
    queue = data
  } else {
    const { data } = await supabase
      .from("analyses")
      .select("id, created_at, image_filename, style_node_primary, style_node_confidence, detected_gender, items")
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)
    queue = data
  }

  return NextResponse.json({
    metrics: { totalAnalyses: totalAnalyses || 0, reviewed: reviewedCount, pending: pendingCount, verdictDist },
    queue: queue || [],
  })
}
