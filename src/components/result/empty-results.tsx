"use client"

import {motion} from "framer-motion"

const SUGGESTION_CHIPS = [
  "Similar style, different color",
  "Wider price range",
]

interface EmptyResultsProps {
  onSuggestionClick?: (text: string) => void
}

export function EmptyResults({ onSuggestionClick }: EmptyResultsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-6 text-center"
    >
      <div className="w-10 h-10 mx-auto mb-3 bg-card border border-border rounded-full flex items-center justify-center">
        <span className="text-base text-on-surface-variant">∅</span>
      </div>
      <p className="text-xs font-semibold text-foreground mb-1">No exact matches yet</p>
      <p className="text-[10px] text-muted-foreground mb-4 leading-relaxed">
        We couldn&apos;t find products matching this item.<br />
        Try refining your search below.
      </p>
      {onSuggestionClick && (
        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => onSuggestionClick(chip)}
              className="px-3 py-1.5 bg-card border border-border rounded-full text-[10px] font-mono text-muted-foreground hover:border-outline/50 hover:text-foreground transition-colors"
            >
              &ldquo;{chip}&rdquo;
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
