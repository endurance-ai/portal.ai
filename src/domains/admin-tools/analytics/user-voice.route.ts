import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {requireApprovedAdmin} from "@/lib/admin-auth"

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get("filter") || "all"
  const page = parseInt(searchParams.get("page") || "1", 10)
  const pageSize = 20
  const offset = (page - 1) * pageSize

  // Metrics
  const [
    { count: totalCount },
    { count: upCount },
    { count: _downCount },
    { count: emailCount },
    { count: weekCount },
    { data: refineData },
  ] = await Promise.all([
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }).eq("rating", "up"),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }).eq("rating", "down"),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }).not("email", "is", null),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from("analysis_sessions").select("analysis_count").gt("analysis_count", 1),
  ])

  const total = totalCount ?? 0
  const up = upCount ?? 0
  const positiveRate = total > 0 ? Math.round((up / total) * 100) : 0
  const refineSessions = refineData?.length ?? 0
  const avgTurns = refineData && refineData.length > 0
    ? +(refineData.reduce((s, r) => s + r.analysis_count, 0) / refineData.length).toFixed(1)
    : 0

  // Tag distribution (from down feedbacks only)
  const { data: downFeedbacks } = await supabase
    .from("user_feedbacks")
    .select("tags")
    .eq("rating", "down")

  const tagCounts: Record<string, number> = {}
  let totalTags = 0
  for (const fb of downFeedbacks ?? []) {
    for (const tag of (fb.tags as string[]) ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
      totalTags++
    }
  }

  const tagDistribution = Object.entries(tagCounts)
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: totalTags > 0 ? Math.round((count / totalTags) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Feedback list
  let query = supabase
    .from("user_feedbacks")
    .select("id, rating, tags, comment, email, created_at, session_id, analysis_id")
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (filter === "up") query = query.eq("rating", "up")
  else if (filter === "down") query = query.eq("rating", "down")
  else if (filter === "text") query = query.not("comment", "is", null)
  else if (filter === "email") query = query.not("email", "is", null)

  const { data: feedbacks } = await query

  // Batch: get all unique session IDs from this page
  const sessionIds = [...new Set((feedbacks ?? []).filter(fb => fb.session_id).map(fb => fb.session_id as string))]

  const [{ data: sessions }, { data: allAnalyses }] = await Promise.all([
    sessionIds.length > 0
      ? supabase.from("analysis_sessions").select("id, analysis_count").in("id", sessionIds)
      : Promise.resolve({ data: [] as { id: string; analysis_count: number }[] }),
    sessionIds.length > 0
      ? supabase.from("analyses").select("session_id, sequence_number, prompt_text, refinement_prompt")
          .in("session_id", sessionIds).order("sequence_number", { ascending: true })
      : Promise.resolve({ data: [] as { session_id: string; sequence_number: number | null; prompt_text: string | null; refinement_prompt: string | null }[] }),
  ])

  // Index by session_id
  const sessionMap = new Map((sessions ?? []).map(s => [s.id, s]))
  const analysesMap = new Map<string, typeof allAnalyses>()
  for (const a of allAnalyses ?? []) {
    if (!analysesMap.has(a.session_id)) analysesMap.set(a.session_id, [])
    analysesMap.get(a.session_id)!.push(a)
  }

  const enrichedFeedbacks = (feedbacks ?? []).map(fb => {
    const session = fb.session_id ? sessionMap.get(fb.session_id) : null
    const sessionAnalyses = fb.session_id ? (analysesMap.get(fb.session_id) ?? []) : []

    const journey = (sessionAnalyses ?? []).map(a => ({
      sequence: a.sequence_number ?? 1,
      prompt: a.refinement_prompt || a.prompt_text || "",
    }))

    // Mask email
    const maskedEmail = fb.email
      ? fb.email.replace(/^(.{1,3}).*(@.*)$/, (_match: string, p1: string, p2: string) => p1 + "***" + p2)
      : null

    return {
      id: fb.id,
      rating: fb.rating,
      tags: fb.tags ?? [],
      comment: fb.comment,
      email: maskedEmail,
      createdAt: fb.created_at,
      session: {
        id: fb.session_id,
        analysisCount: session?.analysis_count ?? 1,
        journey,
      },
    }
  })

  // Get total count for pagination
  let countQuery = supabase.from("user_feedbacks").select("*", { count: "exact", head: true })
  if (filter === "up") countQuery = countQuery.eq("rating", "up")
  else if (filter === "down") countQuery = countQuery.eq("rating", "down")
  else if (filter === "text") countQuery = countQuery.not("comment", "is", null)
  else if (filter === "email") countQuery = countQuery.not("email", "is", null)
  const { count: filteredCount } = await countQuery

  const totalPages = Math.ceil((filteredCount ?? total) / pageSize)

  return NextResponse.json({
    metrics: {
      totalFeedbacks: total,
      positiveRate,
      refineSessions,
      avgTurns,
      emailCount: emailCount ?? 0,
      emailConversion: total > 0 ? +((emailCount ?? 0) / total * 100).toFixed(1) : 0,
      weeklyDelta: weekCount ?? 0,
    },
    tagDistribution,
    feedbacks: enrichedFeedbacks,
    pagination: { page, totalPages, totalCount: filteredCount ?? total },
  })
}
