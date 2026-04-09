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
  const inputRef = useRef<HTMLTextAreaElement>(null)
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
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      className="sticky bottom-0 z-30 pt-8"
      style={{ background: "linear-gradient(transparent, hsl(var(--background)) 30%)" }}
    >
      {/* File preview */}
      {previewUrl && (
        <div className="flex justify-center mb-2">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Attached" className="h-10 w-10 rounded-lg object-cover border border-border" />
            <button
              onClick={removeFile}
              className="absolute -top-2 -right-2 w-6 h-6 bg-foreground text-background rounded-full flex items-center justify-center"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4">
        <div className={cn(
          "bg-card border border-border rounded-xl flex items-center gap-2 px-4 py-1.5",
          isMaxed && "opacity-60"
        )}>
          {/* Session counter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isMaxed ? "bg-muted-foreground" : "bg-turquoise"
            )} />
            <span className={cn(
              "text-xs font-mono font-semibold",
              isMaxed ? "text-muted-foreground" : "text-turquoise"
            )}>
              {currentSequence}/{MAX_REFINES}
            </span>
          </div>

          <div className="w-px h-4 bg-border shrink-0" />

          {/* Input */}
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isMaxed}
            placeholder={isMaxed ? "Start a fresh analysis for new ideas" : REFINE_PLACEHOLDERS[placeholderIdx]}
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-on-surface-variant outline-none resize-none min-h-[32px] max-h-[80px] py-1"
          />

          {/* Attach image */}
          {!isMaxed && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 bg-border/50 rounded-lg flex items-center justify-center shrink-0 hover:bg-border transition-colors"
            >
              <Paperclip className="size-3.5 text-muted-foreground" />
            </button>
          )}

          {/* Submit / Reset */}
          {isMaxed ? (
            <button
              onClick={onReset}
              className="w-8 h-8 bg-primary text-background rounded-lg flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
            >
              <RotateCcw className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || disabled}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                text.trim() && !disabled
                  ? "bg-primary text-background hover:opacity-80"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>
          )}
        </div>

        {/* Hint */}
        <p className="text-xs font-mono text-on-surface-variant text-center mt-1.5 mb-2">
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
