"use client"

import {useCallback, useEffect, useMemo, useState} from "react"
import {Check, X, ChevronLeft, ChevronRight} from "lucide-react"
import {Skeleton} from "@/components/ui/skeleton"

interface ProposalRow {
  id: string
  brand_id: string
  brand_name: string
  field: string
  proposed_values: string[]
  confidence: number
  reasoning: string | null
  status: string
  created_at: string
}

interface ListResponse {
  proposals: ProposalRow[]
  total: number
  page: number
  limit: number
}

const FIELDS = ["", "vibe", "palette", "material", "silhouette", "detail"] as const
const STATUS_OPTIONS = ["pending", "approved", "rejected", "auto_applied"] as const

const FIELD_COLORS: Record<string, string> = {
  vibe: "#a855f7",
  palette: "#60a5fa",
  material: "#34d399",
  silhouette: "#ec4899",
  detail: "#fbbf24",
}

export default function BrandProposalsPage() {
  const [list, setList] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  // 필터
  const [status, setStatus] = useState<string>("pending")
  const [field, setField] = useState<string>("")
  const [minConf, setMinConf] = useState<number>(0)
  const [brandQ, setBrandQ] = useState<string>("")
  const [page, setPage] = useState(0)

  // 선택
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const fetchList = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      status,
      page: String(page),
      limit: "50",
      min_conf: String(minConf),
    })
    if (field) params.set("field", field)
    if (brandQ.trim()) params.set("brand", brandQ.trim())
    fetch(`/api/admin/brand-proposals?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: ListResponse) => {
        setList(d)
        setLoading(false)
        setSelected(new Set())
      })
      .catch((e) => {
        setError(String(e))
        setLoading(false)
      })
  }, [status, field, minConf, brandQ, page])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const allSelected = useMemo(() => {
    if (!list || list.proposals.length === 0) return false
    return list.proposals.every((p) => selected.has(p.id))
  }, [list, selected])

  const toggleAll = () => {
    if (!list) return
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(list.proposals.map((p) => p.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkAction = async (action: "approve" | "reject") => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`${ids.length}개 ${action === "approve" ? "승인" : "거절"} 하시겠습니까?`)) return
    setActing(true)
    try {
      const res = await fetch("/api/admin/brand-proposals/bulk", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ids, action}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      console.log("bulk action:", d)
      fetchList()
    } catch (e) {
      alert("실패: " + String(e))
    } finally {
      setActing(false)
    }
  }

  const singleAction = async (id: string, action: "approve" | "reject") => {
    setActing(true)
    try {
      const res = await fetch("/api/admin/brand-proposals/bulk", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ids: [id], action}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      fetchList()
    } catch (e) {
      alert("실패: " + String(e))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold">브랜드 제안 검수큐</h1>
        <div className="text-xs text-muted-foreground mt-1">
          LLM 추론한 vibe / palette / material / silhouette / detail 검토.
          승인 시 brand_nodes.attributes 에 자동 머지.
        </div>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* status */}
        <div className="flex items-center gap-1 text-xs">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s)
                setPage(0)
              }}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                status === s
                  ? "bg-primary/20 border-primary text-foreground"
                  : "bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary/60"
              }`}
            >
              {s}
              {s === "pending" && list && status === "pending" && (
                <span className="ml-1 text-muted-foreground/70">{list.total}</span>
              )}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* field */}
        <div className="flex items-center gap-1 text-xs">
          {FIELDS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setField(f)
                setPage(0)
              }}
              className={`px-2 py-1 rounded-md border transition-colors ${
                field === f
                  ? "bg-secondary border-border text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-secondary/40"
              }`}
              style={f && field === f ? {borderColor: FIELD_COLORS[f]} : undefined}
            >
              {f || "all fields"}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* min confidence */}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          min conf
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={minConf}
            onChange={(e) => {
              setMinConf(parseFloat(e.target.value))
              setPage(0)
            }}
            className="w-16 px-2 py-1 bg-secondary text-foreground rounded-md text-xs border border-border"
          />
        </label>

        {/* brand search */}
        <input
          type="search"
          placeholder="브랜드명 검색"
          value={brandQ}
          onChange={(e) => {
            setBrandQ(e.target.value)
            setPage(0)
          }}
          className="px-3 py-1 bg-secondary text-foreground rounded-md text-xs w-48 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* 일괄 액션바 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-md">
          <div className="text-sm">
            <span className="font-semibold">{selected.size}개</span> 선택됨
          </div>
          <div className="flex-1" />
          <button
            onClick={() => bulkAction("approve")}
            disabled={acting}
            className="px-3 py-1.5 text-xs rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 disabled:opacity-50"
          >
            <Check className="size-3.5 inline -mt-0.5 mr-1" />
            일괄 승인 + brand_nodes 머지
          </button>
          <button
            onClick={() => bulkAction("reject")}
            disabled={acting}
            className="px-3 py-1.5 text-xs rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 disabled:opacity-50"
          >
            <X className="size-3.5 inline -mt-0.5 mr-1" />
            일괄 거절
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 테이블 */}
      <div className="flex-1 overflow-auto bg-card rounded-lg border border-border">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({length: 10}).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-red-400 text-sm">에러: {error}</div>
        ) : !list || list.proposals.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            결과 없음
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-3 py-2.5 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2.5 text-left">brand</th>
                <th className="px-3 py-2.5 text-left w-24">field</th>
                <th className="px-3 py-2.5 text-left">제안값</th>
                <th className="px-3 py-2.5 text-left w-28">confidence</th>
                <th className="px-3 py-2.5 text-left">reasoning</th>
                <th className="px-3 py-2.5 text-right w-24">액션</th>
              </tr>
            </thead>
            <tbody>
              {list.proposals.map((p) => {
                const isSelected = selected.has(p.id)
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-border/40 hover:bg-secondary/30 transition-colors ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(p.id)}
                        className="rounded mt-0.5"
                      />
                    </td>
                    <td className="px-3 py-2 align-top font-medium">{p.brand_name}</td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: `${FIELD_COLORS[p.field]}22`,
                          color: FIELD_COLORS[p.field],
                        }}
                      >
                        {p.field}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {p.proposed_values.map((v) => (
                          <span
                            key={v}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-foreground"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${p.confidence * 100}%`,
                              backgroundColor:
                                p.confidence >= 0.85
                                  ? "#34d399"
                                  : p.confidence >= 0.7
                                  ? "#fbbf24"
                                  : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {p.confidence.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="text-xs text-muted-foreground line-clamp-2 max-w-[420px]" title={p.reasoning ?? ""}>
                        {p.reasoning ?? "-"}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {p.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => singleAction(p.id, "approve")}
                            disabled={acting}
                            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-50"
                            title="승인"
                          >
                            <Check className="size-4" />
                          </button>
                          <button
                            onClick={() => singleAction(p.id, "reject")}
                            disabled={acting}
                            className="p-1 rounded hover:bg-red-500/20 text-red-400 disabled:opacity-50"
                            title="거절"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">{p.status}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 */}
      {list && list.total > list.limit && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            {list.page * list.limit + 1} – {Math.min((list.page + 1) * list.limit, list.total)} / {list.total.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={list.page === 0}
              className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              {list.page + 1} / {Math.ceil(list.total / list.limit)}
            </span>
            <button
              onClick={() =>
                setPage((p) =>
                  (p + 1) * list.limit < list.total ? p + 1 : p
                )
              }
              disabled={(list.page + 1) * list.limit >= list.total}
              className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
