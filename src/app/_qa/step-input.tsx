"use client"

import {motion} from "framer-motion"
import {SearchBar} from "@/components/search/search-bar"
import {type Gender, GenderSelector} from "@/components/upload/gender-selector"

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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-2xl mx-auto space-y-8 text-center"
    >
      <div className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Step 1 / 4
        </p>
        <h1 className="text-2xl md:text-4xl font-extrabold text-foreground tracking-[-0.03em] leading-tight">
          Show us a reference.
          <br />
          <span className="text-muted-foreground">We&apos;ll take it from there.</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto pt-2">
          Drop an image or describe what you saw. We&apos;ll analyze it and ask you a few
          quick questions to find the right alternatives.
        </p>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-red-400 text-sm font-mono bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg"
        >
          {error}
        </motion.p>
      )}

      <SearchBar
        gender={gender}
        onGenderChange={onGenderChange}
        onSubmit={onSubmit}
        disabled={loading}
      />

      <div className="flex flex-col items-center gap-3">
        <GenderSelector value={gender} onChange={onGenderChange} />
        {loading && loadingLabel && (
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground animate-pulse">
            {loadingLabel}
          </p>
        )}
      </div>
    </motion.div>
  )
}
