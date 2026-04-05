import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get("days") || "7", 10)

  const since = new Date()
  since.setDate(since.getDate() - days)

  // 1. Overall stats
  const { data: stats } = await supabase
    .from("search_quality_logs")
    .select("is_empty, query_category, top_score, result_count", { count: "exact" })
    .gte("created_at", since.toISOString())

  const total = stats?.length || 0
  const emptyCount = stats?.filter((s) => s.is_empty).length || 0
  const avgTopScore =
    total > 0 ? stats!.reduce((sum, s) => sum + (s.top_score || 0), 0) / total : 0

  // 2. Category breakdown
  const categoryMap: Record<string, { total: number; empty: number }> = {}
  for (const s of stats || []) {
    const cat = s.query_category || "unknown"
    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, empty: 0 }
    categoryMap[cat].total++
    if (s.is_empty) categoryMap[cat].empty++
  }

  const categories = Object.entries(categoryMap).map(([category, data]) => ({
    category,
    total: data.total,
    empty: data.empty,
    successRate:
      data.total > 0
        ? (((data.total - data.empty) / data.total) * 100).toFixed(1)
        : "0",
  }))

  // 3. Recent empties (top 10)
  const { data: recentEmpties } = await supabase
    .from("search_quality_logs")
    .select(
      "item_id, query_category, query_subcategory, query_color_family, query_style_node, created_at"
    )
    .eq("is_empty", true)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(10)

  return NextResponse.json({
    period: `${days}d`,
    total,
    emptyCount,
    emptyRate: total > 0 ? ((emptyCount / total) * 100).toFixed(1) : "0",
    avgTopScore: avgTopScore.toFixed(3),
    categories,
    recentEmpties: recentEmpties || [],
  })
}
