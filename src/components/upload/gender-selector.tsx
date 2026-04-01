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
      className="flex items-center justify-center gap-0 rounded-full bg-muted/50 border border-border p-[3px] w-fit mx-auto"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative px-5 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 select-none",
            value === opt.value
              ? "text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {value === opt.value && (
            <motion.div
              layoutId="gender-pill"
              className="absolute inset-0 bg-foreground rounded-full"
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            />
          )}
          <span className="relative z-10">{opt.label}</span>
        </button>
      ))}
    </motion.div>
  )
}
