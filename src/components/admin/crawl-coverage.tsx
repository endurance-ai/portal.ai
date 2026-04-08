"use client"

import {useEffect, useState} from "react"
import {ChevronDown} from "lucide-react"
import {cn} from "@/lib/utils"

type PlatformStats = {
  platform: string
  total: number
  withDescription: number
  withMaterial: number
  withReviews: number
}

type CoverageData = {
  platforms: PlatformStats[]
  totals: {
    total: number
    withDescription: number
    withMaterial: number
    withReviews: number
  }
}

function Pct({ n, total }: { n: number; total: number }) {
  const pct = total > 0 ? (n / total) * 100 : 0
  return (
    <span
      className={cn(
        "text-xs font-mono tabular-nums",
        pct >= 80 ? "text-green-400" : pct >= 30 ? "text-yellow-400" : "text-muted-foreground"
      )}
    >
      {pct.toFixed(0)}%
    </span>
  )
}

export function CrawlCoverage() {
  const [data, setData] = useState<CoverageData | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    if (data) return
    fetch("/api/admin/crawl-coverage")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setData(d))
  }, [open, data])

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10 transition-colors"
      >
        <span className="text-sm font-medium">크롤링 커버리지</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border">
          {!data ? (
            <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
              로딩 중...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left p-3 font-medium">플랫폼</th>
                    <th className="text-right p-3 font-medium">상품수</th>
                    <th className="text-right p-3 font-medium">설명</th>
                    <th className="text-right p-3 font-medium">소재</th>
                    <th className="text-right p-3 font-medium">리뷰</th>
                  </tr>
                </thead>
                <tbody>
                  {data.platforms.map((p) => (
                    <tr key={p.platform} className="border-b border-border/50 hover:bg-muted/5">
                      <td className="p-3 font-medium">{p.platform}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{p.total.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <Pct n={p.withDescription} total={p.total} />
                      </td>
                      <td className="p-3 text-right">
                        <Pct n={p.withMaterial} total={p.total} />
                      </td>
                      <td className="p-3 text-right">
                        <Pct n={p.withReviews} total={p.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="p-3">합계</td>
                    <td className="p-3 text-right font-mono tabular-nums">{data.totals.total.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <Pct n={data.totals.withDescription} total={data.totals.total} />
                    </td>
                    <td className="p-3 text-right">
                      <Pct n={data.totals.withMaterial} total={data.totals.total} />
                    </td>
                    <td className="p-3 text-right">
                      <Pct n={data.totals.withReviews} total={data.totals.total} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
