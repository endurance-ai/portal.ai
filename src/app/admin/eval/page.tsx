"use client"

import { useCallback, useEffect, useState } from "react"
import { EvalMetrics } from "@/components/admin/eval-metrics"
import { EvalQueue } from "@/components/admin/eval-queue"
import { EvalGoldenSet } from "@/components/admin/eval-golden-set"
import { Button } from "@/components/ui/button"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

type Filter = "all" | "pending" | "reviewed"
type Tab = "queue" | "golden"

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: "all",      label: "전체" },
  { key: "pending",  label: "대기" },
  { key: "reviewed", label: "완료" },
]

const MAIN_TABS: { key: Tab; label: string }[] = [
  { key: "queue",  label: "평가 대기열" },
  { key: "golden", label: "골든셋" },
]

export default function EvalPage() {
  const [metrics, setMetrics] = useState<{
    totalAnalyses: number
    reviewed: number
    pending: number
    verdictDist: { pass: number; fail: number; partial: number }
  } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [queue, setQueue] = useState<any[]>([])
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<Filter>("all")
  const [tab, setTab] = useState<Tab>("queue")
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/eval?page=${page}&filter=${filter}`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics)
        setQueue(data.queue)
      }
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => { fetchData() }, [fetchData])

  function handleFilter(f: Filter) {
    setFilter(f)
    setPage(0)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">품질 평가</h1>

      {loading && !metrics ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {metrics && <EvalMetrics metrics={metrics} />}

          {/* Main tabs */}
          <div className="flex items-center gap-4 border-b border-border">
            {MAIN_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                  tab === key
                    ? "border-turquoise text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Queue tab */}
          {tab === "queue" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-1 rounded-md border border-border p-0.5 bg-muted/30">
                  {FILTER_TABS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleFilter(key)}
                      className={cn(
                        "rounded px-3 py-1 text-xs font-medium transition-colors",
                        filter === key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                      {metrics && key === "pending" && (
                        <span className="ml-1.5 tabular-nums opacity-60">{metrics.pending}</span>
                      )}
                      {metrics && key === "reviewed" && (
                        <span className="ml-1.5 tabular-nums opacity-60">{metrics.reviewed}</span>
                      )}
                    </button>
                  ))}
                </div>
                {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </div>

              <EvalQueue queue={queue} onRefresh={fetchData} />

              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">{page + 1} 페이지</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={queue.length < 20}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Golden Set tab */}
          {tab === "golden" && <EvalGoldenSet />}
        </>
      )}
    </div>
  )
}
