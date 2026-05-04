"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Lock, RefreshCw, TrendingUp, Target, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

// SPEC-V6-EVAL T-014 — eval-runs-dashboard (REQ-V6-EVAL-003, REQ-V6-EVAL-004)

interface RunRow {
  id: string
  algorithm_version: string
  golden_query_id: string | null
  ndcg_at_10: number | string
  precision_at_5: number | string
  query_count: number
  judgment_count: number
  frozen: boolean
  computed_at: string
  notes: string | null
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function toNum(x: number | string): number {
  return typeof x === "string" ? Number(x) : x
}

export function EvalRunsDashboard() {
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [freezing, setFreezing] = useState(false)

  async function fetchRuns() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/eval/runs?limit=50")
      if (res.ok) {
        const json = await res.json()
        setRuns(json.items || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRuns()
  }, [])

  // Find latest aggregate v4 row, latest aggregate v6 row, frozen baseline
  const v4Aggregate = runs.find((r) => r.algorithm_version === "v4" && r.golden_query_id === null)
  const v6Aggregate = runs.find((r) => r.algorithm_version === "v6" && r.golden_query_id === null)
  const frozenBaseline = runs.find((r) => r.frozen && r.algorithm_version === "v4" && r.golden_query_id === null)

  // Show Freeze button only if there is a v4 aggregate row but no frozen one yet
  const canFreeze = !!v4Aggregate && !frozenBaseline

  async function handleFreeze() {
    if (!confirm("v4 aggregate baseline 을 frozen 으로 고정합니다. SQL 직접 수정만 해제 가능. 계속할까요?")) {
      return
    }
    setFreezing(true)
    try {
      const res = await fetch("/api/admin/eval/freeze-baseline", { method: "POST" })
      const json = await res.json()
      if (res.ok) {
        toast.success("v4 baseline frozen")
        await fetchRuns()
      } else {
        toast.error(json.error || "freeze 실패")
      }
    } finally {
      setFreezing(false)
    }
  }

  // Comparison delta (v6 vs frozen v4)
  const delta = frozenBaseline && v6Aggregate
    ? {
        ndcg: toNum(v6Aggregate.ndcg_at_10) - toNum(frozenBaseline.ndcg_at_10),
        precision: toNum(v6Aggregate.precision_at_5) - toNum(frozenBaseline.precision_at_5),
      }
    : null

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="text-turquoise font-semibold">{runs.length}</span>개 run
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchRuns}>
            <RefreshCw className="size-3.5 mr-1" />
            새로고침
          </Button>
          {canFreeze && (
            <Button size="sm" onClick={handleFreeze} disabled={freezing}>
              {freezing ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Lock className="size-3.5 mr-1" />}
              Freeze v4 Baseline
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={TrendingUp}
          label="v4 NDCG@10 (latest)"
          value={v4Aggregate ? toNum(v4Aggregate.ndcg_at_10).toFixed(4) : "—"}
          accent
        />
        <SummaryCard
          icon={Target}
          label="v4 Precision@5 (latest)"
          value={v4Aggregate ? toNum(v4Aggregate.precision_at_5).toFixed(4) : "—"}
          accent
        />
        <SummaryCard
          icon={Lock}
          label="Frozen Baseline"
          value={frozenBaseline ? formatDateTime(frozenBaseline.computed_at) : "미고정"}
        />
        <SummaryCard
          icon={Calendar}
          label="v6 vs v4 Delta"
          value={
            delta
              ? `${delta.ndcg >= 0 ? "+" : ""}${delta.ndcg.toFixed(4)} NDCG`
              : "—"
          }
          highlight={delta ? delta.ndcg >= 0 : false}
        />
      </div>

      {/* Runs table */}
      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">아직 실행된 run 이 없습니다</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Labeling 탭에서 라벨링 후 Compute Run 을 실행하세요</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Algorithm</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">NDCG@10</TableHead>
                <TableHead className="text-right">Precision@5</TableHead>
                <TableHead className="text-right">Queries</TableHead>
                <TableHead className="text-right">Judgments</TableHead>
                <TableHead>Computed At</TableHead>
                <TableHead>Frozen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} className={cn(r.frozen && "bg-turquoise/5")}>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{r.algorithm_version}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.golden_query_id === null ? (
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-400/30 text-[10px]">aggregate</Badge>
                    ) : (
                      <span className="font-mono text-muted-foreground">{r.golden_query_id.slice(0, 8)}…</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{toNum(r.ndcg_at_10).toFixed(4)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{toNum(r.precision_at_5).toFixed(4)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{r.query_count}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{r.judgment_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{formatDateTime(r.computed_at)}</TableCell>
                  <TableCell>
                    {r.frozen ? (
                      <Badge className="bg-turquoise/10 text-turquoise border-turquoise/30 text-[10px]">
                        <Lock className="size-2.5 mr-1" />
                        BASELINE (locked)
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent = false,
  highlight = false,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  accent?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        accent && "hover:border-turquoise/40 transition-colors",
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Icon className={cn("size-4", accent ? "text-turquoise/60" : "text-muted-foreground/40")} />
        {highlight && <span className="text-[10px] text-turquoise">↑</span>}
      </div>
      <p className={cn("text-lg font-bold tabular-nums tracking-tight truncate", accent && "text-turquoise")}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
