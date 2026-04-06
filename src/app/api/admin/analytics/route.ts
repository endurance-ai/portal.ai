import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const tab = searchParams.get("tab") || "analyses"
  const page = parseInt(searchParams.get("page") || "0")
  const limit = 30

  if (tab === "analyses") {
    const { data, count } = await supabase
      .from("analyses")
      .select("id, created_at, image_filename, style_node_primary, style_node_confidence, detected_gender, items, analysis_duration_ms, search_duration_ms", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    return NextResponse.json({ analyses: data, total: count })
  }

  if (tab === "activity") {
    const days = Math.min(parseInt(searchParams.get("days") || "30"), 365)
    const sinceDate = new Date(Date.now() - days * 86400000).toISOString()

    const [analysesRes, searchQualityRes] = await Promise.all([
      supabase
        .from("analyses")
        .select("created_at, style_node_primary, detected_gender, analysis_duration_ms, search_duration_ms, image_filename, items")
        .gte("created_at", sinceDate),
      supabase
        .from("search_quality_logs")
        .select("category, subcategory, result_count, top_score, avg_score, is_empty, created_at")
        .gte("created_at", sinceDate),
    ])

    return NextResponse.json({
      analyses: analysesRes.data || [],
      searchQuality: searchQualityRes.data || [],
    })
  }

  return NextResponse.json({ error: "Invalid tab" }, { status: 400 })
}
