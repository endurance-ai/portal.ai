"use client"

import {useEffect, useState} from "react"
import {AnalysisTable} from "@/components/admin/analysis-table"
import {ActivityCharts} from "@/components/admin/activity-charts"

interface StatusMetrics {
  todayCount: number
  todayDelta: number
  avgScore: number
  avgScoreDelta: number
  emptyRate: number
  emptyRateDelta: number
}

function DeltaBadge({ value, suffix = "", invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  if (value === 0) return null
  const isUp = value > 0
  const isGood = invert ? !isUp : isUp
  return (
    <span className={`text-xs font-mono font-semibold ${isGood ? "text-emerald-500" : "text-amber-500"}`}>
      {isUp ? "↑" : "↓"}{Math.abs(value)}{suffix}
    </span>
  )
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<StatusMetrics | null>(null)
  const [chartsOpen, setChartsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/admin/pipeline-health")
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        setMetrics({
          todayCount: data.today?.count ?? 0,
          todayDelta: data.today?.delta ?? 0,
          avgScore: data.searchQuality?.rate ? Math.round(data.searchQuality.rate) / 100 : 0,
          avgScoreDelta: data.searchQuality?.delta ? Math.round(data.searchQuality.delta) / 100 : 0,
          emptyRate: 100 - (data.searchQuality?.rate ?? 0),
          emptyRateDelta: data.searchQuality?.delta ? -data.searchQuality.delta : 0,
        })
      } catch { /* ignore */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-xl md:text-2xl font-bold">Analytics</h1>

      {/* Status Row */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-end gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-xs text-muted-foreground">Today</span>
            <span className="text-xl font-bold font-mono">{metrics.todayCount}</span>
            <DeltaBadge value={metrics.todayDelta} suffix="%" />
          </div>
          <div className="flex items-end gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-xs text-muted-foreground">Avg Score</span>
            <span className="text-xl font-bold font-mono">{metrics.avgScore.toFixed(2)}</span>
            <DeltaBadge value={metrics.avgScoreDelta} suffix="" />
          </div>
          <div className="flex items-end gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-xs text-muted-foreground">Empty Rate</span>
            <span className="text-xl font-bold font-mono">{metrics.emptyRate.toFixed(1)}%</span>
            <DeltaBadge value={metrics.emptyRateDelta} suffix="%" invert />
          </div>
        </div>
      )}

      {/* Analysis Table */}
      <AnalysisTable />

      {/* Collapsible Charts */}
      <button
        onClick={() => setChartsOpen(!chartsOpen)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
      >
        {chartsOpen ? "▼ 활동 차트 접기" : "▶ 활동 차트 펼치기"}
      </button>
      {chartsOpen && <ActivityCharts />}
    </div>
  )
}
