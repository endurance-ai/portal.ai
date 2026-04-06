import {NextResponse} from "next/server"
import {createSupabaseServer} from "@/lib/supabase-server"
import {supabase} from "@/lib/supabase"

export async function GET() {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString()

    const [todayRes, yesterdayRes, evalRes, searchRes, searchYesterdayRes] = await Promise.all([
      supabase.from("analyses").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
      supabase.from("analyses").select("id", { count: "exact", head: true }).gte("created_at", yesterdayStart).lt("created_at", todayStart),
      supabase.from("analyses").select("id", { count: "exact", head: true }).is("eval_verdict", null),
      supabase.from("search_quality_logs").select("empty_count,total").gte("created_at", todayStart).limit(500),
      supabase.from("search_quality_logs").select("empty_count,total").gte("created_at", yesterdayStart).lt("created_at", todayStart).limit(500),
    ])

    const todayCount = todayRes.count ?? 0
    const yesterdayCount = yesterdayRes.count ?? 0
    const evalBacklog = evalRes.count ?? 0

    const calcQuality = (rows: { empty_count: number; total: number }[] | null) => {
      if (!rows || rows.length === 0) return 0
      const totalSearches = rows.reduce((s, r) => s + (r.total || 0), 0)
      const totalEmpty = rows.reduce((s, r) => s + (r.empty_count || 0), 0)
      return totalSearches > 0 ? Math.round(((totalSearches - totalEmpty) / totalSearches) * 1000) / 10 : 0
    }

    const searchQuality = calcQuality(searchRes.data)
    const searchQualityYesterday = calcQuality(searchYesterdayRes.data)
    const analysisDelta = yesterdayCount > 0 ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : 0
    const qualityDelta = Math.round((searchQuality - searchQualityYesterday) * 10) / 10
    const aiCost = Math.round(todayCount * 0.003 * 100) / 100

    // Action items
    const { data: categoryStats } = await supabase
      .from("search_quality_logs")
      .select("category,empty_count,total")
      .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString())

    const categoryMap = new Map<string, { total: number; empty: number }>()
    for (const row of categoryStats || []) {
      const cat = row.category || "Unknown"
      const prev = categoryMap.get(cat) || { total: 0, empty: 0 }
      categoryMap.set(cat, { total: prev.total + (row.total || 0), empty: prev.empty + (row.empty_count || 0) })
    }

    const actionItems = Array.from(categoryMap.entries())
      .map(([cat, { total, empty }]) => ({
        category: cat,
        emptyRate: total > 0 ? Math.round((empty / total) * 1000) / 10 : 0,
        total,
      }))
      .filter((item) => item.emptyRate > 25)
      .sort((a, b) => b.emptyRate - a.emptyRate)
      .slice(0, 5)

    return NextResponse.json({
      today: { count: todayCount, delta: analysisDelta },
      searchQuality: { rate: searchQuality, delta: qualityDelta },
      evalBacklog,
      aiCost,
      actionItems,
    })
  } catch (err) {
    console.error("Pipeline health error:", err)
    return NextResponse.json({ error: "Failed to fetch pipeline health" }, { status: 500 })
  }
}
