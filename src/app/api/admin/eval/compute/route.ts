import { NextRequest, NextResponse } from "next/server"
import { requireApprovedAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabase"
import { computeRun } from "@/lib/eval/run-snapshot"
import { routeAlgorithmVersion } from "@/lib/eval/judgment-store"

// SPEC-V6-EVAL T-012 — Metric compute (REQ-V6-EVAL-003)

interface ComputeBody {
  algorithmVersion?: string
  rankedResults?: Array<{ goldenQueryId?: string; productOrder?: string[] }>
  notes?: string
}

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const body = (await request.json().catch(() => ({}))) as ComputeBody
  if (!body.algorithmVersion || !Array.isArray(body.rankedResults) || body.rankedResults.length === 0) {
    return NextResponse.json(
      { error: "algorithmVersion + 비어있지 않은 rankedResults 필수" },
      { status: 400 },
    )
  }

  let algorithmVersion: "v4" | "v6"
  try {
    algorithmVersion = routeAlgorithmVersion(body.algorithmVersion)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // 1) judgment 완전성 체크 — 각 goldenQueryId 에 최소 1개 라벨 (relevance_grade NOT NULL)
  const queryIds = body.rankedResults
    .map((r) => r.goldenQueryId)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
  if (queryIds.length !== body.rankedResults.length) {
    return NextResponse.json({ error: "rankedResults 항목 모두 goldenQueryId 필수" }, { status: 400 })
  }

  const { data: judgmentRows, error: jErr } = await supabase
    .from("eval_judgments")
    .select("golden_query_id")
    .in("golden_query_id", queryIds)
    .eq("algorithm_version", algorithmVersion)
    .not("relevance_grade", "is", null)

  if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 })

  const labeledSet = new Set((judgmentRows ?? []).map((r) => r.golden_query_id as string))
  const missing = queryIds.filter((id) => !labeledSet.has(id))
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "라벨링 미완료 쿼리 존재", missingGoldenQueryIds: missing },
      { status: 422 },
    )
  }

  // 2) compute
  try {
    const runResult = await computeRun({
      algorithmVersion,
      rankedResults: body.rankedResults.map((r) => ({
        goldenQueryId: r.goldenQueryId as string,
        productOrder: (r.productOrder ?? []) as string[],
      })),
      notes: body.notes,
    })
    return NextResponse.json(runResult, { status: 201 })
  } catch (e) {
    const msg = (e as Error).message
    if (/baseline already frozen/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
