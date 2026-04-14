"use client"

import {motion} from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {
  ATTR_LABELS,
  type AgentProduct,
  type AnalyzedItem,
  type LockableAttr,
} from "./types"

interface StepResultsProps {
  imageUrl: string
  selectedItem: AnalyzedItem
  lockedAttrs: LockableAttr[]
  products: AgentProduct[]
  searching: boolean
  error: string | null
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
  onRefineAgain,
  onUnlockAttr,
  onReset,
}: StepResultsProps) {
  const hasProducts = products.length > 0

  return (
    <motion.div
      key="step-results"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[1120px] mx-auto pt-8 pb-12"
    >
      <SectionMarker
        numeral="IV."
        title={
          hasProducts
            ? `${products.length} pieces, close.`
            : searching
              ? "Looking\u2026"
              : "Nothing close \u2014 yet."
        }
        aside="Step 4"
      />

      {/* Locked attribute chips */}
      {lockedAttrs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet">
            Held:
          </span>
          {lockedAttrs.map((attr) => {
            const val = selectedItem[attr as keyof AnalyzedItem]
            return (
              <button
                key={attr}
                type="button"
                onClick={() => onUnlockAttr(attr)}
                className="text-[12px] font-medium bg-ink text-cream px-2.5 py-1 hover:opacity-80 transition-opacity tracking-[-0.01em]"
                aria-label={`Release ${ATTR_LABELS[attr]}`}
              >
                {ATTR_LABELS[attr]} — {String(val)} &times;
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="text-[13px] text-destructive mb-6">{error}</p>
      )}

      {/* Empty state */}
      {!searching && !hasProducts && !error && (
        <div className="py-16 text-center flex flex-col items-center gap-4">
          <p className="text-[15px] text-ink-muted max-w-[360px]">
            Try widening the hold or raising the budget.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Looser cut", "More color", "Raise budget"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={onRefineAgain}
                className="text-[12px] font-medium px-3 py-1 border border-ink text-ink hover:bg-ink hover:text-cream transition-colors tracking-[-0.01em]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Products grid */}
      {hasProducts && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((p, idx) => (
            <ProductCard
              key={`${p.link}-${idx}`}
              product={p}
              lockVisible={lockedAttrs.length > 0}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-12 flex items-center justify-between border-t border-line pt-6">
        <button
          type="button"
          onClick={onReset}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          Start again
        </button>
        <button
          type="button"
          onClick={onRefineAgain}
          className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
        >
          Adjust &rarr;
        </button>
      </div>
    </motion.div>
  )
}

function ProductCard({
  product,
  lockVisible,
}: {
  product: AgentProduct
  lockVisible: boolean
}) {
  return (
    <Link
      href={product.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
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
          <div className="w-full h-full flex items-center justify-center text-ink-quiet text-xs">
            &mdash;
          </div>
        )}
        {lockVisible && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold text-ink bg-cream px-1.5 py-0.5 tracking-[0.1em]">
            HELD
          </span>
        )}
        {product.matchReasons && product.matchReasons.length > 0 && (
          <div
            className={cn(
              "absolute inset-0 bg-ink/80 flex items-end p-3 opacity-0",
              "group-hover:opacity-100 transition-opacity duration-200",
            )}
          >
            <div className="flex flex-wrap gap-1">
              {product.matchReasons.slice(0, 3).map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] font-medium text-cream bg-transparent border border-cream/60 px-2 py-0.5 tracking-[-0.01em]"
                >
                  {r.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="text-[13px] font-semibold text-ink tracking-[-0.02em] line-clamp-1">
        {product.brand}
      </div>
      <div className="text-[12px] font-medium text-ink-soft tracking-[-0.01em] tabular-nums">
        {product.price}
      </div>
    </Link>
  )
}
