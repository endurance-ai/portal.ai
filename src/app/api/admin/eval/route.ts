import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(0, Math.min(parseInt(searchParams.get("page") || "0") || 0, 500))
  const filter = searchParams.get("filter") || "all" // all | pending | reviewed
  const verdictsRaw = searchParams.get("verdicts") // comma-separated: pass,fail,partial
  const limit = 20

  const { count: totalAnalyses } = await supabase
    .from("analyses").select("*", { count: "exact", head: true })

  // Fetch all reviews (all fields needed for card display)
  let allReviews: { analysis_id: string; verdict: string; comment: string | null; reviewer_email: string; created_at: string }[] = []
  try {
    const { data, error } = await supabase
      .from("eval_reviews").select("analysis_id, verdict, comment, reviewer_email, created_at").order("created_at", { ascending: false })
    if (!error && data) allReviews = data
  } catch {
    // table doesn't exist yet
  }

  // Group all reviews per analysis (newest first — already ordered desc)
  const reviewsByAnalysis = new Map<string, typeof allReviews>()
  for (const r of allReviews) {
    const arr = reviewsByAnalysis.get(r.analysis_id) || []
    arr.push(r)
    reviewsByAnalysis.set(r.analysis_id, arr)
  }

  const reviewedIds = new Set(allReviews.map(r => r.analysis_id))
  const reviewedCount = reviewedIds.size
  const pendingCount = (totalAnalyses || 0) - reviewedCount

  // Verdict distribution (based on latest review per analysis)
  const verdictDist = { pass: 0, fail: 0, partial: 0 }
  reviewsByAnalysis.forEach((reviews) => {
    const latest = reviews[0] // already sorted desc
    const key = latest?.verdict as keyof typeof verdictDist
    if (key && key in verdictDist) verdictDist[key]++
  })

  // Return empty for reviewed filter when no reviews
  if (filter === "reviewed" && reviewedIds.size === 0) {
    return NextResponse.json({
      metrics: { totalAnalyses: totalAnalyses || 0, reviewed: reviewedCount, pending: pendingCount, verdictDist },
      queue: [],
    })
  }

  // Verdict filtering: if ANY review on an analysis matches a selected verdict, include it
  // Pinned analyses are always included regardless of verdict filter
  const VALID_VERDICTS = new Set(["pass", "fail", "partial"])
  const verdicts = verdictsRaw
    ? verdictsRaw.split(",").filter(v => VALID_VERDICTS.has(v))
    : null

  let filteredReviewedIds = reviewedIds
  const pinnedAnalysisIds = new Set<string>()
  if (filter === "reviewed" && verdicts && verdicts.length > 0) {
    const allowedVerdicts = new Set(verdicts)
    filteredReviewedIds = new Set<string>()
    reviewsByAnalysis.forEach((reviews, analysisId) => {
      const hasMatch = reviews.some(r => allowedVerdicts.has(r.verdict))
      if (hasMatch) filteredReviewedIds.add(analysisId)
    })
  }

  // Collect pinned IDs to always include in reviewed filter
  if (filter === "reviewed") {
    // We need to fetch pinned IDs separately since they bypass verdict filter
    try {
      const { data: pinnedRows } = await supabase
        .from("analyses").select("id").eq("is_pinned", true).in("id", [...reviewedIds])
      if (pinnedRows) pinnedRows.forEach(r => {
        pinnedAnalysisIds.add(r.id)
        filteredReviewedIds.add(r.id) // always include pinned
      })
    } catch { /* is_pinned column may not exist yet */ }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("analyses")
    .select("id, created_at, image_filename, prompt_text, style_node_primary, style_node_confidence, detected_gender, items, is_pinned")
    .order("is_pinned", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (filter === "pending" && reviewedIds.size > 0) {
    query = query.not("id", "in", `(${[...reviewedIds].join(",")})`)
  } else if (filter === "reviewed") {
    if (filteredReviewedIds.size === 0) {
      return NextResponse.json({
        metrics: { totalAnalyses: totalAnalyses || 0, reviewed: reviewedCount, pending: pendingCount, verdictDist },
        queue: [],
      })
    }
    query = query.in("id", [...filteredReviewedIds])
  }

  const { data: analyses } = await query

  const queue = (analyses || []).map((item: { id: string; is_pinned?: boolean; [key: string]: unknown }) => {
    const reviews = reviewsByAnalysis.get(item.id) || []
    const latestReview = reviews[0] || null
    return {
      ...item,
      verdict: latestReview?.verdict ?? null,
      review_comment: latestReview?.comment ?? null,
      reviews: reviews.slice(0, 3), // max 3 for card display
    }
  })

  return NextResponse.json({
    metrics: { totalAnalyses: totalAnalyses || 0, reviewed: reviewedCount, pending: pendingCount, verdictDist },
    queue,
  })
}

export async function PATCH(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { analysisId, is_pinned } = await request.json()
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!analysisId || !uuidRegex.test(analysisId) || typeof is_pinned !== "boolean") {
    return NextResponse.json({ error: "valid analysisId and is_pinned required" }, { status: 400 })
  }

  const { error } = await supabase
    .from("analyses")
    .update({ is_pinned })
    .eq("id", analysisId)

  if (error) {
    console.error("analyses pin update error:", error)
    return NextResponse.json({ error: "Operation failed" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ids } = await request.json() as { ids: string[] }
  if (!ids?.length) return NextResponse.json({ error: "ids required" }, { status: 400 })
  if (ids.length > 100) return NextResponse.json({ error: "max 100 ids per request" }, { status: 400 })
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!ids.every(id => uuidRegex.test(id))) return NextResponse.json({ error: "invalid id format" }, { status: 400 })

  // Delete related records first (cascade safety)
  await supabase.from("eval_reviews").delete().in("analysis_id", ids)
  await supabase.from("analysis_items").delete().in("analysis_id", ids)
  await supabase.from("eval_golden_set").delete().in("analysis_id", ids)

  const { error } = await supabase.from("analyses").delete().in("id", ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, deleted: ids.length })
}
