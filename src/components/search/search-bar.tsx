"use client"

import { useCallback, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp, Camera, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { type Gender, GenderSelector } from "@/components/upload/gender-selector"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const TARGET_MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.8

async function compressImage(file: File): Promise<File> {
  if (file.size < 500 * 1024) return file

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img

      if (width > TARGET_MAX_DIMENSION || height > TARGET_MAX_DIMENSION) {
        const ratio = Math.min(TARGET_MAX_DIMENSION / width, TARGET_MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      } else if (file.type === "image/jpeg") {
        resolve(file); return
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) { resolve(file); return }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name, { type: "image/jpeg" }))
        },
        "image/jpeg",
        JPEG_QUALITY
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to load image"))
    }
    img.src = objectUrl
  })
}

export interface SearchBarProps {
  gender: Gender
  onGenderChange: (gender: Gender) => void
  onSubmit: (data: { prompt?: string; file?: File }) => void
  disabled?: boolean
}

export function SearchBar({ gender, onGenderChange, onSubmit, disabled }: SearchBarProps) {
  const [prompt, setPrompt] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = !disabled && (prompt.trim().length > 0 || image !== null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return
    if (file.size > MAX_FILE_SIZE) {
      alert("Image must be under 10MB")
      return
    }
    try {
      const compressed = await compressImage(file)
      setImage(compressed)
      setPreviewUrl(URL.createObjectURL(compressed))
    } catch {
      setImage(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }, [])

  const handleRemoveImage = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImage(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [previewUrl])

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    onSubmit({
      prompt: prompt.trim() || undefined,
      file: image ?? undefined,
    })
  }, [canSubmit, onSubmit, prompt, image])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the container entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full space-y-2"
    >
      {/* Main container */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "rounded-2xl border bg-card transition-colors duration-200",
          isDragging
            ? "border-primary/50 bg-surface-dim"
            : "border-border focus-within:border-primary/30"
        )}
      >
        {/* Image preview */}
        <AnimatePresence>
          {previewUrl && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pt-3">
                <div className="relative w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Attached image"
                    className="h-16 w-16 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-opacity hover:opacity-80"
                    aria-label="Remove image"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textarea */}
        <div className="px-3 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="What style are you looking for?"
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent text-foreground placeholder:text-muted-foreground",
              "text-sm leading-relaxed outline-none",
              "min-h-[36px] max-h-[160px] overflow-y-auto",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            style={{ height: "36px" }}
          />
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-2 pb-2">
          {/* Left: camera + gender */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150",
                "text-muted-foreground hover:text-foreground hover:bg-surface-dim",
                "disabled:cursor-not-allowed disabled:opacity-40"
              )}
              aria-label="Attach image"
            >
              <Camera className="size-4" />
            </button>

            <GenderSelector value={gender} onChange={onGenderChange} />
          </div>

          {/* Right: submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-150",
              canSubmit
                ? "bg-foreground text-background hover:opacity-80"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            aria-label="Submit"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-on-surface-variant font-mono text-center tracking-wide">
        Attach an image for more accurate results
      </p>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/webp"
        className="sr-only"
        onChange={handleFileInputChange}
      />
    </motion.div>
  )
}
