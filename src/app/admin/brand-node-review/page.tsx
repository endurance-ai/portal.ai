import Link from "next/link"
import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {ProcessRerunsButton} from "@/components/admin/process-reruns-button"

export const dynamic = "force-dynamic"

type Row = {
  id: number
  brand_id: number
  reason: string
  admin_note: string | null
  resolved_at: string | null
  created_at: string
  brand: {name: string; primary_code: string | null; confidence: number | null} | null
}

const REASON_LABEL: Record<string, string> = {
  insufficient_images: "이미지 부족",
  low_confidence: "낮은 confidence",
  multi_node_conflict: "노드 충돌",
  vlm_failed: "VLM 실패",
  alias_candidate: "Alias 후보",
}

const REASON_COLOR: Record<string, string> = {
  insufficient_images: "text-amber-500",
  low_confidence: "text-yellow-500",
  multi_node_conflict: "text-orange-500",
  vlm_failed: "text-destructive",
  alias_candidate: "text-blue-500",
}

export default async function BrandNodeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{status?: string; reason?: string}>
}) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) {
    return <div className="p-6 text-sm text-muted-foreground">관리자 권한이 필요합니다.</div>
  }
  const sp = await searchParams
  const status = sp.status ?? "open"
  const reason = sp.reason ?? null

  let q = supabase
    .from("brand_node_review_queue")
    .select(
      "id, brand_id, reason, admin_note, resolved_at, created_at",
      {count: "exact"},
    )
    .order("created_at", {ascending: false})
    .limit(200)
  if (status === "open") q = q.is("resolved_at", null)
  else if (status === "resolved") q = q.not("resolved_at", "is", null)
  if (reason) q = q.eq("reason", reason)

  const {data: rows, count, error} = await q
  if (error) {
    return <div className="p-6 text-sm text-destructive">오류: {error.message}</div>
  }

  // pending rerun 카운트 (status / reason 필터와 무관하게 전체 미처리)
  const {count: pendingRerunCount} = await supabase
    .from("brand_node_review_queue")
    .select("id", {count: "exact", head: true})
    .eq("admin_note", "RERUN_REQUESTED")
    .is("resolved_at", null)

  // brand 조인
  const brandIds = Array.from(new Set((rows ?? []).map((r) => r.brand_id)))
  const brandMap = new Map<number, Row["brand"]>()
  if (brandIds.length > 0) {
    const {data: brands} = await supabase
      .from("brand_nodes")
      .select("id, brand_name, primary_node_id, node_confidence")
      .in("id", brandIds)
    const styleIds = (brands ?? []).map((b) => b.primary_node_id).filter(Boolean) as number[]
    let styleMap = new Map<number, string>()
    if (styleIds.length > 0) {
      const {data: styles} = await supabase
        .from("style_nodes")
        .select("id, code")
        .in("id", styleIds)
      styleMap = new Map((styles ?? []).map((s) => [s.id, s.code]))
    }
    for (const b of brands ?? []) {
      brandMap.set(b.id, {
        name: b.brand_name,
        primary_code: b.primary_node_id ? styleMap.get(b.primary_node_id) ?? null : null,
        confidence: b.node_confidence,
      })
    }
  }

  const enriched: Row[] = (rows ?? []).map((r) => ({...r, brand: brandMap.get(r.brand_id) ?? null}))

  // group by reason for sticky header in open mode
  const grouped = new Map<string, Row[]>()
  for (const r of enriched) {
    const list = grouped.get(r.reason) ?? []
    list.push(r)
    grouped.set(r.reason, list)
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">브랜드 노드 검수</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Brand-VLM 분류 검수 큐. open {count ?? 0}건
            {pendingRerunCount ? ` · rerun pending ${pendingRerunCount}건` : ""}.
          </p>
        </div>
        <ProcessRerunsButton pendingCount={pendingRerunCount ?? 0} />
      </div>

      {/* status / reason 필터 */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        {(["open", "resolved", "all"] as const).map((s) => (
          <Link
            key={s}
            href={`?status=${s}${reason ? `&reason=${reason}` : ""}`}
            className={
              status === s
                ? "px-2.5 py-1 rounded-md bg-foreground text-background"
                : "px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted/40"
            }
          >
            {s === "open" ? "미해결" : s === "resolved" ? "해결됨" : "전체"}
          </Link>
        ))}
        <div className="h-5 w-px bg-border mx-1" />
        <Link
          href={`?status=${status}`}
          className={
            !reason
              ? "px-2 py-1 rounded-md bg-muted text-foreground"
              : "px-2 py-1 rounded-md text-muted-foreground hover:bg-muted/40"
          }
        >
          all reasons
        </Link>
        {Object.keys(REASON_LABEL).map((r) => (
          <Link
            key={r}
            href={`?status=${status}&reason=${r}`}
            className={
              reason === r
                ? "px-2 py-1 rounded-md bg-muted text-foreground"
                : "px-2 py-1 rounded-md text-muted-foreground hover:bg-muted/40"
            }
          >
            {REASON_LABEL[r]}
          </Link>
        ))}
      </div>

      {enriched.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">검수 대상 없음 ✨</div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([reasonKey, list]) => (
            <section key={reasonKey}>
              <h2
                className={`text-xs uppercase tracking-wider font-semibold mb-2 ${
                  REASON_COLOR[reasonKey] ?? "text-foreground"
                }`}
              >
                {REASON_LABEL[reasonKey] ?? reasonKey} · {list.length}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2">brand</th>
                      <th className="text-left px-4 py-2 hidden md:table-cell">현재 노드</th>
                      <th className="text-left px-4 py-2 hidden md:table-cell w-24">confidence</th>
                      <th className="text-left px-4 py-2 hidden lg:table-cell w-32">생성</th>
                      <th className="text-right px-4 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/brand-node-review/${r.id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {r.brand?.name ?? `(brand_id=${r.brand_id})`}
                          </Link>
                          <div className="text-xs text-muted-foreground font-mono">
                            #{r.brand_id} · queue#{r.id}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono hidden md:table-cell">
                          {r.brand?.primary_code ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono hidden md:table-cell">
                          {r.brand?.confidence != null ? r.brand.confidence.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                          {new Date(r.created_at).toLocaleString("ko-KR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.resolved_at && (
                            <span className="text-xs text-emerald-500">resolved</span>
                          )}
                          {!r.resolved_at && r.admin_note === "RERUN_REQUESTED" && (
                            <span className="text-xs text-blue-500">rerun pending</span>
                          )}
                          {!r.resolved_at && r.admin_note?.startsWith("RERUN_FAILED") && (
                            <span
                              className="text-xs text-destructive"
                              title={r.admin_note}
                            >
                              rerun failed
                            </span>
                          )}
                          {!r.resolved_at &&
                            (!r.admin_note ||
                              (r.admin_note !== "RERUN_REQUESTED" &&
                                !r.admin_note.startsWith("RERUN_FAILED"))) && (
                              <Link
                                href={`/admin/brand-node-review/${r.id}`}
                                className="text-xs text-foreground hover:underline"
                              >
                                검수 →
                              </Link>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
