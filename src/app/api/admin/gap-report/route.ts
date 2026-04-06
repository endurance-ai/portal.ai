import {NextResponse} from "next/server"
import {createSupabaseServer} from "@/lib/supabase-server"
import {supabase} from "@/lib/supabase"

export async function GET() {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString()

    // Get search demand by subcategory/query
    const { data: searchLogs } = await supabase
      .from("search_quality_logs")
      .select("query_category,query_subcategory,total,result_count")
      .gte("created_at", since)

    // Get product counts by category/subcategory
    const { data: products } = await supabase
      .from("products")
      .select("category,subcategory")
      .limit(30000)

    // Aggregate search demand
    const demandMap = new Map<string, { searches: number; label: string }>()
    for (const log of searchLogs || []) {
      const key = `${log.query_category}::${log.query_subcategory || ""}`
      const label = log.query_subcategory
        ? `${log.query_category} > ${log.query_subcategory}`
        : log.query_category || "Unknown"
      const prev = demandMap.get(key) || { searches: 0, label }
      demandMap.set(key, { searches: prev.searches + (log.total || 1), label })
    }

    // Aggregate product supply
    const supplyMap = new Map<string, number>()
    for (const p of products || []) {
      const key = `${p.category}::${p.subcategory || ""}`
      supplyMap.set(key, (supplyMap.get(key) || 0) + 1)
    }

    // Build gap report
    const gaps = Array.from(demandMap.entries()).map(([key, { searches, label }]) => {
      const dbProducts = supplyMap.get(key) || 0
      const ratio = dbProducts > 0 ? searches / dbProducts : searches * 10
      let severity: "critical" | "warning" | "good" = "good"
      if (dbProducts < 20 && searches > 30) severity = "critical"
      else if (dbProducts < 50 && searches > 20) severity = "warning"
      return { query: label, searches, dbProducts, gapScore: Math.round(ratio * 10) / 10, severity }
    })

    gaps.sort((a, b) => b.gapScore - a.gapScore)

    return NextResponse.json({ gaps: gaps.slice(0, 20) })
  } catch (err) {
    console.error("Gap report error:", err)
    return NextResponse.json({ error: "Failed to generate gap report" }, { status: 500 })
  }
}
