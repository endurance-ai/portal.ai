"use client"

import {useCallback, useEffect, useRef, useState} from "react"
import {motion} from "framer-motion"
import {ArrowUp, Paperclip, RotateCcw, X} from "lucide-react"
import {cn} from "@/lib/utils"

const REFINE_PLACEHOLDERS = [
  "More casual vibes...",
  "Lower price range...",
  "Show me different colors...",
  "Slightly more oversized fit...",
  "Something for spring...",
]

const MAX_REFINES = 5

interface StickyRefineBarProps {
  currentSequence: number
  onSubmit: (data: { prompt: string; file?: File }) => void
  onReset: () => void
  disabled?: boolean
  initialText?: string
}

export function StickyRefineBar({
  currentSequence,
  onSubmit,
  onReset,
  disabled,
  initialText,
}: StickyRefineBarProps) {
  const [text, setText] = useState(initialText || "")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isMaxed = currentSequence >= MAX_REFINES

  // Sync initialText from parent (suggestion chips) — uses event-like pattern
  const prevInitialText = useRef(initialText)
  useEffect(() => {
    if (initialText && initialText !== prevInitialText.current) {
      prevInitialText.current = initialText
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(initialText)
      inputRef.current?.focus()
    }
  }, [initialText])

  useEffect(() => {
    if (text) return
    const timer = setInterval(() => setPlaceholderIdx((i) => (i + 1) % REFINE_PLACEHOLDERS.length), 3000)
    return () => clearInterval(timer)
  }, [text])

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return
    if (f.size > 10 * 1024 * 1024) return
    setFile(f)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }, [])

  const removeFile = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [previewUrl])

  const handleSubmit = useCallback(() => {
    if (!text.trim() || disabled || isMaxed) return
    onSubmit({ prompt: text.trim(), file: file ?? undefined })
    setText("")
    removeFile()
  }, [text, disabled, isMaxed, onSubmit, file, removeFile])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="fixed bottom-6 left-0 right-0 z-30"
    >
      {/* File preview */}
      {previewUrl && (
        <div className="flex justify-center mb-2">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Attached" className="h-10 w-10 rounded-lg object-cover border border-border" />
            <button
              onClick={removeFile}
              aria-label="Remove attached image"
              className="absolute -top-2 -right-2 w-6 h-6 bg-foreground text-background rounded-full flex items-center justify-center"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4">
        <div className={cn(
          "bg-primary/95 backdrop-blur-sm border border-primary/20 rounded-xl flex items-center gap-3 px-5 py-2.5 shadow-lg shadow-black/30",
          isMaxed && "opacity-60"
        )}>
          {/* Session counter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full",
              isMaxed ? "bg-background/40" : "bg-turquoise"
            )} />
            <span className={cn(
              "text-xs font-mono font-bold",
              isMaxed ? "text-background/50" : "text-background/70"
            )}>
              {currentSequence}/{MAX_REFINES}
            </span>
          </div>

          <div className="w-px h-5 bg-background/20 shrink-0" />

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isMaxed}
            aria-label="Refine your look"
            placeholder={isMaxed ? "Start fresh for new ideas" : REFINE_PLACEHOLDERS[placeholderIdx]}
            className="flex-1 min-w-0 bg-transparent text-sm text-background placeholder:text-background/40 outline-none h-9 font-medium truncate"
          />

          {/* Attach image */}
          {!isMaxed && (
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach image"
              className="w-9 h-9 bg-background/15 rounded-lg flex items-center justify-center shrink-0 hover:bg-background/25 transition-colors"
            >
              <Paperclip className="size-4 text-background/60" />
            </button>
          )}

          {/* Submit / Reset */}
          {isMaxed ? (
            <button
              onClick={onReset}
              aria-label="Start new analysis"
              className="w-9 h-9 bg-background text-foreground rounded-lg flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
            >
              <RotateCcw className="size-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || disabled}
              aria-label="Submit refinement"
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                text.trim() && !disabled
                  ? "bg-background text-foreground hover:opacity-80"
                  : "bg-background/20 text-background/40 cursor-not-allowed"
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>

        {/* Hint */}
        <p className="text-[10px] font-mono text-muted-foreground text-center mt-2">
          {isMaxed
            ? "Maximum refinements reached — start fresh for new ideas"
            : "Refine your look — previous context preserved"
          }
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/webp"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </motion.div>
  )
}
