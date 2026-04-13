"use client"

import {motion} from "framer-motion"
import {ArrowLeft, ArrowRight, Check, Lock, Sparkles} from "lucide-react"
import {cn} from "@/lib/utils"
import {type AnalyzedItem, ATTR_LABELS, LOCKABLE_ATTRS, type LockableAttr, MAX_LOCKED_ATTRS,} from "./types"
import {recommendLockedAttr} from "./recommend-attr"

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

function attrValue(item: AnalyzedItem, attr: LockableAttr): string | null {
  const raw = item[attr as keyof AnalyzedItem]
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

function formatAttrValue(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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
  const canProceed = lockedAttrs.length > 0
  const lockedCount = lockedAttrs.length
  const remaining = MAX_LOCKED_ATTRS - lockedCount
  const recommended = selected ? recommendLockedAttr(selected) : null

  return (
    <motion.div
      key="step-attributes"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-5xl mx-auto space-y-8"
    >
      <div className="text-center space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Step 2 / 4
        </p>
        <h2 className="text-2xl md:text-4xl font-extrabold text-foreground tracking-[-0.03em]">
          Pick what you can&apos;t compromise on.
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          {items.length > 1
            ? "Choose the item you care about most, then lock 1–2 attributes that must match exactly."
            : "Lock 1–2 attributes that must match exactly. The rest will flex."}
        </p>
      </div>

      {/* Detection summary banner */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mx-auto max-w-2xl rounded-lg border border-foreground/20 bg-foreground/[0.04] px-4 py-2.5 flex items-center gap-3"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-mono font-bold text-foreground">
          {items.length}
        </span>
        <p className="text-xs text-muted-foreground leading-snug">
          <span className="text-foreground font-medium">Detected:</span>{" "}
          {items
            .map((it) => {
              const sub = it.subcategory ? formatAttrValue(it.subcategory) : it.category
              const color = it.colorFamily ? `${formatAttrValue(it.colorFamily)} ` : ""
              return `${color}${sub}`
            })
            .join(" · ")}
        </p>
      </motion.div>

      {/* Item picker (only if multiple) */}
      {items.length > 1 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-center">
            Detected items
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {items.map((it) => {
              const isSelected = it.id === selected?.id
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelectItem(it.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-xs font-mono transition-colors",
                    isSelected
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent text-muted-foreground border-border hover:border-outline/60 hover:text-foreground",
                  )}
                >
                  {it.category}
                  {it.subcategory ? ` · ${formatAttrValue(it.subcategory)}` : ""}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selected && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 items-start">
          {/* Reference preview */}
          <div className="space-y-3">
            <div className="relative aspect-[3/4] w-full rounded-xl border border-border bg-surface-dim overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Reference"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <p className="text-xs font-mono">No image</p>
                </div>
              )}
              {selected.position && imageUrl && (
                <div
                  className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-foreground/20 backdrop-blur-sm"
                  style={{
                    top: `${selected.position.top}%`,
                    left: `${selected.position.left}%`,
                  }}
                />
              )}
            </div>
            <div className="space-y-1 px-1">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Selected item
              </p>
              <p className="text-sm font-medium text-foreground">{selected.name}</p>
              {selected.detail && (
                <p className="text-xs text-muted-foreground">{selected.detail}</p>
              )}
            </div>
          </div>

          {/* Attribute cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Lock attributes ({lockedCount}/{MAX_LOCKED_ATTRS})
              </p>
              <p className="text-[10px] font-mono text-muted-foreground/60">
                {remaining > 0
                  ? `${remaining} slot${remaining > 1 ? "s" : ""} left`
                  : "max reached"}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 auto-rows-fr">
              {LOCKABLE_ATTRS.map((attr) => {
                const value = attrValue(selected, attr)
                const isLocked = lockedAttrs.includes(attr)
                const disabled = !value || (lockedCount >= MAX_LOCKED_ATTRS && !isLocked)
                const isRecommended = recommended === attr && !isLocked

                return (
                  <button
                    key={attr}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggleLock(attr)}
                    title={
                      !value
                        ? `AI didn't detect ${ATTR_LABELS[attr].toLowerCase()} for this item. That's OK — pick another attribute.`
                        : isRecommended
                          ? "Recommended — most distinctive trait of this item"
                          : undefined
                    }
                    aria-label={
                      !value
                        ? `${ATTR_LABELS[attr]} not detected by AI`
                        : `Toggle lock on ${ATTR_LABELS[attr]}: ${formatAttrValue(value)}`
                    }
                    className={cn(
                      "relative rounded-xl border p-4 text-left transition-all",
                      "flex flex-col gap-1.5 min-h-[88px]",
                      isLocked
                        ? "border-foreground bg-foreground/5"
                        : isRecommended
                          ? "border-foreground/60 bg-card hover:border-foreground"
                          : "border-border bg-card hover:border-outline/60",
                      disabled && !isLocked && "opacity-40 cursor-not-allowed hover:border-border",
                    )}
                  >
                    {isRecommended && (
                      <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-foreground text-background text-[9px] font-mono font-bold uppercase tracking-wider">
                        <Sparkles className="size-2.5" />
                        Pick
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {ATTR_LABELS[attr]}
                      </span>
                      {isLocked ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                      ) : value ? (
                        <Lock className="size-3.5 text-muted-foreground/40" />
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        value ? "text-foreground" : "text-muted-foreground/40 italic",
                      )}
                    >
                      {value ? formatAttrValue(value) : "Not detected"}
                    </span>
                    {!value && (
                      <span className="text-[10px] font-mono text-muted-foreground/40 leading-snug">
                        AI couldn&apos;t see this — pick another
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="pt-4 flex items-center justify-between gap-3 border-t border-border">
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
                disabled={!canProceed}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-opacity",
                  canProceed
                    ? "bg-foreground text-background hover:opacity-90"
                    : "bg-muted text-muted-foreground/50 cursor-not-allowed",
                )}
              >
                Next
                <ArrowRight className="size-3.5" />
              </button>
            </div>

            {!canProceed && (
              <p className="text-[11px] font-mono text-muted-foreground/60 text-center">
                Lock at least one attribute to continue.
              </p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
