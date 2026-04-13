"use client"

import {motion} from "framer-motion"
import Image from "next/image"
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

export function StepAttributes({
  imageUrl,
  items,
  selectedItemId,
  lockedAttrs,
  onSelectItem,
  onToggleLock,
  onBack,
  onNext,
}: StepAttributesProps) {
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
        Pick one piece. Lock 1–2 attributes to anchor the search.
        You can choose up to {MAX_LOCKED_ATTRS}.
      </p>

      {/* Items grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {items.map((item) => {
          const isSel = item.id === selected?.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item.id)}
              className={cn(
                "group text-left p-3 transition-colors",
                isSel
                  ? "border-2 border-ink"
                  : "border border-line hover:border-ink-soft",
              )}
            >
              <div className="relative aspect-square bg-line-mute overflow-hidden mb-3">
                {imageUrl && (
                  <Image src={imageUrl} alt="" fill className="object-cover" unoptimized />
                )}
              </div>
              <div className="text-[14px] font-semibold text-ink tracking-[-0.02em]">
                {item.name || item.subcategory || item.category}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attrsFor(item).slice(0, 4).map((attr) => {
                  const val = item[attr as keyof AnalyzedItem] as string
                  return (
                    <span
                      key={attr}
                      className="text-[11px] font-medium text-ink-soft border border-line px-2 py-0.5 tracking-[-0.01em]"
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

      {/* Lock chips for selected item */}
      {selected && (
        <div className="border-t border-line pt-6">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[13px] font-semibold text-ink tracking-[-0.01em]">
              Lock up to {MAX_LOCKED_ATTRS} attributes of{" "}
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
          Continue &#8594;
        </button>
      </div>
    </motion.div>
  )
}
