"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { EvalMetrics } from "@/components/admin/eval-metrics"
import { EvalQueue } from "@/components/admin/eval-queue"
import { EvalGoldenSet } from "@/components/admin/eval-golden-set"
import { EvalGoldenQueries } from "@/components/admin/eval-golden-queries"
import { EvalLabelingForm } from "@/components/admin/eval-labeling-form"
import { EvalRunsDashboard } from "@/components/admin/eval-runs-dashboard"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, ChevronLeft, ChevronRight, ChevronDown, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type Filter = "all" | "pending" | "reviewed"
// SPEC-V6-EVAL T-015 — 신규 3 탭 추가 (PRESERVE: 기존 queue/golden 유지)
type Tab = "queue" | "golden" | "golden-queries" | "labeling" | "runs"
type VerdictKey = "pass" | "fail" | "partial"
type AlgVersion = "v4" | "v6"

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: "all",      label: "전체" },
  { key: "pending",  label: "대기" },
  { key: "reviewed", label: "완료" },
]

const MAIN_TABS: { key: Tab; label: string }[] = [
  { key: "queue",          label: "평가 대기열" },
  { key: "golden",         label: "골든셋" },
  { key: "golden-queries", label: "골든셋 쿼리" },
  { key: "labeling",       label: "라벨링" },
  { key: "runs",           label: "실행 결과" },
]

const VERDICT_OPTIONS: { key: VerdictKey; label: string; icon: typeof CheckCircle; cls: string }[] = [
  { key: "pass",    label: "Pass",    icon: CheckCircle,  cls: "text-turquoise" },
  { key: "fail",    label: "Fail",    icon: XCircle,      cls: "text-red-400" },
  { key: "partial", label: "Partial", icon: AlertCircle,  cls: "text-yellow-400" },
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
  const [selectedVerdicts, setSelectedVerdicts] = useState<Set<VerdictKey>>(new Set(["pass", "fail", "partial"]))
  const [verdictDropdownOpen, setVerdictDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  // SPEC-V6-EVAL T-015 — labeling tab: golden_query selector state
  const [labelingGoldenQueries, setLabelingGoldenQueries] = useState<Array<{ id: string; intent_note: string; algorithm_version: string }>>([])
  const [labelingSelectedId, setLabelingSelectedId] = useState<string>("")
  const [labelingAlgorithm, setLabelingAlgorithm] = useState<AlgVersion>("v4")

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setVerdictDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Stable string key for selectedVerdicts to avoid spurious refetches
  const verdictsKey = [...selectedVerdicts].sort().join(",")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), filter })
      const vk = verdictsKey
      if (filter === "reviewed" && vk !== "fail,partial,pass" && vk.length > 0) {
        params.set("verdicts", vk)
      }
      const res = await fetch(`/api/admin/eval?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics)
        setQueue(data.queue)
      }
    } finally {
      setLoading(false)
    }
  }, [page, filter, verdictsKey])

  useEffect(() => { fetchData() }, [fetchData])

  // SPEC-V6-EVAL T-015 — lazy-load golden queries when labeling tab opens
  useEffect(() => {
    if (tab !== "labeling") return
    if (labelingGoldenQueries.length > 0) return
    fetch(`/api/admin/eval/golden-queries?algorithm_version=${labelingAlgorithm}&page=1&pageSize=100`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items) {
          setLabelingGoldenQueries(data.items)
          if (!labelingSelectedId && data.items[0]) {
            setLabelingSelectedId(data.items[0].id)
          }
        }
      })
      .catch(() => {/* graceful */})
  }, [tab, labelingAlgorithm, labelingGoldenQueries.length, labelingSelectedId])

  function handleFilter(f: Filter) {
    setFilter(f)
    setPage(0)
    if (f !== "reviewed") {
      setSelectedVerdicts(new Set(["pass", "fail", "partial"]))
    }
  }

  function toggleVerdict(key: VerdictKey) {
    setSelectedVerdicts(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key) // prevent empty selection
      } else {
        next.add(key)
      }
      return next
    })
    setPage(0)
  }

  const allVerdictsSelected = selectedVerdicts.size === 3

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
                <div className="flex items-center gap-2">
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

                  {/* Verdict multi-select dropdown — only in reviewed filter */}
                  {filter === "reviewed" && (
                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setVerdictDropdownOpen(prev => !prev)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50 min-w-[88px]",
                          !allVerdictsSelected && "border-turquoise/50 text-turquoise"
                        )}
                      >
                        {allVerdictsSelected ? "상태 전체" : `${selectedVerdicts.size}개 상태`}
                        <ChevronDown className="size-3" />
                      </button>

                      {verdictDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                          {VERDICT_OPTIONS.map(({ key, label, icon: Icon, cls }) => (
                            <button
                              key={key}
                              onClick={() => toggleVerdict(key)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                            >
                              <Checkbox
                                checked={selectedVerdicts.has(key)}
                                className="size-3.5 pointer-events-none"
                              />
                              <Icon className={cn("size-3.5", cls)} />
                              <span>{label}</span>
                              {metrics && (
                                <span className="ml-auto text-muted-foreground tabular-nums">
                                  {metrics.verdictDist[key]}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
              </div>

              <EvalQueue queue={queue} filter={filter} onRefresh={fetchData} />

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

          {/* SPEC-V6-EVAL T-015 — 신규 3 탭 */}
          {tab === "golden-queries" && <EvalGoldenQueries />}

          {tab === "labeling" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
                <div className="flex-1 min-w-[240px] space-y-1">
                  <label className="text-xs font-medium">골든셋 쿼리</label>
                  <select
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                    value={labelingSelectedId}
                    onChange={(e) => setLabelingSelectedId(e.target.value)}
                  >
                    <option value="">선택하세요...</option>
                    {labelingGoldenQueries.map((gq) => (
                      <option key={gq.id} value={gq.id}>
                        [{gq.algorithm_version}] {gq.intent_note.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Algorithm</label>
                  <select
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                    value={labelingAlgorithm}
                    onChange={(e) => {
                      setLabelingAlgorithm(e.target.value as AlgVersion)
                      setLabelingGoldenQueries([])
                      setLabelingSelectedId("")
                    }}
                  >
                    <option value="v4">v4</option>
                    <option value="v6">v6 (blocked)</option>
                  </select>
                </div>
              </div>

              {labelingSelectedId ? (
                <EvalLabelingForm
                  key={`${labelingSelectedId}-${labelingAlgorithm}`}
                  goldenQueryId={labelingSelectedId}
                  algorithmVersion={labelingAlgorithm}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border p-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {labelingGoldenQueries.length === 0
                      ? "골든셋 쿼리가 없습니다. '골든셋 쿼리' 탭에서 먼저 추가하세요."
                      : "위에서 쿼리를 선택하면 라벨링이 시작됩니다."}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "runs" && <EvalRunsDashboard />}
        </>
      )}
    </div>
  )
}
