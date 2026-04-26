"use client"

import {motion} from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {type AgentProduct, type AnalyzedItem, type LockableAttr} from "./types"
import {useLocale} from "@/lib/i18n"
import type {DictKey} from "@/lib/i18n-dict"
import {toKo} from "@/lib/enums/enum-display-ko"
import {pickUnlockSuggestion} from "./recommend-attr"

interface StepResultsProps {
  imageUrl: string
  selectedItem: AnalyzedItem
  lockedAttrs: LockableAttr[]
  products: AgentProduct[]
  searching: boolean
  error: string | null
  onGoToFeedback: () => void
  onRefineAgain: () => void
  onUnlockAttr: (attr: LockableAttr) => void
  onReset: () => void
}

export function StepResults({
  selectedItem,
  lockedAttrs,
  products,
  searching,
  error,
  onGoToFeedback,
  onRefineAgain,
  onUnlockAttr,
  onReset,
}: StepResultsProps) {
  const {t, locale} = useLocale()
  const hasProducts = products.length > 0
  const d = (v: string) => locale === "ko" ? toKo(v) : v

  const summaryTitle = (() => {
    if (searching) return t("qa.results.searching")
    if (!hasProducts) return t("qa.results.empty")
    const lockLabels = lockedAttrs.map((attr) => {
      const val = selectedItem[attr as keyof AnalyzedItem]
      return String(val)
    })
    if (lockLabels.length > 0) {
      return `${lockLabels.map(d).join(" · ")} — ${products.length} pieces`
    }
    return `${products.length} pieces found.`
  })()

  return (
    <motion.div
      key="step-results"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[1120px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="V." title={summaryTitle} aside="Step 5" />

      {lockedAttrs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet">
            {t("qa.results.held")}
          </span>
          {lockedAttrs.map((attr) => {
            const val = selectedItem[attr as keyof AnalyzedItem]
            return (
              <button
                key={attr}
                type="button"
                onClick={() => onUnlockAttr(attr)}
                className="text-[12px] font-medium bg-ink text-cream px-2.5 py-1 hover:opacity-80 transition-opacity tracking-[-0.01em]"
                aria-label={`Release ${t(`attr.${attr}` as DictKey)}`}
              >
                {t(`attr.${attr}` as DictKey)} — {d(String(val))} &times;
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="text-[13px] text-destructive mb-6">{error}</p>}

      {!searching && !hasProducts && !error && (() => {
        const unlockSuggestion = lockedAttrs.length > 0 ? pickUnlockSuggestion(lockedAttrs) : null
        return (
          <div className="py-16 text-center flex flex-col items-center gap-4">
            <p className="text-[15px] text-ink-muted max-w-[360px]">
              {t("qa.results.emptyHint")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {unlockSuggestion && (
                <button
                  type="button"
                  onClick={() => onUnlockAttr(unlockSuggestion)}
                  className="text-[12px] font-medium px-3 py-1 border border-ink text-ink hover:bg-ink hover:text-cream transition-colors tracking-[-0.01em]"
                >
                  {t(`attr.${unlockSuggestion}` as DictKey)} release →
                </button>
              )}
              <button
                type="button"
                onClick={onRefineAgain}
                className="text-[12px] font-medium px-3 py-1 border border-ink text-ink hover:bg-ink hover:text-cream transition-colors tracking-[-0.01em]"
              >
                {t("qa.results.adjust")}
              </button>
            </div>
          </div>
        )
      })()}

      {hasProducts && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((p, idx) => (
            <ProductCard key={`${p.link}-${idx}`} product={p} lockVisible={lockedAttrs.length > 0} />
          ))}
        </div>
      )}

      <div className="mt-12 flex items-center justify-between border-t border-line pt-6">
        <button
          type="button"
          onClick={onReset}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          {t("qa.results.startOver")}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefineAgain}
            className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
          >
            {t("qa.results.adjust")}
          </button>
          <button
            type="button"
            onClick={onGoToFeedback}
            className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
          >
            {t("qa.results.toFeedback")} &rarr;
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function ProductCard({product, lockVisible}: {product: AgentProduct; lockVisible: boolean}) {
  const safeLink = /^https?:\/\//.test(product.link) ? product.link : "#"

  return (
    <Link href={safeLink} target="_blank" rel="noopener noreferrer" className="group block">
      <div className="relative aspect-[4/5] bg-line-mute overflow-hidden mb-2">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.title ?? product.brand}
            fill
            sizes="(max-width:768px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-quiet text-xs">&mdash;</div>
        )}
        {lockVisible && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold text-ink bg-cream px-1.5 py-0.5 tracking-[0.1em]">
            HELD
          </span>
        )}
        {product.matchReasons && product.matchReasons.length > 0 && (
          <div className={cn("absolute inset-0 bg-ink/80 flex items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200")}>
            <div className="flex flex-wrap gap-1">
              {product.matchReasons.slice(0, 3).map((r, i) => (
                <span key={i} className="text-[10px] font-medium text-cream bg-transparent border border-cream/60 px-2 py-0.5 tracking-[-0.01em]">
                  {r.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="text-[13px] font-semibold text-ink tracking-[-0.02em] line-clamp-1">{product.brand}</div>
      <div className="text-[12px] font-medium text-ink-soft tracking-[-0.01em] tabular-nums">{product.price}</div>
    </Link>
  )
}
