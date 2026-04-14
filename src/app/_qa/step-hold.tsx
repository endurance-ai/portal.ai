"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {type AnalyzedItem, LOCKABLE_ATTRS, type LockableAttr, MAX_LOCKED_ATTRS} from "./types"
import {useLocale} from "@/lib/i18n"
import type {DictKey} from "@/lib/i18n-dict"
import {toKo} from "@/lib/enums/enum-display-ko"

interface StepHoldProps {
  selectedItem: AnalyzedItem
  lockedAttrs: LockableAttr[]
  onToggleLock: (attr: LockableAttr) => void
  onBack: () => void
  onNext: () => void
}

function attrsFor(item: AnalyzedItem): LockableAttr[] {
  return LOCKABLE_ATTRS.filter((a) => {
    const v = item[a as keyof AnalyzedItem]
    return typeof v === "string" && v.length > 0
  })
}

export function StepHold({
  selectedItem,
  lockedAttrs,
  onToggleLock,
  onBack,
  onNext,
}: StepHoldProps) {
  const {t, locale} = useLocale()
  const available = attrsFor(selectedItem)
  const d = (v: string) => locale === "ko" ? toKo(v) : v

  return (
    <motion.div
      key="step-hold"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[640px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="III." title={t("qa.hold.title")} aside="Step 3" />

      <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] mb-2 max-w-[480px]">
        {t("qa.hold.desc")}
      </p>
      <p className="text-[12px] font-medium text-stone tracking-[-0.01em] mb-8 max-w-[480px]">
        {t("qa.hold.hint")}
      </p>

      <div className="flex flex-col gap-3">
        {available.map((attr) => {
          const val = selectedItem[attr as keyof AnalyzedItem] as string
          const isLocked = lockedAttrs.includes(attr)
          const isDisabled = !isLocked && lockedAttrs.length >= MAX_LOCKED_ATTRS

          return (
            <button
              key={attr}
              type="button"
              onClick={() => !isDisabled && onToggleLock(attr)}
              disabled={isDisabled}
              className={cn(
                "flex items-center justify-between p-4 border transition-colors text-left",
                isLocked
                  ? "bg-ink text-cream border-ink"
                  : "border-line text-ink hover:border-ink-soft",
                isDisabled && "opacity-40 cursor-not-allowed",
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] opacity-60">
                  {t(`attr.${attr}` as DictKey)}
                </span>
                <span className="text-[15px] font-semibold tracking-[-0.02em]">
                  {d(val)}
                </span>
              </div>
              <div className={cn(
                "w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                isLocked ? "border-cream bg-cream" : "border-current opacity-40",
              )}>
                {isLocked && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#111" strokeWidth="1.5" strokeLinecap="square" />
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 text-right">
        <span className="text-[11px] font-medium text-ink-quiet tabular-nums">
          {lockedAttrs.length} / {MAX_LOCKED_ATTRS}
        </span>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          &#8592; {t("qa.confirm.back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
        >
          {t("qa.hold.cta")} &#8594;
        </button>
      </div>
    </motion.div>
  )
}
