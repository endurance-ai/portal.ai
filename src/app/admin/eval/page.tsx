"use client"

import { useCallback, useEffect, useState } from "react"
import { EvalMetrics } from "@/components/admin/eval-metrics"
import { EvalQueue } from "@/components/admin/eval-queue"
import { Button } from "@/components/ui/button"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"

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
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/eval?page=${page}`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics)
        setQueue(data.queue)
      }
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Eval</h1>

      {loading && !metrics ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {metrics && <EvalMetrics metrics={metrics} />}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Review Queue</h2>
              {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            </div>
            <EvalQueue queue={queue} />
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={queue.length < 20}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
