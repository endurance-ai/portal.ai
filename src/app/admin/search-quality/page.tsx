"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

type QualityData = {
  period: string
  total: number
  emptyCount: number
  emptyRate: string
  avgTopScore: string
  categories: {
    category: string
    total: number
    empty: number
    successRate: string
  }[]
  recentEmpties: {
    item_id: string
    query_category: string
    query_subcategory: string | null
    query_color_family: string | null
    query_style_node: string | null
    created_at: string
  }[]
}

const PERIOD_OPTIONS = [
  { label: "1일", value: 1 },
  { label: "7일", value: 7 },
  { label: "30일", value: 30 },
]

export default function SearchQualityPage() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (d: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/search-quality?days=${d}`)
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(days)
  }, [days, fetchData])

  const handlePeriod = (d: number) => {
    setDays(d)
  }

  const emptyRateNum = data ? parseFloat(data.emptyRate) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">검색 품질</h1>
        <div className="flex items-center gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriod(opt.value)}
              className={
                days === opt.value
                  ? "px-3 py-1 text-xs rounded-md border bg-foreground text-background border-foreground"
                  : "px-3 py-1 text-xs rounded-md border border-border text-muted-foreground hover:border-foreground/30 transition-colors"
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {/* 총 검색 */}
            <div className="border border-border rounded-lg p-4 space-y-1">
              <p className="text-xs text-muted-foreground">총 검색</p>
              <p className="text-2xl font-bold tabular-nums">{data.total.toLocaleString()}</p>
            </div>

            {/* Empty Rate */}
            <div className="border border-border rounded-lg p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Empty Rate</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold tabular-nums">{data.emptyRate}%</p>
                {emptyRateNum > 30 ? (
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {data.emptyCount.toLocaleString()} / {data.total.toLocaleString()}
              </p>
            </div>

            {/* 평균 Top Score */}
            <div className="border border-border rounded-lg p-4 space-y-1">
              <p className="text-xs text-muted-foreground">평균 Top Score</p>
              <p className="text-2xl font-bold tabular-nums">{data.avgTopScore}</p>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                카테고리별 성공률
              </p>
            </div>
            {data.categories.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">데이터 없음</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.categories
                  .sort((a, b) => b.total - a.total)
                  .map((cat) => {
                    const rate = parseFloat(cat.successRate)
                    return (
                      <li key={cat.category} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">{cat.category}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {cat.total.toLocaleString()}건
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            empty {cat.empty}
                          </span>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              rate >= 70 ? "text-green-500" : "text-yellow-500"
                            }`}
                          >
                            {cat.successRate}%
                          </span>
                        </div>
                      </li>
                    )
                  })}
              </ul>
            )}
          </div>

          {/* Recent empties */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                최근 Empty 결과
              </p>
            </div>
            {data.recentEmpties.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">데이터 없음</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentEmpties.map((item, idx) => (
                  <li key={`${item.item_id}-${idx}`} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{item.query_category}</span>
                        {item.query_subcategory && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {item.query_subcategory}
                          </span>
                        )}
                        {item.query_color_family && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {item.query_color_family}
                          </span>
                        )}
                        {item.query_style_node && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {item.query_style_node}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.item_id}</p>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {new Date(item.created_at).toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
