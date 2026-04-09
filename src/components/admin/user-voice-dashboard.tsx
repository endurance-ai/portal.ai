"use client"

import {useCallback, useEffect, useState} from "react"
import {cn} from "@/lib/utils"
import {ChevronDown, ChevronLeft, ChevronRight, Loader2} from "lucide-react"

type Filter = "all" | "up" | "down" | "text" | "email"

interface Metrics {
  totalFeedbacks: number
  positiveRate: number
  refineSessions: number
  avgTurns: number
  emailCount: number
  emailConversion: number
  weeklyDelta: number
}

interface TagDist {
  tag: string
  count: number
  percentage: number
}

interface Feedback {
  id: string
  rating: "up" | "down"
  tags: string[]
  comment: string | null
  email: string | null
  createdAt: string
  session: {
    id: string
    analysisCount: number
    journey: { sequence: number; prompt: string }[]
  }
}

const TAG_LABELS: Record<string, string> = {
  style_mismatch: "스타일이 달라요",
  price_high: "가격대가 높아요",
  product_irrelevant: "상품이 안 맞아요",
  few_results: "결과가 너무 적어요",
  category_wrong: "카테고리가 틀려요",
  color_off: "색감이 달라요",
  brand_unfamiliar: "브랜드가 낯설어요",
  other: "기타",
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "up", label: "👍" },
  { key: "down", label: "👎" },
  { key: "text", label: "💬 텍스트" },
  { key: "email", label: "📧 이메일" },
]

export function UserVoiceDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [tagDist, setTagDist] = useState<TagDist[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/user-voice?filter=${filter}&page=${page}`)
      if (!res.ok) return
      const data = await res.json()
      setMetrics(data.metrics)
      setTagDist(data.tagDistribution)
      setFeedbacks(data.feedbacks)
      setTotalPages(data.pagination.totalPages)
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => { fetchData() }, [fetchData])

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className="space-y-8">
      {/* Metric cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="총 피드백" value={metrics.totalFeedbacks} sub={`+${metrics.weeklyDelta} this week`} subColor="text-turquoise" />
          <MetricCard label="긍정률" value={`${metrics.positiveRate}%`} bar={metrics.positiveRate} />
          <MetricCard label="리파인 세션" value={metrics.refineSessions} sub={`avg ${metrics.avgTurns} turns`} />
          <MetricCard label="이메일 수집" value={metrics.emailCount} sub={`${metrics.emailConversion}% conversion`} subColor="text-turquoise" />
        </div>
      )}

      {/* Tag distribution */}
      {tagDist.length > 0 && (
        <div className="p-5 bg-card border border-border rounded-lg">
          <h3 className="text-sm font-semibold text-foreground mb-3">부정 피드백 태그 분포</h3>
          <div className="space-y-2">
            {tagDist.slice(0, 5).map((t) => (
              <div key={t.tag} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 font-mono truncate">
                  {TAG_LABELS[t.tag] || t.tag}
                </span>
                <div className="flex-1 h-7 bg-surface-dim rounded overflow-hidden relative">
                  <div
                    className="h-full bg-turquoise/30 rounded"
                    style={{ width: `${t.percentage}%` }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {t.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">최근 피드백</h3>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setPage(1) }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-mono transition-colors",
                  filter === f.key
                    ? "bg-primary text-background"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {feedbacks.map((fb) => (
              <div key={fb.id} className="border border-border rounded-lg overflow-hidden">
                <div className="p-4 flex gap-3 items-start">
                  <span className="text-xl shrink-0 mt-0.5">{fb.rating === "up" ? "👍" : "👎"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex gap-1 flex-wrap">
                        {fb.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-red-400/10 border border-red-400/20 rounded-md text-xs text-red-400 font-mono"
                          >
                            {TAG_LABELS[tag] || tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-on-surface-variant font-mono shrink-0">
                        {timeAgo(fb.createdAt)}
                      </span>
                    </div>
                    {fb.comment ? (
                      <p className="text-sm text-foreground leading-relaxed mb-1">{fb.comment}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">텍스트 피드백 없음</p>
                    )}
                    <div className="flex items-center gap-2">
                      {fb.email && (
                        <span className="text-xs text-turquoise font-mono">📧 {fb.email}</span>
                      )}
                      <span className="text-xs text-on-surface-variant font-mono">
                        세션 {fb.session.analysisCount}턴
                      </span>
                      {fb.session.journey.length > 1 && (
                        <button
                          onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                          className="text-xs text-turquoise font-mono flex items-center gap-0.5 hover:underline"
                        >
                          여정 보기
                          <ChevronDown className={cn("size-3 transition-transform", expandedId === fb.id && "rotate-180")} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Session journey */}
                {expandedId === fb.id && fb.session.journey.length > 1 && (
                  <div className="px-3 pb-3 pt-1 bg-surface-dim border-t border-border">
                    <p className="text-xs font-mono text-turquoise uppercase tracking-widest mb-2">Session Journey</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {fb.session.journey.map((step, i) => (
                        <span key={i} className="contents">
                          <span className="px-2 py-1 bg-card border border-border rounded-md text-xs text-muted-foreground font-mono max-w-[160px] truncate">
                            {step.sequence}. &ldquo;{step.prompt}&rdquo;
                          </span>
                          {i < fb.session.journey.length - 1 && (
                            <span className="text-on-surface-variant text-sm">→</span>
                          )}
                        </span>
                      ))}
                      <span className="text-sm">{fb.rating === "up" ? "👍" : "👎"}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-md border border-border hover:bg-card disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-mono text-muted-foreground">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-md border border-border hover:bg-card disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  label, value, sub, subColor, bar,
}: {
  label: string; value: number | string; sub?: string; subColor?: string; bar?: number
}) {
  return (
    <div className="p-3.5 bg-card border border-border rounded-lg">
      <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {bar !== undefined && (
        <div className="h-1 bg-surface-dim rounded mt-1.5 overflow-hidden">
          <div className="h-full bg-turquoise rounded" style={{ width: `${bar}%` }} />
        </div>
      )}
      {sub && (
        <p className={cn("text-xs mt-0.5", subColor || "text-muted-foreground")}>{sub}</p>
      )}
    </div>
  )
}
