"use client"

import {useState} from "react"
import {motion} from "framer-motion"
import {ArrowUpRight, Lock, RotateCcw, Sliders} from "lucide-react"
import {cn} from "@/lib/utils"
import {type AgentProduct, type AnalyzedItem, ATTR_LABELS, type LockableAttr,} from "./types"
import {pickUnlockSuggestion} from "./recommend-attr"

interface StepResultsProps {
  imageUrl: string
  selectedItem: AnalyzedItem
  lockedAttrs: LockableAttr[]
  products: AgentProduct[]
  searching: boolean
  error: string | null
  onRefineAgain: () => void
  onReset: () => void
  /** 결과가 비었을 때 한 번 클릭으로 풀 lock 후보(MVP: 가장 narrow한 속성을 추천) */
  onUnlockAttr?: (attr: LockableAttr) => void
}


function formatAttrValue(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function attrValue(item: AnalyzedItem, attr: LockableAttr): string | null {
  const raw = item[attr as keyof AnalyzedItem]
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

function UpgradedImage({ src, alt }: { src: string; alt: string }) {
  // big 이미지로 우선 로드, 실패 시 원본 사용 (product-card.tsx와 동일 패턴)
  const [imgSrc, setImgSrc] = useState(() =>
    src.includes("/small/") ? src.replace("/small/", "/big/") : src,
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      onError={() => {
        if (imgSrc !== src) setImgSrc(src)
      }}
    />
  )
}

export function StepResults({
  imageUrl,
  selectedItem,
  lockedAttrs,
  products,
  searching,
  error,
  onRefineAgain,
  onReset,
  onUnlockAttr,
}: StepResultsProps) {
  const unlockSuggestion = pickUnlockSuggestion(lockedAttrs)
  const unlockSuggestionValue = unlockSuggestion
    ? attrValue(selectedItem, unlockSuggestion)
    : null
  return (
    <motion.div
      key="step-results"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-6xl mx-auto space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            Step 4 / 4
          </p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-[-0.03em]">
            {searching
              ? "Searching the catalog…"
              : products.length > 0
                ? `${products.length} matches found`
                : "No matches yet"}
          </h2>
          {!searching && lockedAttrs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Locked:
              </span>
              {lockedAttrs.map((attr) => {
                const v = attrValue(selectedItem, attr)
                if (!v) return null
                return (
                  <span
                    key={attr}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-foreground/10 border border-foreground/20 text-[10px] font-mono text-foreground"
                  >
                    <Lock className="size-2.5" />
                    {ATTR_LABELS[attr]}: {formatAttrValue(v)}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefineAgain}
            disabled={searching}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg border border-border text-xs font-mono uppercase tracking-wider transition-colors",
              searching
                ? "opacity-40 cursor-not-allowed"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Sliders className="size-3.5" />
            Refine again
          </button>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="size-3.5" />
            New search
          </button>
        </div>
      </div>

      {/* Reference card */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-surface-dim">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Reference" className="absolute inset-0 w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Reference
          </p>
          <p className="text-sm font-medium text-foreground truncate">{selectedItem.name}</p>
          {selectedItem.detail && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {selectedItem.detail}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-mono text-red-400">
          {error}
        </div>
      )}

      {/* Results grid */}
      {searching ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card overflow-hidden animate-pulse"
            >
              <div className="aspect-[4/5] bg-surface-dim" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-surface-dim rounded w-2/3" />
                <div className="h-3 bg-surface-dim rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-4">
          <p className="text-sm font-medium text-foreground">
            No products matched all your locked attributes.
          </p>
          {unlockSuggestion && unlockSuggestionValue && onUnlockAttr ? (
            <>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Try unlocking{" "}
                <span className="font-semibold text-foreground">
                  {ATTR_LABELS[unlockSuggestion]}
                </span>{" "}
                ({formatAttrValue(unlockSuggestionValue)}) — it&apos;s usually the
                narrowest filter.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onUnlockAttr(unlockSuggestion)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-xs font-mono uppercase tracking-wider hover:opacity-90 transition-opacity"
                >
                  Unlock {ATTR_LABELS[unlockSuggestion]}
                </button>
                <button
                  type="button"
                  onClick={onRefineAgain}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-mono uppercase tracking-wider text-foreground hover:bg-muted transition-colors"
                >
                  <Sliders className="size-3.5" />
                  Adjust manually
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Try widening the price range or relaxing the tolerance.
              </p>
              <button
                type="button"
                onClick={onRefineAgain}
                className="mt-2 inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-foreground text-background text-xs font-mono uppercase tracking-wider hover:opacity-90 transition-opacity"
              >
                <Sliders className="size-3.5" />
                Adjust filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p, idx) => (
            <motion.a
              key={p.link || `${p.brand}-${p.title || "untitled"}-${idx}`}
              href={p.link}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="group block rounded-xl border border-border bg-card overflow-hidden hover:border-outline/60 transition-colors"
            >
              {/* Image */}
              <div className="relative aspect-[4/5] bg-surface-dim overflow-hidden">
                {p.imageUrl ? (
                  <UpgradedImage src={p.imageUrl} alt={p.title || p.brand} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 text-xs font-mono">
                    No image
                  </div>
                )}
                {/* Lock match chips — backend hard filter가 모든 lock을 보장한 후에만 표시.
                    카드당 1개 통합 칩으로 줄여 이미지 가림 최소화 (이전: lock당 1개씩 → 이미지 차단). */}
                {lockedAttrs.length > 0 && (
                  <div className="absolute top-2 left-2">
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm border border-foreground/30 text-[9px] font-mono uppercase text-foreground"
                      title={`Locked: ${lockedAttrs.map((a) => ATTR_LABELS[a]).join(", ")}`}
                    >
                      <Lock className="size-2" />
                      {lockedAttrs.length === 1 ? ATTR_LABELS[lockedAttrs[0]] : `${lockedAttrs.length} locks`}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="flex items-center justify-center size-7 rounded-full bg-foreground text-background">
                    <ArrowUpRight className="size-3.5" />
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-1.5">
                {p.title && (
                  <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug min-h-[2.5em]">
                    {p.title}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground truncate">
                    {p.brand}
                  </span>
                  <span className="text-xs font-bold text-foreground shrink-0">{p.price}</span>
                </div>
                <p className="text-[10px] font-mono text-on-surface-variant truncate">
                  {p.platform}
                </p>
                {p.matchReasons && p.matchReasons.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {p.matchReasons.slice(0, 3).map((r) => (
                      <span
                        key={`${r.field}-${r.value}`}
                        className="px-1.5 py-0.5 bg-muted rounded text-[9px] font-mono text-muted-foreground"
                      >
                        {r.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.a>
          ))}
        </div>
      )}
    </motion.div>
  )
}
