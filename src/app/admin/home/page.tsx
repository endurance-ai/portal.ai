"use client"

import {useCallback, useEffect, useState} from "react"
import {ArrowRight, Loader2, TriangleAlert} from "lucide-react"
import Link from "next/link"

interface PipelineHealth {
  today: { count: number; delta: number }
  searchQuality: { rate: number; delta: number }
  evalBacklog: number
  aiCost: number
  actionItems: { category: string; emptyRate: number; total: number }[]
}

function DeltaBadge({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const isPositive = value > 0
  const isGood = suffix === "%" ? isPositive : !isPositive
  return (
    <span className={`text-xs font-mono font-semibold ${isGood ? "text-emerald-500" : "text-amber-500"}`}>
      {isPositive ? "↑" : "↓"} {Math.abs(value)}{suffix}
    </span>
  )
}

export default function PipelineHealthPage() {
  const [data, setData] = useState<PipelineHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/pipeline-health")
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  if (!data) return null

  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Pipeline Health</h1>
        <span className="text-sm font-mono text-muted-foreground">{today}</span>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Today&apos;s Analyses</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold font-mono">{data.today.count}</span>
            {data.today.delta !== 0 && <DeltaBadge value={data.today.delta} />}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Search Quality</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold font-mono">{data.searchQuality.rate}%</span>
            {data.searchQuality.delta !== 0 && <DeltaBadge value={data.searchQuality.delta} />}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Eval Backlog</p>
          <span className={`text-2xl font-bold font-mono ${data.evalBacklog > 50 ? "text-amber-500" : ""}`}>
            {data.evalBacklog}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">AI Cost (Today)</p>
          <span className="text-2xl font-bold font-mono">${data.aiCost}</span>
        </div>
      </div>

      {/* Action Needed */}
      {data.actionItems.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-amber-500" />
            <h2 className="text-base font-bold">Action Needed</h2>
            <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
              {data.actionItems.length}
            </span>
          </div>
          <div className="space-y-2">
            {data.actionItems.map((item) => (
              <Link
                key={item.category}
                href={`/admin/search-quality`}
                className="flex items-center justify-between rounded-md bg-secondary p-3 hover:bg-secondary/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${item.emptyRate > 40 ? "bg-red-500" : "bg-amber-500"}`} />
                  <span className="text-sm">
                    <strong>{item.category}</strong> empty rate {item.emptyRate}% — 크롤러 보강 필요
                  </span>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </Link>
            ))}
            {data.evalBacklog > 30 && (
              <Link
                href="/admin/eval"
                className="flex items-center justify-between rounded-md bg-secondary p-3 hover:bg-secondary/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm">Eval 대기 <strong>{data.evalBacklog}건</strong> — 리뷰 필요</span>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
