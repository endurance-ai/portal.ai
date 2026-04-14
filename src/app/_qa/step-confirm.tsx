"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {type AnalyzedItem, LOCKABLE_ATTRS, type LockableAttr} from "./types"
import {COLOR_FAMILIES, FABRICS, FITS, SUBCATEGORIES} from "@/lib/enums/product-enums"
import {useLocale} from "@/lib/i18n"
import type {DictKey} from "@/lib/i18n-dict"
import {toKo} from "@/lib/enums/enum-display-ko"
import {CustomSelect} from "@/components/ui/custom-select"

interface StepConfirmProps {
  items: AnalyzedItem[]
  selectedItemId: string | null
  editedItem: Partial<AnalyzedItem> | null
  onSelectItem: (id: string) => void
  onEditAttr: (key: string, value: string) => void
  onBack: () => void
  onConfirm: () => void
}

function getOptionsForAttr(attr: LockableAttr, item: AnalyzedItem): string[] {
  switch (attr) {
    case "subcategory": {
      const cat = item.category as keyof typeof SUBCATEGORIES
      return SUBCATEGORIES[cat] ? [...SUBCATEGORIES[cat]] : []
    }
    case "colorFamily":
      return [...COLOR_FAMILIES]
    case "fit":
      return [...FITS]
    case "fabric":
      return [...FABRICS]
    case "season":
      return ["spring", "summer", "fall", "winter", "all-season"]
    case "pattern":
      return ["solid", "stripe", "check", "floral", "graphic", "camo", "dot", "paisley", "animal", "abstract"]
    default:
      return []
  }
}

function getItemValue(item: AnalyzedItem, edited: Partial<AnalyzedItem> | null, key: LockableAttr): string {
  if (edited && key in edited) return (edited as Record<string, string>)[key] ?? ""
  return (item[key as keyof AnalyzedItem] as string) ?? ""
}

export function StepConfirm({
  items,
  selectedItemId,
  editedItem,
  onSelectItem,
  onEditAttr,
  onBack,
  onConfirm,
}: StepConfirmProps) {
  const {t, locale} = useLocale()
  const selected = items.find((i) => i.id === selectedItemId) ?? items[0]
  const d = (v: string) => locale === "ko" ? toKo(v) : v

  const editableAttrs = selected
    ? LOCKABLE_ATTRS.filter((a) => {
        const v = getItemValue(selected, editedItem, a)
        return v.length > 0
      })
    : []

  return (
    <motion.div
      key="step-confirm"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[960px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="II." title={t("qa.confirm.title")} aside="Step 2" />

      <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] mb-8 max-w-[520px]">
        {t("qa.confirm.desc")}
      </p>

      {/* Items grid */}
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
              <span className="text-[12px] font-medium text-ink-quiet tabular-nums tracking-[-0.01em]">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <div className="mt-3 text-[20px] font-semibold text-ink tracking-[-0.03em] leading-[1.15]">
                {item.name || item.subcategory || item.category}
              </div>
              <div className="mt-3 text-[12px] font-medium text-stone tracking-[-0.01em]">
                {[colorVal, item.fit, item.fabric].filter(Boolean).map(v => d(v!)).join(" · ")}
              </div>
            </button>
          )
        })}
      </div>

      {/* Edit area */}
      {selected && (
        <div className="border-t border-line pt-6">
          <p className="text-[13px] font-semibold text-ink tracking-[-0.01em] mb-5">
            {t("qa.confirm.edit")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {editableAttrs.map((attr) => {
              const value = getItemValue(selected, editedItem, attr)
              const options = getOptionsForAttr(attr, selected)
              const allOptions = options.length > 0 && !options.includes(value) && value
                ? [value, ...options]
                : options
              return (
                <div key={attr} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-ink-quiet uppercase tracking-[0.08em]">
                    {t(`attr.${attr}` as DictKey)}
                  </span>
                  {allOptions.length > 0 ? (
                    <CustomSelect
                      value={value}
                      options={allOptions}
                      onChange={(v) => onEditAttr(attr, v)}
                      displayFn={locale === "ko" ? toKo : undefined}
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => onEditAttr(attr, e.target.value)}
                      className="bg-transparent border-b border-ink pb-2 text-[14px] font-medium text-ink tracking-[-0.01em] outline-none"
                    />
                  )}
                </div>
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
          &#8592; {t("qa.confirm.back")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
        >
          {t("qa.confirm.cta")} &#8594;
        </button>
      </div>
    </motion.div>
  )
}
