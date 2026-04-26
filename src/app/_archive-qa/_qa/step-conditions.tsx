"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {SIMILARITY_OPTIONS, type SimilarityLevel} from "./types"
import {useLocale} from "@/lib/i18n"
import type {DictKey} from "@/lib/i18n-dict"

interface StepConditionsProps {
  similarityLevel: SimilarityLevel
  priceMin: number | null
  priceMax: number | null
  onSetSimilarity: (level: SimilarityLevel) => void
  onSetPrice: (min: number | null, max: number | null) => void
  onBack: () => void
  onNext: () => void
}

export function StepConditions({
  similarityLevel,
  priceMin,
  priceMax,
  onSetSimilarity,
  onSetPrice,
  onBack,
  onNext,
}: StepConditionsProps) {
  const {t} = useLocale()

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

  return (
    <motion.div
      key="step-conditions"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[640px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="IV." title={t("qa.conditions.title")} aside="Step 4" />

      <div className="flex flex-col gap-3 mb-10">
        {SIMILARITY_OPTIONS.map((opt) => {
          const isActive = similarityLevel === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSetSimilarity(opt.value)}
              className={cn(
                "flex items-center gap-4 p-4 border transition-colors text-left",
                isActive
                  ? "border-ink bg-ink text-cream"
                  : "border-line text-ink hover:border-ink-soft",
              )}
            >
              <div className={cn(
                "w-4 h-4 border-2 flex items-center justify-center flex-shrink-0",
                isActive ? "border-cream" : "border-current opacity-40",
              )}>
                {isActive && <div className="w-2 h-2 bg-cream" />}
              </div>
              <span className="text-[14px] font-medium tracking-[-0.01em]">
                {t(`qa.similarity.${opt.value}` as DictKey)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="border-t border-line pt-6 mb-10">
        <p className="text-[13px] font-semibold text-ink tracking-[-0.01em] mb-2">
          {t("qa.conditions.budget")}
        </p>
        <p className="text-[12px] font-medium text-stone tracking-[-0.01em] mb-5">
          {t("qa.conditions.budgetHint")}
        </p>
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
              onChange={(e) => onSetPrice(parsePrice(e.target.value), priceMax)}
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
              onChange={(e) => onSetPrice(priceMin, parsePrice(e.target.value))}
              className="flex-1 bg-transparent outline-none text-[15px] font-medium text-ink tabular-nums tracking-[-0.01em] placeholder:text-ink-quiet"
            />
          </label>
        </div>
      </div>

      <div className="mt-12 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          &larr; {t("qa.confirm.back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
        >
          {t("qa.conditions.cta")} &rarr;
        </button>
      </div>
    </motion.div>
  )
}
