"use client"

import {motion} from "framer-motion"
import {ArrowLeft, ArrowRight} from "lucide-react"
import {cn} from "@/lib/utils"
import {toleranceToTargetCount} from "@/lib/search/locked-filter"
import {type RefineReason} from "./types"

interface StepRefineProps {
  tolerance: number
  priceMin: number | null
  priceMax: number | null
  reason: RefineReason | null
  onSetTolerance: (v: number) => void
  onSetPrice: (min: number | null, max: number | null) => void
  onSetReason: (r: RefineReason | null) => void
  onBack: () => void
  onNext: () => void
}

const REASONS: { id: RefineReason; label: string; hint: string }[] = [
  { id: "price", label: "Price", hint: "Looking for cheaper" },
  { id: "size", label: "Size", hint: "Different size needed" },
  { id: "variety", label: "Variety", hint: "More options to compare" },
  { id: "brand", label: "Brand", hint: "Try other brands" },
]

function toleranceLabel(v: number): string {
  if (v < 0.25) return "Stay tight to reference"
  if (v < 0.55) return "Moderate variance"
  if (v < 0.8) return "Open to alternatives"
  return "Wide exploration"
}


function parseInt0(v: string): number | null {
  const n = Number(v.replace(/[^\d]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function StepRefine({
  tolerance,
  priceMin,
  priceMax,
  reason,
  onSetTolerance,
  onSetPrice,
  onSetReason,
  onBack,
  onNext,
}: StepRefineProps) {
  const tolPct = Math.round(tolerance * 100)

  return (
    <motion.div
      key="step-refine"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-3xl mx-auto space-y-10"
    >
      <div className="text-center space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Step 3 / 4
        </p>
        <h2 className="text-2xl md:text-4xl font-extrabold text-foreground tracking-[-0.03em]">
          How wide should we cast the net?
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Tighten or relax the match around your locked attributes. Add a budget if
          you want.
        </p>
      </div>

      {/* Tolerance slider */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Style tolerance
          </p>
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              ≈ {toleranceToTargetCount(tolerance)} results
            </p>
            <p className="text-xs font-mono text-foreground tabular-nums">{tolPct}%</p>
          </div>
        </div>
        <div className="space-y-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={tolPct}
            onChange={(e) => onSetTolerance(Number(e.target.value) / 100)}
            aria-label="Style tolerance"
            className="w-full accent-foreground"
          />
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Tight ↞</span>
            <span className="text-foreground">{toleranceLabel(tolerance)}</span>
            <span>↠ Loose</span>
          </div>
        </div>
      </section>

      {/* Price range */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Budget (optional)
          </p>
          {(priceMin || priceMax) && (
            <button
              type="button"
              onClick={() => onSetPrice(null, null)}
              className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 block">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Min ₩
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={priceMin ?? ""}
              onChange={(e) => onSetPrice(parseInt0(e.target.value), priceMax)}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-sm focus:border-outline-focus focus:outline-none transition-colors"
            />
          </label>
          <label className="space-y-1.5 block">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Max ₩
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="No limit"
              value={priceMax ?? ""}
              onChange={(e) => onSetPrice(priceMin, parseInt0(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-sm focus:border-outline-focus focus:outline-none transition-colors"
            />
          </label>
        </div>
      </section>

      {/* Reason */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Why are you looking for an alternative? <span className="opacity-50">(optional)</span>
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {REASONS.map((r) => {
            const selected = reason === r.id
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSetReason(selected ? null : r.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-foreground bg-foreground/5"
                    : "border-border bg-transparent hover:border-outline/60",
                )}
              >
                <p
                  className={cn(
                    "text-sm font-medium",
                    selected ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {r.label}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                  {r.hint}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      <div className="pt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-foreground text-background hover:opacity-90 transition-opacity"
        >
          Find matches
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </motion.div>
  )
}
