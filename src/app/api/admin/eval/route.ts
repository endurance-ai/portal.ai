import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = parseInt(searchParams.get("page") || "0")
  const filter = searchParams.get("filter") || "all" // all | pending | reviewed
  const limit = 20

  const { count: totalAnalyses } = await supabase
    .from("analyses").select("*", { count: "exact", head: true })

  let allReviews: { analysis_id: string; verdict: string; comment: string | null }[] = []
  try {
    const { data, error } = await supabase
      .from("eval_reviews").select("analysis_id, verdict, comment").order("created_at", { ascending: true })
    if (!error && data) allReviews = data
  } catch {
    // table doesn't exist yet
  }

  // Keep only the first (earliest) review per analysis for display
  const reviewMap = new Map<string, { verdict: string; comment: string | null }>()
  for (const r of allReviews) {
    if (!reviewMap.has(r.analysis_id)) {
      reviewMap.set(r.analysis_id, { verdict: r.verdict, comment: r.comment })
    }
  }
  const reviewedIds = new Set(allReviews.map(r => r.analysis_id))
  const reviewedCount = reviewedIds.size
  const pendingCount = (totalAnalyses || 0) - reviewedCount

  const verdictDist = { pass: 0, fail: 0, partial: 0 }
  reviewMap.forEach(r => { verdictDist[r.verdict as keyof typeof verdictDist]++ })

  // Return empty for reviewed filter when no reviews
  if (filter === "reviewed" && reviewedIds.size === 0) {
    return NextResponse.json({
      metrics: { totalAnalyses: totalAnalyses || 0, reviewed: reviewedCount, pending: pendingCount, verdictDist },
      queue: [],
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("analyses")
    .select("id, created_at, image_filename, prompt_text, style_node_primary, style_node_confidence, detected_gender, items")
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (filter === "pending" && reviewedIds.size > 0) {
    query = query.not("id", "in", `(${[...reviewedIds].join(",")})`)
  } else if (filter === "reviewed") {
    query = query.in("id", [...reviewedIds])
  }

  const { data: analyses } = await query

  const queue = (analyses || []).map((item: { id: string; [key: string]: unknown }) => {
    const review = reviewMap.get(item.id)
    return {
      ...item,
      verdict: review?.verdict ?? null,
      review_comment: review?.comment ?? null,
    }
  })

  return NextResponse.json({
    metrics: { totalAnalyses: totalAnalyses || 0, reviewed: reviewedCount, pending: pendingCount, verdictDist },
    queue,
  })
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
