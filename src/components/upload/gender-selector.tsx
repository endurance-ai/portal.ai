"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"

export type Gender = "male" | "female"

interface GenderSelectorProps {
  value: Gender
  onChange: (gender: Gender) => void
}

const OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "Womens" },
  { value: "male", label: "Mens" },
]

export function GenderSelector({ value, onChange }: GenderSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="flex items-center gap-0 border border-line p-[2px] w-fit"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative px-4 py-1 text-[13px] font-medium transition-colors duration-200 select-none tracking-[-0.01em]",
            value === opt.value
              ? "text-cream"
              : "text-ink-soft hover:text-ink"
          )}
        >
          {value === opt.value && (
            <motion.div
              layoutId="gender-pill"
              className="absolute inset-0 bg-ink"
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            />
          )}
          <span className="relative z-10">{opt.label}</span>
        </button>
      ))}
    </motion.div>
  )
}
