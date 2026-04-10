"use client"

import {useMemo, useState} from "react"
import {ChevronDown} from "lucide-react"
import {cn} from "@/lib/utils"

type ScoreBreakdown = {
  subcategory: number
  subcategorySimilar: number
  nameMatch: number
  keywords: number
  fit: number
  fabric: number
  colorFamily: number
  colorAdjacent: number
  styleNode: number
  moodTags: number
  season: number
  pattern: number
  brandDna: number
  totalScore: number
}

type Product = {
  brand: string
  title: string
  price: string
  platform: string
  imageUrl: string
  link: string
  matchReasons?: { field: string; value: string }[]
  _scoring?: ScoreBreakdown
}

type DebugResult = {
  id: string
  products: Product[]
}

type SearchMeta = {
  duration: number
  totalProducts: number
  itemCount: number
}

// Score bar labels (sorted display order is by value, descending)
const SCORE_FIELDS: { key: keyof Omit<ScoreBreakdown, "totalScore">; label: string }[] = [
  {key: "styleNode", label: "styleNode"},
  {key: "subcategory", label: "subcategory"},
  {key: "subcategorySimilar", label: "subSimilar"},
  {key: "nameMatch", label: "nameMatch"},
  {key: "colorFamily", label: "colorFamily"},
  {key: "colorAdjacent", label: "colorAdj"},
  {key: "brandDna", label: "brandDna"},
  {key: "fit", label: "fit"},
  {key: "fabric", label: "fabric"},
  {key: "season", label: "season"},
  {key: "pattern", label: "pattern"},
  {key: "moodTags", label: "moodTags"},
  {key: "keywords", label: "keywords"},
]

// search-products/route.ts WEIGHTS.stylePrimary (highest single weight)
const MAX_SINGLE_SCORE = 0.30

function ScoreBar({value, maxValue}: {value: number; maxValue: number}) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0
  const tier = value >= 0.20 ? "high" : value >= 0.10 ? "mid" : value > 0 ? "low" : "zero"

  return (
    <div className="flex-1 h-[14px] bg-background rounded-sm overflow-hidden">
      {tier !== "zero" && (
        <div
          className={cn(
            "h-full rounded-sm transition-all duration-300",
            tier === "high" && "bg-gradient-to-r from-foreground/80 to-foreground",
            tier === "mid" && "bg-gradient-to-r from-muted-foreground/40 to-muted-foreground/70",
            tier === "low" && "bg-gradient-to-r from-muted-foreground/15 to-muted-foreground/30",
          )}
          style={{width: `${pct}%`}}
        />
      )}
    </div>
  )
}

function ProductCard({product, rank}: {product: Product; rank: number}) {
  const [expanded, setExpanded] = useState(rank <= 3) // top 3 auto-expanded
  const scoring = product._scoring

  // Sort score fields by value (descending), put zeros at end
  const sortedFields = useMemo(() =>
    scoring
      ? [...SCORE_FIELDS].sort((a, b) => (scoring[b.key] || 0) - (scoring[a.key] || 0))
      : SCORE_FIELDS,
    [scoring]
  )

  const nonZeroCount = scoring
    ? SCORE_FIELDS.filter((f) => (scoring[f.key] || 0) > 0).length
    : 0

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden mb-2">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="w-6 h-6 flex items-center justify-center bg-muted rounded text-xs font-bold text-muted-foreground shrink-0">
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{product.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {product.brand} · {product.platform} · {product.price}
          </div>
        </div>
        <div className="text-right shrink-0 mr-2">
          <div className="text-lg font-bold tabular-nums tracking-tight">
            {scoring?.totalScore.toFixed(2) ?? "—"}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {nonZeroCount} fields
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Score Breakdown — expandable */}
      {expanded && scoring && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          <div className="flex flex-col gap-[5px]">
            {sortedFields.map(({key, label}) => {
              const value = scoring[key] || 0
              const isZero = value === 0
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center",
                    isZero && "opacity-25"
                  )}
                >
                  <span className="w-[80px] text-[11px] text-muted-foreground text-right pr-3 shrink-0 tabular-nums">
                    {label}
                  </span>
                  <ScoreBar value={value} maxValue={MAX_SINGLE_SCORE} />
                  <span
                    className={cn(
                      "w-[40px] text-[11px] text-right pl-2 shrink-0 tabular-nums",
                      isZero
                        ? "text-muted-foreground/30"
                        : value >= 0.20
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground"
                    )}
                  >
                    {isZero ? "—" : value.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Match Reasons */}
          {product.matchReasons && product.matchReasons.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex flex-wrap gap-1.5">
                {product.matchReasons.map((r) => (
                  <span
                    key={`${r.field}-${r.value}`}
                    className="text-[10px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground"
                  >
                    {r.field}: {r.value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SearchDebuggerResults({results, meta}: {results: DebugResult[]; meta: SearchMeta}) {
  return (
    <div>
      {/* Results Header */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold">검색 결과</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {meta.itemCount}개 아이템 · {meta.totalProducts}개 상품 · {meta.duration}ms
        </span>
      </div>

      {/* Item Groups */}
      {results.map((result) => (
        <div key={result.id} className="mb-8">
          {/* Item Label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-muted-foreground">{result.id}</span>
            <span className="text-[11px] text-muted-foreground/50">
              {result.products.length}개 상품
            </span>
          </div>

          {/* Product Cards */}
          {result.products.map((product, idx) => (
            <ProductCard
              key={`${result.id}-${product.link}-${idx}`}
              product={product}
              rank={idx + 1}
            />
          ))}

          {result.products.length === 0 && (
            <div className="text-sm text-muted-foreground/50 text-center py-6 border border-dashed border-border rounded-lg">
              결과 없음
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
