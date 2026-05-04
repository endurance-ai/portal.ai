import { NextRequest, NextResponse } from "next/server"
import { requireApprovedAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabase"

// SPEC-V6-EVAL T-014 — Runs list (REQ-V6-EVAL-003, REQ-V6-EVAL-004)
// 어드민 대시보드용 read-only GET. eval_runs 최근 N개 + algorithm_version 필터.

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const sp = request.nextUrl.searchParams
  const algorithmVersion = sp.get("algorithm_version")
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "20") || 20))

  let query = supabase
    .from("eval_runs")
    .select("*")

  if (algorithmVersion === "v4" || algorithmVersion === "v6") {
    query = query.eq("algorithm_version", algorithmVersion)
  }

  const { data, error } = await query
    .order("computed_at", { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}
