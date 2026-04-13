"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {type AgentStep} from "./types"

const STEPS: {id: AgentStep; label: string}[] = [
  {id: "input", label: "Reference"},
  {id: "attributes", label: "Lock"},
  {id: "refine", label: "Refine"},
  {id: "results", label: "Results"},
]

interface AgentProgressProps {
  current: AgentStep
  onStepClick?: (step: AgentStep) => void
}

/**
 * DESIGN.md §4.8 — 4 얇은 bar + "01 / 04" 숫자.
 * 완료 #111, 미완료 #d8d4ca.
 */
export function AgentProgress({current, onStepClick}: AgentProgressProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === current)

  return (
    <div className="w-full max-w-[640px] mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-medium text-ink-quiet tracking-[-0.01em] tabular-nums">
          {String(currentIdx + 1).padStart(2, "0")}
        </span>

        <div className="flex-1 flex items-center gap-[3px]">
          {STEPS.map((s, i) => {
            const isActive = i === currentIdx
            const isPast = i < currentIdx
            const clickable = isPast && onStepClick
            return (
              <button
                key={s.id}
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
                  "relative flex-1 h-[1.5px] transition-colors",
                  isActive || isPast ? "bg-ink" : "bg-line",
                  clickable && "cursor-pointer hover:opacity-80",
                )}
              >
                {isPast && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 bg-ink"
                    initial={{scaleX: 0, originX: 0}}
                    animate={{scaleX: 1}}
                    transition={{duration: 0.3}}
                  />
                )}
              </button>
            )
          })}
        </div>

        <span className="text-[11px] font-medium text-ink-quiet tracking-[-0.01em] tabular-nums">
          {String(STEPS.length).padStart(2, "0")}
        </span>
      </div>

      {/* 현재 step label */}
      <div className="mt-3 text-center">
        <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-ink">
          {STEPS[currentIdx]?.label}
        </span>
      </div>
    </div>
  )
}
