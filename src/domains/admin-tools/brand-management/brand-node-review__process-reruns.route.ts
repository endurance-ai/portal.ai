import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CONCURRENCY = 4
const MAX_BATCH = 50    // 한 번에 처리할 상한 (DoS 가드)

/**
 * POST /api/admin/brand-node-review/process-reruns
 *
 * admin_note='RERUN_REQUESTED' AND resolved_at IS NULL 인 queue row 들을 일괄 처리.
 * 각 row 마다 /api/internal/classify-brand 를 force=true 로 호출.
 * 성공 시 queue resolve, 실패 시 admin_note 에 RERUN_FAILED 마크.
 *
 * 동시성 4. 한 번에 최대 50건.
 */
export async function POST() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  // 1) pickup
  const {data: pending, error} = await supabase
    .from("brand_node_review_queue")
    .select("id, brand_id")
    .eq("admin_note", "RERUN_REQUESTED")
    .is("resolved_at", null)
    .order("created_at", {ascending: true})
    .limit(MAX_BATCH)

  if (error) return NextResponse.json({error: error.message}, {status: 500})
  if (!pending || pending.length === 0) {
    return NextResponse.json({ok: true, processed: 0, message: "no pending reruns"})
  }

  // Self-call 만 사용. NEXTAUTH_URL 등 외부 env 변조 위험 회피 (SSRF 가드).
  // dev / prod 모두 같은 컨테이너 내부에서 도는 endpoint 라 loopback OK.
  const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3000"}`
  const internalKey = process.env.INTERNAL_API_KEY
  if (!internalKey) {
    return NextResponse.json(
      {error: "INTERNAL_API_KEY not configured on server"},
      {status: 500},
    )
  }

  const results: Array<{
    id: number
    brand_id: number
    status: string
    error?: string
    primary_node?: string
    secondary_node?: string | null
    confidence?: number
  }> = []

  // 2) 동시성 4 chunk 로 처리
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await fetch(`${baseUrl}/api/internal/classify-brand`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Key": internalKey,
            },
            body: JSON.stringify({brand_id: p.brand_id, force: true}),
            // classify-brand 호출당 평균 9초. hang 시 25초 컷.
            signal: AbortSignal.timeout(25_000),
          })
          const data = await res.json()

          if (res.ok && (data.result === "classified" || data.result === "queued")) {
            // 성공: queue resolve
            await supabase
              .from("brand_node_review_queue")
              .update({
                resolved_at: new Date().toISOString(),
                resolved_by: "batch:reruns",
                admin_note: `processed: ${data.result}`,
              })
              .eq("id", p.id)
            return {
              id: p.id,
              brand_id: p.brand_id,
              status: data.result,
              primary_node: data.primary_node,
              secondary_node: data.secondary_node,
              confidence: data.confidence,
            }
          }

          // 실패: admin_note 마크 (queue 는 open 유지 — 다음 batch 에서 재시도 가능)
          const errMsg = data.error ?? `http ${res.status}`
          await supabase
            .from("brand_node_review_queue")
            .update({admin_note: `RERUN_FAILED: ${errMsg.slice(0, 200)}`})
            .eq("id", p.id)
          return {id: p.id, brand_id: p.brand_id, status: "failed", error: errMsg}
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          await supabase
            .from("brand_node_review_queue")
            .update({admin_note: `RERUN_FAILED: ${msg.slice(0, 200)}`})
            .eq("id", p.id)
          return {id: p.id, brand_id: p.brand_id, status: "failed", error: msg}
        }
      }),
    )
    results.push(...batchResults)
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    classified: results.filter((r) => r.status === "classified").length,
    queued: results.filter((r) => r.status === "queued").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  })
}
