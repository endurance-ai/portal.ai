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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const { data: analyses } = await supabase
      .from("analyses")
      .select("created_at, style_node_primary, detected_gender")
      .gte("created_at", thirtyDaysAgo)

    const { data: logs } = await supabase
      .from("api_access_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    return NextResponse.json({ analyses: analyses || [], accessLogs: logs || [] })
  }

  return NextResponse.json({ error: "Invalid tab" }, { status: 400 })
}
