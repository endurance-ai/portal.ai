"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {type AgentStep} from "./types"

const STEPS: { id: AgentStep; label: string }[] = [
  { id: "input", label: "Reference" },
  { id: "attributes", label: "Lock" },
  { id: "refine", label: "Refine" },
  { id: "results", label: "Results" },
]

interface AgentProgressProps {
  current: AgentStep
  onStepClick?: (step: AgentStep) => void
}

export function AgentProgress({ current, onStepClick }: AgentProgressProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === current)

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = i === currentIdx
          const isPast = i < currentIdx
          const clickable = isPast && onStepClick

          return (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={clickable ? () => onStepClick(s.id) : undefined}
                disabled={!clickable}
                aria-current={isActive ? "step" : undefined}
                aria-label={
                  isActive
                    ? `Current step: ${s.label}`
                    : isPast
                      ? `Go back to ${s.label}`
                      : `${s.label} — complete previous steps to access`
                }
                className={cn(
                  "flex items-center gap-2 transition-colors",
                  clickable ? "cursor-pointer hover:opacity-80" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-mono font-bold border transition-colors",
                    isActive
                      ? "bg-foreground text-background border-foreground"
                      : isPast
                        ? "bg-foreground/80 text-background border-foreground/80"
                        : "bg-transparent text-muted-foreground border-border",
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-mono uppercase tracking-wider transition-colors",
                    isActive ? "text-foreground" : isPast ? "text-muted-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px bg-border relative overflow-hidden">
                  {isPast && (
                    <motion.div
                      className="absolute inset-0 bg-foreground/60"
                      initial={{ scaleX: 0, originX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.4 }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
