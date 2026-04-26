"use client"

import {cn} from "@/lib/utils"

export interface SlideOption {
  orderIndex: number // 0-indexed (DB storage)
  r2Url: string
  width: number | null
  height: number | null
  isVideo: boolean
}

interface SlidePickerProps {
  slides: SlideOption[]
  onPick: (slideIndex1: number) => void // 1-indexed (UI/API contract)
  busy?: boolean
}

/**
 * 캐러셀 슬라이드 thumbnail 그리드 picker.
 * URL에 ?img_index 가 없으면 노출 — 사용자가 1장 골라서 다음 단계로.
 * 비디오 슬라이드는 dim + disabled.
 */
export function SlidePicker({slides, onPick, busy = false}: SlidePickerProps) {
  return (
    <div className="flex flex-col gap-5 max-w-[920px]">
      <div className="flex flex-col gap-1">
        <p className="text-[10px] tracking-[0.32em] uppercase text-ink-quiet">
          {"// pick a slide"}
        </p>
        <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-ink leading-[1.15]">
          which look caught your eye?
        </h2>
        <p className="mt-1 text-[13px] text-ink-soft max-w-[480px]">
          we&apos;ll only analyze the slide you tap — pick the one with the
          piece you want.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {slides.map((s) => {
          const slideIndex1 = s.orderIndex + 1
          const disabled = busy || s.isVideo
          return (
            <button
              key={s.orderIndex}
              type="button"
              disabled={disabled}
              onClick={() => onPick(slideIndex1)}
              className={cn(
                "group relative aspect-[4/5] overflow-hidden border bg-white transition-colors",
                disabled
                  ? "border-line opacity-50 cursor-not-allowed"
                  : "border-line hover:border-ink"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.r2Url}
                alt={s.isVideo ? `slide ${slideIndex1} (video — not analyzable)` : `slide ${slideIndex1}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute top-2 left-2 text-[10px] tracking-[0.2em] uppercase text-cream bg-ink/80 px-1.5 py-0.5">
                {String(slideIndex1).padStart(2, "0")}
              </span>
              {s.isVideo && (
                <span className="absolute bottom-2 left-2 text-[10px] tracking-[0.2em] uppercase text-cream bg-ink/80 px-1.5 py-0.5">
                  video — skip
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
