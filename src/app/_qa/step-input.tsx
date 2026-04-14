"use client"

import {motion} from "framer-motion"
import {SearchBar} from "@/components/search/search-bar"
import {type Gender} from "@/components/upload/gender-selector"

interface StepInputProps {
  gender: Gender
  onGenderChange: (g: Gender) => void
  onSubmit: (data: { prompt?: string; file?: File }) => void
  error: string | null
  loading: boolean
  loadingLabel?: string
}

export function StepInput({
  gender,
  onGenderChange,
  onSubmit,
  error,
  loading,
  loadingLabel,
}: StepInputProps) {
  return (
    <motion.div
      key="step-input"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[1024px] mx-auto pt-12 pb-8"
    >
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-10 md:gap-16 items-end">
        {/* Headline */}
        <h1 className="text-[52px] md:text-[82px] font-medium text-ink tracking-[-0.045em] leading-[0.96]">
          The look you love,
          <br />
          <b className="font-bold">piece by piece.</b>
        </h1>

        {/* Caption + input */}
        <div className="pb-3">
          <p className="text-[15px] font-normal text-ink-muted leading-[1.55] tracking-[-0.01em] max-w-[360px]">
            Drop a photograph or describe a mood. We read the outfit — fabric, cut,
            proportion — and surface <b className="font-semibold text-ink">every piece
            that could belong</b>.
          </p>

          {error && (
            <p className="mt-4 text-[13px] font-medium text-destructive">{error}</p>
          )}

          <div className="mt-8">
            <SearchBar
              gender={gender}
              onGenderChange={onGenderChange}
              onSubmit={onSubmit}
              disabled={loading}
            />
          </div>

          <div className="mt-5 flex items-center justify-end">
            {loading && loadingLabel && (
              <p className="text-[11px] font-medium text-ink-quiet tracking-[-0.01em] animate-pulse">
                {loadingLabel}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
