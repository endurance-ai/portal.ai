"use client"

import { Card, CardContent } from "@/components/ui/card"

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

  const cards = [
    { label: "Total Analyses", value: metrics.totalAnalyses },
    { label: "Reviewed", value: metrics.reviewed },
    { label: "Pending", value: metrics.pending },
    { label: "Pass Rate", value: passRate !== null ? `${passRate}%` : "\u2014" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tracking-tight">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
