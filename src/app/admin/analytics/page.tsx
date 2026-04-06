"use client"

import {useEffect, useState} from "react"
import {ActivityCharts} from "@/components/admin/activity-charts"
import {cn} from "@/lib/utils"

interface StatusMetrics {
  todayCount: number
  todayDelta: number
}

const PERIOD_OPTIONS = [
  { label: "7일",  days: 7 },
  { label: "14일", days: 14 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
] as const

function DeltaBadge({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return null
  const isUp = value > 0
  return (
    <span className={`text-xs font-mono font-semibold ${isUp ? "text-emerald-500" : "text-amber-500"}`}>
      {isUp ? "↑" : "↓"}{Math.abs(value)}{suffix}
    </span>
  )
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<StatusMetrics | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/pipeline-health")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data) {
          setMetrics({
            todayCount: data.today?.count ?? 0,
            todayDelta: data.today?.delta ?? 0,
          })
        }
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold tracking-tight">분석 로그</h1>

        {/* Period selector */}
        <div className="flex gap-1 rounded-md border border-border p-0.5 bg-muted/30 w-fit">
          {PERIOD_OPTIONS.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                days === d
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Today metric */}
      {metrics && (
        <div className="flex items-end gap-3 rounded-lg border border-border bg-card px-4 py-3 w-fit">
          <span className="text-xs text-muted-foreground">오늘</span>
          <span className="text-2xl font-bold font-mono">{metrics.todayCount}</span>
          <DeltaBadge value={metrics.todayDelta} suffix="%" />
        </div>
      )}

      <ActivityCharts days={days} />
    </div>
  )
}
