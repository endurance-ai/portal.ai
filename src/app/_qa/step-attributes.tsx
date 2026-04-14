"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {
  ATTR_LABELS,
  LOCKABLE_ATTRS,
  MAX_LOCKED_ATTRS,
  type AnalyzedItem,
  type LockableAttr,
} from "./types"

interface StepAttributesProps {
  imageUrl: string
  items: AnalyzedItem[]
  selectedItemId: string | null
  lockedAttrs: LockableAttr[]
  onSelectItem: (id: string) => void
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

export function StepAttributes(props: StepAttributesProps) {
  const {items, selectedItemId, lockedAttrs, onSelectItem, onToggleLock, onBack, onNext} = props
  const selected = items.find((i) => i.id === selectedItemId) ?? items[0]
  const canAdvance = lockedAttrs.length > 0 && lockedAttrs.length <= MAX_LOCKED_ATTRS

  return (
    <motion.div
      key="step-attributes"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[960px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="II." title="Which piece holds the feeling?" aside="Step 2" />

      <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] mb-8 max-w-[520px]">
        Pick one piece. Hold 1–{MAX_LOCKED_ATTRS} attributes to anchor the search.
      </p>

      {/* Items grid — text-driven catalog cards (no images) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {items.map((item, idx) => {
          const isSel = item.id === selected?.id
          const colorVal = item.colorFamily || item.color || null
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item.id)}
              className={cn(
                "group text-left p-5 transition-colors",
                isSel
                  ? "border-2 border-ink"
                  : "border border-line hover:border-ink-soft",
              )}
            >
              {/* Number */}
              <span className="text-[12px] font-medium text-ink-quiet tabular-nums tracking-[-0.01em]">
                {String(idx + 1).padStart(2, "0")}
              </span>

              {/* Name — large */}
              <div className="mt-3 text-[20px] font-semibold text-ink tracking-[-0.03em] leading-[1.15]">
                {item.name || item.subcategory || item.category}
              </div>

              {/* Color dot + primary attributes */}
              <div className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-stone tracking-[-0.01em]">
                {colorVal && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-ink flex-shrink-0" />
                )}
                {[colorVal, item.fit, item.fabric].filter(Boolean).join(" · ")}
              </div>

              {/* Attribute chips (small, muted) */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {attrsFor(item).slice(0, 5).map((attr) => {
                  const val = item[attr as keyof AnalyzedItem] as string
                  return (
                    <span
                      key={attr}
                      className="text-[10px] font-medium text-ink-quiet border border-line px-2 py-0.5 tracking-[0.02em] uppercase"
                    >
                      {val}
                    </span>
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>

      {/* Hold chips for selected item */}
      {selected && (
        <div className="border-t border-line pt-6">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[13px] font-semibold text-ink tracking-[-0.01em]">
              Hold up to {MAX_LOCKED_ATTRS} attributes of{" "}
              <em className="font-medium not-italic">
                {selected.name || selected.subcategory}
              </em>
            </span>
            <span className="text-[11px] font-medium text-ink-quiet tabular-nums">
              {lockedAttrs.length} / {MAX_LOCKED_ATTRS}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {attrsFor(selected).map((attr) => {
              const val = selected[attr as keyof AnalyzedItem] as string
              const isLocked = lockedAttrs.includes(attr)
              const isDisabled = !isLocked && lockedAttrs.length >= MAX_LOCKED_ATTRS
              return (
                <button
                  key={attr}
                  type="button"
                  onClick={() => !isDisabled && onToggleLock(attr)}
                  disabled={isDisabled}
                  className={cn(
                    "text-[13px] font-medium px-3 py-1.5 border transition-colors tracking-[-0.01em]",
                    isLocked
                      ? "bg-ink text-cream border-ink"
                      : "border-line text-ink-soft hover:border-ink hover:text-ink",
                    isDisabled && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <span className="text-ink-quiet mr-1.5 text-[11px] uppercase tracking-[0.05em]">
                    {ATTR_LABELS[attr]}
                  </span>
                  <span>{val}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-12 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          &#8592; Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className={cn(
            "text-[13px] font-semibold px-5 py-2 border transition-colors tracking-[-0.01em]",
            canAdvance
              ? "bg-ink text-cream border-ink hover:opacity-85"
              : "border-line text-ink-quiet cursor-not-allowed",
          )}
        >
          Hold &amp; continue &#8594;
        </button>
      </div>
    </motion.div>
  )
}
