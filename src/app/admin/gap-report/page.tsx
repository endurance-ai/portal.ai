"use client"

import {useCallback, useEffect, useState} from "react"
import {Loader2} from "lucide-react"

interface GapItem {
  query: string
  searches: number
  dbProducts: number
  gapScore: number
  severity: "critical" | "warning" | "good"
}

const SEVERITY_STYLES = {
  critical: { bar: "bg-red-500", text: "text-red-500", label: "Critical" },
  warning: { bar: "bg-amber-500", text: "text-amber-500", label: "Warning" },
  good: { bar: "bg-emerald-500", text: "text-emerald-500", label: "Good" },
}

export default function GapReportPage() {
  const [gaps, setGaps] = useState<GapItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/gap-report")
      if (res.ok) {
        const data = await res.json()
        setGaps(data.gaps || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Category Gap Report</h1>
        <p className="text-sm text-muted-foreground mt-1">
          유저 검색 수요 vs 상품 DB 보유량 — 크롤러 우선순위 결정 자료
        </p>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-secondary border-b border-border text-xs font-semibold text-muted-foreground">
          <span className="col-span-4">Search Query</span>
          <span className="col-span-2">Searches (7d)</span>
          <span className="col-span-2">DB Products</span>
          <span className="col-span-2">Gap Score</span>
          <span className="col-span-2">Action</span>
        </div>

        {/* Rows */}
        {gaps.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">데이터 없음</p>
        ) : (
          gaps.map((item) => {
            const style = SEVERITY_STYLES[item.severity]
            return (
              <div key={item.query} className="grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-border">
                <span className="col-span-4 text-sm font-medium truncate">{item.query}</span>
                <span className="col-span-2 text-sm font-mono font-bold">{item.searches}</span>
                <span className={`col-span-2 text-sm font-mono ${item.dbProducts < 20 ? "text-red-500" : "text-muted-foreground"}`}>
                  {item.dbProducts}
                </span>
                <div className="col-span-2 flex items-center gap-2">
                  <div className={`h-1.5 rounded-full ${style.bar}`} style={{ width: `${Math.min(item.gapScore * 4, 40)}px` }} />
                  <span className={`text-[11px] font-mono font-semibold ${style.text}`}>{style.label}</span>
                </div>
                <div className="col-span-2">
                  {item.severity === "critical" ? (
                    <span className="text-[11px] font-semibold bg-foreground text-background px-2 py-1 rounded">
                      크롤러 추가
                    </span>
                  ) : item.severity === "warning" ? (
                    <span className="text-[11px] text-muted-foreground border border-border px-2 py-1 rounded">
                      모니터링
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground border border-border px-2 py-1 rounded">
                      충분
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
