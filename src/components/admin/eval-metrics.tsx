"use client"

import { CheckCircle, Clock, FileText, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface Metrics {
  totalAnalyses: number
  reviewed: number
  pending: number
  verdictDist: { pass: number; fail: number; partial: number }
}

export function EvalMetrics({ metrics }: { metrics: Metrics }) {
  const passRate = metrics.reviewed > 0
    ? Math.round((metrics.verdictDist.pass / metrics.reviewed) * 100)
    : null

  const { pass, fail, partial } = metrics.verdictDist
  const total = pass + fail + partial || 1

  const cards = [
    { label: "전체 분석", value: metrics.totalAnalyses, icon: FileText, accent: false },
    { label: "리뷰 완료", value: metrics.reviewed, icon: CheckCircle, accent: true },
    { label: "리뷰 대기", value: metrics.pending, icon: Clock, accent: false },
    { label: "Pass율", value: passRate !== null ? `${passRate}%` : "\u2014", icon: TrendingUp, accent: true },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, accent }) => (
          <div
            key={label}
            className={cn(
              "group rounded-lg border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/20",
              accent && "hover:border-turquoise/40"
            )}
          >
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-2xl font-bold tabular-nums tracking-tight",
                accent && "text-turquoise"
              )}>
                {value}
              </p>
              <Icon className={cn(
                "size-4",
                accent ? "text-turquoise/60" : "text-muted-foreground/40"
              )} />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Verdict distribution bar */}
      {metrics.reviewed > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden flex bg-muted" role="img" aria-label={`판정 분포: Pass ${pass}개, Fail ${fail}개, Partial ${partial}개`}>
            <div className="h-full bg-turquoise transition-all" style={{ width: `${(pass / total) * 100}%` }} />
            <div className="h-full bg-red-400 transition-all" style={{ width: `${(fail / total) * 100}%` }} />
            <div className="h-full bg-yellow-400 transition-all" style={{ width: `${(partial / total) * 100}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-turquoise" />Pass {pass}</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-red-400" />Fail {fail}</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-yellow-400" />Partial {partial}</span>
          </div>
        </div>
      )}
    </div>
  )
}
