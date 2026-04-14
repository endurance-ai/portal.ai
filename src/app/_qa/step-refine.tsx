"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
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

export function StepRefine({
  tolerance,
  priceMin,
  priceMax,
  onSetTolerance,
  onSetPrice,
  onBack,
  onNext,
}: StepRefineProps) {
  const formatNumber = (n: number | null): string => {
    if (n === null) return ""
    return n.toLocaleString("ko-KR")
  }

  const parsePrice = (v: string): number | null => {
    const cleaned = v.replace(/[^0-9]/g, "")
    if (cleaned === "") return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }

  const handleMin = (v: string) => onSetPrice(parsePrice(v), priceMax)
  const handleMax = (v: string) => onSetPrice(priceMin, parsePrice(v))

  return (
    <motion.div
      key="step-refine"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[640px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="III." title="Exact, or loose?" aside="Step 3" />

      {/* Style tolerance */}
      <div className="mb-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet mb-3">
          Style tolerance
        </div>
        <div className="relative h-[2px] bg-line-mute">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tolerance}
            onChange={(e) => onSetTolerance(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Style tolerance slider"
          />
          <div
            className="absolute h-[2px] bg-ink top-0 left-0"
            style={{width: `${tolerance * 100}%`}}
          />
          <div
            className="absolute w-3 h-3 bg-ink rounded-full -top-[5px]"
            style={{left: `calc(${tolerance * 100}% - 6px)`}}
          />
        </div>
        <div className="mt-3 flex justify-between text-[12px] font-medium text-ink-quiet tracking-[-0.01em]">
          <span className={cn(tolerance < 0.5 && "text-ink font-semibold")}>Tight</span>
          <span className={cn(tolerance > 0.5 && "text-ink font-semibold")}>Loose</span>
        </div>
      </div>

      {/* Price */}
      <div className="border-t border-line pt-6 mb-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet mb-3">
          Budget — KRW
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-baseline border-b border-ink pb-2 gap-2">
            <span className="text-[11px] text-ink-quiet uppercase tracking-[0.08em] min-w-[28px]">
              Min
            </span>
            <span className="text-[15px] font-medium text-ink-quiet">₩</span>
            <input
              inputMode="numeric"
              placeholder="—"
              value={formatNumber(priceMin)}
              onChange={(e) => handleMin(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[15px] font-medium text-ink tabular-nums tracking-[-0.01em] placeholder:text-ink-quiet"
            />
          </label>
          <label className="flex items-baseline border-b border-ink pb-2 gap-2">
            <span className="text-[11px] text-ink-quiet uppercase tracking-[0.08em] min-w-[28px]">
              Max
            </span>
            <span className="text-[15px] font-medium text-ink-quiet">₩</span>
            <input
              inputMode="numeric"
              placeholder="—"
              value={formatNumber(priceMax)}
              onChange={(e) => handleMax(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[15px] font-medium text-ink tabular-nums tracking-[-0.01em] placeholder:text-ink-quiet"
            />
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-12 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
        >
          Find pieces &rarr;
        </button>
      </div>
    </motion.div>
  )
}
