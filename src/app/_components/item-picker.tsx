"use client"

import {cn} from "@/lib/utils"
import type {VisionAnalysisItem} from "@/lib/analyze/run-vision"

interface ItemPickerProps {
  slideR2Url: string
  items: VisionAnalysisItem[]
  onPick: (item: VisionAnalysisItem) => void
  busy?: boolean
}

/**
 * Vision이 검출한 다중 아이템 그리드 picker. 사용자가 1개 클릭 → 검색 단계.
 * archived `_archive-qa/_qa/step-confirm.tsx` 의 그리드 패턴을 단순화 (edit attrs 부분 드롭).
 */
export function ItemPicker({slideR2Url, items, onPick, busy = false}: ItemPickerProps) {
  return (
    <div className="flex flex-col md:flex-row gap-8 items-start max-w-[1100px]">
      {/* 슬라이드 미리보기 */}
      <div className="w-full md:w-[320px] shrink-0">
        <p className="text-[10px] tracking-[0.32em] uppercase text-ink-quiet mb-2">
          {"// the slide"}
        </p>
        <div className="aspect-[4/5] border border-line bg-white overflow-hidden relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slideR2Url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* 아이템 picker */}
      <div className="flex-1 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] tracking-[0.32em] uppercase text-ink-quiet">
            {"// pick a piece"}
          </p>
          <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-ink leading-[1.15]">
            which one are you looking for?
          </h2>
          <p className="mt-1 text-[13px] text-ink-soft max-w-[480px]">
            tap the piece you want and we&apos;ll find similar ones.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item, idx) => {
            const meta = [item.colorFamily || item.color, item.fit, item.fabric]
              .filter(Boolean)
              .join(" · ")
            return (
              <button
                key={item.id || `item-${idx}`}
                type="button"
                disabled={busy}
                onClick={() => onPick(item)}
                className={cn(
                  "group text-left p-5 transition-colors border",
                  busy
                    ? "border-line opacity-60 cursor-not-allowed"
                    : "border-line hover:border-ink"
                )}
              >
                <span className="text-[12px] font-medium text-ink-quiet tabular-nums tracking-[-0.01em]">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="mt-3 text-[18px] font-semibold text-ink tracking-[-0.02em] leading-[1.2]">
                  {item.name || item.subcategory || item.category}
                </div>
                {meta && (
                  <div className="mt-2 text-[11px] uppercase tracking-[0.08em] text-stone">
                    {meta}
                  </div>
                )}
                {item.detail && (
                  <div className="mt-2 text-[12px] text-ink-soft leading-[1.45] line-clamp-2">
                    {item.detail}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
