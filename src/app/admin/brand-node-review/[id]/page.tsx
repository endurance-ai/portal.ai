"use client"

import {useCallback, useEffect, useState} from "react"
import {useParams, useRouter} from "next/navigation"
import Link from "next/link"
import {ArrowLeft, Check, Loader2, RotateCcw, X} from "lucide-react"

type QueueRow = {
  id: number
  brand_id: number
  reason: string
  vlm_output: Record<string, unknown> | null
  admin_note: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

type BrandRow = {
  id: number
  brand_name: string
  primary_node_id: number | null
  secondary_node_id: number | null
  node_confidence: number | null
  node_assigned_at: string | null
  node_assigned_model: string | null
  representative_image_urls: string[] | null
  primary_code: string | null
  secondary_code: string | null
  price_band: string | null
  category_type: string | null
}

type StyleNodeLite = {code: string; name_en: string; name_ko: string}

const REASON_LABEL: Record<string, string> = {
  insufficient_images: "이미지 부족",
  low_confidence: "낮은 confidence",
  multi_node_conflict: "노드 충돌",
  vlm_failed: "VLM 실패",
  alias_candidate: "Alias 후보",
}

export default function BrandReviewDetailPage() {
  const router = useRouter()
  const {id} = useParams<{id: string}>()
  const [queue, setQueue] = useState<QueueRow | null>(null)
  const [brand, setBrand] = useState<BrandRow | null>(null)
  const [styleNodes, setStyleNodes] = useState<StyleNodeLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [manualPrimary, setManualPrimary] = useState("")
  const [manualSecondary, setManualSecondary] = useState("")
  const [adminNote, setAdminNote] = useState("")

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/brand-node-review/${id}`).then((r) => r.json()),
      fetch("/api/style-nodes").then((r) => r.json()),
    ])
      .then(([d1, d2]) => {
        if (d1.error) throw new Error(d1.error)
        setQueue(d1.queue)
        setBrand(d1.brand)
        setStyleNodes(d2.nodes ?? [])
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [id])

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setActing(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/brand-node-review/${id}`, {
          method: "PATCH",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "action failed")
        router.push("/admin/brand-node-review")
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setActing(false)
      }
    },
    [id, router],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (!queue) {
    return <div className="p-6 text-destructive text-sm">{error ?? "queue row not found"}</div>
  }

  const vlm = queue.vlm_output ?? {}
  const vlmPrimary = typeof vlm.primary_node === "string" ? (vlm.primary_node as string) : null
  const vlmSecondary = typeof vlm.secondary_node === "string" ? (vlm.secondary_node as string) : null
  const vlmConfidence =
    typeof vlm.primary_confidence === "number" ? (vlm.primary_confidence as number) : null
  const vlmReasoning = typeof vlm.reasoning === "string" ? (vlm.reasoning as string) : null
  const isResolved = queue.resolved_at !== null

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/admin/brand-node-review"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="size-4" />
        목록으로
      </Link>

      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {brand?.brand_name ?? `(brand_id=${queue.brand_id})`}
          </h1>
          <div className="text-xs text-muted-foreground mt-1 font-mono">
            brand#{queue.brand_id} · queue#{queue.id} · {REASON_LABEL[queue.reason] ?? queue.reason}
          </div>
        </div>
        {isResolved && (
          <div className="text-xs text-emerald-500">
            resolved {new Date(queue.resolved_at!).toLocaleString("ko-KR")}
            <br />
            by {queue.resolved_by}
          </div>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* 현재 brand 정보 */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
            Brand 현재 상태
          </h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="primary">
              {brand?.primary_code ?? <span className="text-muted-foreground">미할당</span>}
            </Row>
            <Row label="secondary">
              {brand?.secondary_code ?? <span className="text-muted-foreground">—</span>}
            </Row>
            <Row label="confidence">
              {brand?.node_confidence != null
                ? brand.node_confidence.toFixed(2)
                : <span className="text-muted-foreground">—</span>}
            </Row>
            <Row label="model">
              {brand?.node_assigned_model ?? <span className="text-muted-foreground">—</span>}
            </Row>
            <Row label="rep_count">{brand?.representative_image_urls?.length ?? 0}</Row>
            <Row label="price">{brand?.price_band ?? <span className="text-muted-foreground">—</span>}</Row>
            <Row label="category">
              {brand?.category_type ?? <span className="text-muted-foreground">—</span>}
            </Row>
          </dl>
        </section>

        {/* VLM 출력 */}
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
            VLM 출력
          </h2>
          {vlmPrimary ? (
            <dl className="space-y-1.5 text-sm">
              <Row label="primary">
                <span className="font-mono font-semibold">{vlmPrimary}</span>
              </Row>
              <Row label="secondary">
                {vlmSecondary ? (
                  <span className="font-mono">{vlmSecondary}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
              <Row label="confidence">
                {vlmConfidence != null ? (
                  <span className="font-mono">{vlmConfidence.toFixed(2)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
              {vlmReasoning && (
                <div className="pt-2 mt-2 border-t border-border">
                  <div className="text-xs text-muted-foreground mb-1">reasoning</div>
                  <div className="text-xs leading-relaxed">{vlmReasoning}</div>
                </div>
              )}
            </dl>
          ) : (
            <div className="text-sm text-muted-foreground">
              VLM 출력 없음 (insufficient_images 또는 vlm_failed)
            </div>
          )}
        </section>
      </div>

      {/* representative images — http(s) URL 만 렌더 (javascript: / data: scheme XSS 가드) */}
      {brand?.representative_image_urls && brand.representative_image_urls.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
            Representative Images ({brand.representative_image_urls.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {brand.representative_image_urls.filter(isSafeHttpUrl).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-md overflow-hidden bg-muted/40 hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`rep ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* admin actions */}
      {!isResolved && (
        <section className="rounded-lg border border-border bg-card p-4 space-y-5">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            검수 액션
          </h2>

          {/* Approve VLM */}
          {vlmPrimary && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <strong>Approve VLM</strong> — primary {vlmPrimary}
                {vlmSecondary && `, secondary ${vlmSecondary}`} 그대로 적용
              </div>
              <button
                onClick={() => act({action: "approve"})}
                disabled={acting}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="size-4" />
                Approve
              </button>
            </div>
          )}

          <hr className="border-border" />

          {/* Manual */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Manual 지정</div>
            <div className="flex items-center gap-2">
              <select
                value={manualPrimary}
                onChange={(e) => setManualPrimary(e.target.value)}
                className="flex-1 bg-transparent border border-border rounded-md px-3 py-1.5 text-sm"
              >
                <option value="" className="bg-background">primary —</option>
                {styleNodes.map((n) => (
                  <option key={n.code} value={n.code} className="bg-background">
                    {n.code} · {n.name_ko}
                  </option>
                ))}
              </select>
              <select
                value={manualSecondary}
                onChange={(e) => setManualSecondary(e.target.value)}
                className="flex-1 bg-transparent border border-border rounded-md px-3 py-1.5 text-sm"
              >
                <option value="" className="bg-background">secondary —</option>
                {styleNodes.map((n) => (
                  <option key={n.code} value={n.code} className="bg-background">
                    {n.code} · {n.name_ko}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  act({
                    action: "manual",
                    primary_code: manualPrimary,
                    secondary_code: manualSecondary || null,
                    admin_note: adminNote || undefined,
                  })
                }
                disabled={acting || !manualPrimary}
                className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>

          <hr className="border-border" />

          {/* Rerun */}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <strong>Rerun</strong> — node_assigned_at sentinel 해제. 크롤러/cron 다음
              호출 시 재분류
            </div>
            <button
              onClick={() => act({action: "rerun"})}
              disabled={acting}
              className="inline-flex items-center gap-1 rounded-md border border-blue-500/40 text-blue-500 px-3 py-1.5 text-sm hover:bg-blue-500/10 disabled:opacity-50"
            >
              <RotateCcw className="size-4" />
              Rerun
            </button>
          </div>

          <hr className="border-border" />

          {/* Dismiss */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Dismiss (brand_nodes 변경 없이 큐만 닫음)</div>
            <input
              type="text"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="사유 (옵션)"
              className="w-full bg-transparent border border-border rounded-md px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => act({action: "dismiss", admin_note: adminNote || undefined})}
              disabled={acting}
              className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/40 text-muted-foreground px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
            >
              <X className="size-4" />
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* raw queue payload (디버깅) */}
      <details className="mt-6">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
          raw vlm_output (디버그)
        </summary>
        <pre className="mt-2 p-3 rounded-md bg-muted/40 text-xs font-mono overflow-x-auto">
          {JSON.stringify(queue.vlm_output, null, 2)}
        </pre>
      </details>
    </div>
  )
}

/** http/https URL 만 안전. javascript: / data: / about: 등 차단. */
function isSafeHttpUrl(url: unknown): url is string {
  if (typeof url !== "string") return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function Row({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-sm">{children}</dd>
    </div>
  )
}
