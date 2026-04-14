"use client"

import {useEffect, useRef, useState} from "react"
import {cn} from "@/lib/utils"

interface CustomSelectProps {
  value: string
  options: string[]
  onChange: (value: string) => void
  displayFn?: (value: string) => string
}

export function CustomSelect({value, options, onChange, displayFn}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const display = displayFn ?? ((v: string) => v)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  return (
    <div ref={ref} className="relative" data-no-kb-nav>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border-b border-ink pb-2 text-[14px] font-medium text-ink tracking-[-0.01em] cursor-pointer text-left"
      >
        <span>{display(value)}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          className={cn("transition-transform flex-shrink-0 ml-2", open && "rotate-180")}
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-cream border border-ink max-h-[240px] overflow-y-auto">
          {options.map((opt) => {
            const isActive = opt === value
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors",
                  isActive
                    ? "bg-ink text-cream"
                    : "text-ink hover:bg-ink/5",
                )}
              >
                {display(opt)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
