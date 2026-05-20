"use client"

import {useMemo, useState} from "react"
import {ArrowUpDown} from "lucide-react"
import {cn} from "@/lib/utils"
import type {PlatformStatsRow} from "@/domains/admin-tools/products/crawl-monitor.route"

type SortKey = "stale" | "sku" | "last" | "platform" | "embed"

const SORT_OPTIONS: Array<{key: SortKey; label: string}> = [
  {key: "stale", label: "stale 많은 순"},
  {key: "last", label: "오래된 순"},
  {key: "sku", label: "SKU 많은 순"},
  {key: "embed", label: "임베딩 진척 낮은 순"},
  {key: "platform", label: "플랫폼명"},
]

export function CrawlMonitor({rows}: {rows: PlatformStatsRow[]}) {
  const [sortKey, setSortKey] = useState<SortKey>("stale")
  const [search, setSearch] = useState("")

  const sorted = useMemo(() => {
    const filtered = search
      ? rows.filter((r) => r.platform.toLowerCase().includes(search.toLowerCase()))
      : rows
    const out = [...filtered]
    switch (sortKey) {
      case "stale":
        out.sort((a, b) => stalePct(b) - stalePct(a))
        break
      case "last":
        out.sort((a, b) => {
          const at = a.last_crawled_at ? new Date(a.last_crawled_at).getTime() : 0
          const bt = b.last_crawled_at ? new Date(b.last_crawled_at).getTime() : 0
          return at - bt
        })
        break
      case "sku":
        out.sort((a, b) => b.sku_count - a.sku_count)
        break
      case "embed":
        out.sort((a, b) => embedPct(a) - embedPct(b))
        break
      case "platform":
        out.sort((a, b) => a.platform.localeCompare(b.platform))
        break
    }
    return out
  }, [rows, sortKey, search])

  // 전체 합계 (헤더 표시용)
  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => {
        acc.sku += r.sku_count
        acc.in_stock += r.in_stock_count
        acc.stale += r.stale_count
        acc.unembedded += r.unembedded_count
        acc.unbranded += r.unbranded_count
        return acc
      },
      {sku: 0, in_stock: 0, stale: 0, unembedded: 0, unbranded: 0},
    )
    return t
  }, [rows])

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryStat label="전체 SKU" value={totals.sku.toLocaleString()} sub={`${rows.length} 플랫폼`} />
        <SummaryStat
          label="재고"
          value={`${pct(totals.in_stock, totals.sku)}%`}
          sub={`${totals.in_stock.toLocaleString()} / ${totals.sku.toLocaleString()}`}
        />
        <SummaryStat
          label="stale (30일+)"
          value={`${pct(totals.stale, totals.sku)}%`}
          sub={totals.stale.toLocaleString()}
          tone={pct(totals.stale, totals.sku) > 30 ? "warning" : "neutral"}
        />
        <SummaryStat
          label="임베딩 미완"
          value={`${pct(totals.unembedded, totals.sku)}%`}
          sub={totals.unembedded.toLocaleString()}
          tone={pct(totals.unembedded, totals.sku) > 10 ? "warning" : "neutral"}
        />
        <SummaryStat
          label="브랜드 미매칭"
          value={`${pct(totals.unbranded, totals.sku)}%`}
          sub={totals.unbranded.toLocaleString()}
          tone={pct(totals.unbranded, totals.sku) > 5 ? "warning" : "neutral"}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="플랫폼 검색…"
          className="h-9 flex-1 rounded border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none"
        />
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 rounded border border-border bg-background px-2 text-sm focus:border-foreground focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards */}
      {sorted.length === 0 ? (
        <div className="rounded border border-border bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          데이터 없음
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((r) => (
            <PlatformCard key={r.platform} row={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlatformCard({row}: {row: PlatformStatsRow}) {
  const stale = pct(row.stale_count, row.sku_count)
  const embed = embedPct(row)
  const branded = pct(row.sku_count - row.unbranded_count, row.sku_count)
  const inStock = pct(row.in_stock_count, row.sku_count)

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate font-mono text-sm font-semibold">{row.platform}</h3>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {row.sku_count.toLocaleString()} SKU
        </span>
      </div>

      {/* Last crawled */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">마지막 크롤</span>
        <span className={cn("tabular-nums", classifyFreshness(row.last_crawled_at))}>
          {row.last_crawled_at ? relativeTime(row.last_crawled_at) : "없음"}
        </span>
      </div>

      {/* Bars */}
      <dl className="space-y-1.5 text-[11px]">
        <Bar label="재고" value={inStock} count={row.in_stock_count} />
        <Bar label="stale" value={stale} count={row.stale_count} warningAbove={30} inverted />
        <Bar
          label="임베딩"
          value={embed}
          count={row.sku_count - row.unembedded_count}
          warningBelow={90}
        />
        <Bar
          label="브랜드 매칭"
          value={branded}
          count={row.sku_count - row.unbranded_count}
          warningBelow={95}
        />
      </dl>

      {/* Fill rates */}
      <div className="grid grid-cols-4 gap-1 border-t border-border pt-2 text-[10px]">
        <FillCell label="desc" value={pct(row.fill_description, row.sku_count)} />
        <FillCell label="color" value={pct(row.fill_color, row.sku_count)} />
        <FillCell label="tags" value={pct(row.fill_tags, row.sku_count)} />
        <FillCell label="images" value={pct(row.fill_images, row.sku_count)} />
      </div>
    </div>
  )
}

function Bar({
  label,
  value,
  count,
  warningAbove,
  warningBelow,
  inverted,
}: {
  label: string
  value: number
  count: number
  warningAbove?: number
  warningBelow?: number
  inverted?: boolean
}) {
  const warn =
    (warningAbove != null && value >= warningAbove) || (warningBelow != null && value < warningBelow)
  const barCls = warn
    ? "bg-amber-500/70"
    : inverted
      ? "bg-muted-foreground/30"
      : "bg-turquoise/70"

  return (
    <div className="grid grid-cols-[60px_1fr_64px] items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="relative h-1.5 overflow-hidden rounded bg-muted/40">
        <div className={cn("absolute inset-y-0 left-0 transition-all", barCls)} style={{width: `${value}%`}} />
      </dd>
      <dd className={cn("text-right tabular-nums", warn && "text-amber-600 dark:text-amber-400")}>
        {value}% <span className="text-muted-foreground/70">({count.toLocaleString()})</span>
      </dd>
    </div>
  )
}

function FillCell({label, value}: {label: string; value: number}) {
  const tone =
    value >= 80
      ? "text-foreground/80"
      : value >= 40
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground"
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("font-mono tabular-nums", tone)}>{value}%</span>
      <span className="text-muted-foreground/60">{label}</span>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string
  value: string
  sub?: string
  tone?: "neutral" | "warning"
}) {
  return (
    <div
      className={cn(
        "rounded border bg-card p-2.5",
        tone === "warning" ? "border-amber-500/40 bg-amber-500/5" : "border-border",
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", tone === "warning" && "text-amber-600 dark:text-amber-400")}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  )
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function embedPct(r: PlatformStatsRow): number {
  return pct(r.sku_count - r.unembedded_count, r.sku_count)
}

function stalePct(r: PlatformStatsRow): number {
  return pct(r.stale_count, r.sku_count)
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return iso
  const diffMs = Date.now() - t
  const day = 24 * 60 * 60 * 1000
  const hour = 60 * 60 * 1000
  const min = 60 * 1000

  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / min))}분 전`
  if (diffMs < day) return `${Math.round(diffMs / hour)}시간 전`
  if (diffMs < 30 * day) return `${Math.round(diffMs / day)}일 전`
  if (diffMs < 365 * day) return `${Math.round(diffMs / (30 * day))}달 전`
  return `${Math.round(diffMs / (365 * day))}년 전`
}

function classifyFreshness(iso: string | null): string {
  if (!iso) return "text-muted-foreground"
  const diffDays = (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)
  if (diffDays > 30) return "text-amber-600 dark:text-amber-400 font-medium"
  if (diffDays > 7) return "text-foreground/80"
  return "text-turquoise"
}
