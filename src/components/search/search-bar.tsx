"use client"

import {useCallback, useEffect, useRef, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {ArrowUp, Camera, ImagePlus, X} from "lucide-react"
import {cn} from "@/lib/utils"
import {type Gender, GenderSelector} from "@/components/upload/gender-selector"

const GHOST_PROMPTS = [
  "black minimal coat under 200K for office...",
  "summer vacation dress, blue tone, relaxed fit...",
  "oversized knit 50-100K casual daily wear...",
  "leather chelsea boots street style under 300K...",
  "linen shirt resort vacation clean look...",
]

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
  const [ghostIdx, setGhostIdx] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (prompt) return
    const timer = setInterval(() => setGhostIdx((i) => (i + 1) % GHOST_PROMPTS.length), 3000)
    return () => clearInterval(timer)
  }, [prompt])

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
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(compressed)
      })
    } catch {
      setImage(file)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
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
          "border bg-cream transition-colors duration-200",
          isDragging
            ? "border-ink bg-line-mute"
            : "border-line focus-within:border-ink-soft"
        )}
      >
        {/* Image area: drop zone when empty, preview when attached */}
        <AnimatePresence mode="wait">
          {previewUrl ? (
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
                    className="h-16 w-16 object-cover border border-line"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center bg-foreground text-background transition-opacity hover:opacity-80"
                    aria-label="Remove image"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="dropzone"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "w-full px-3 pt-3 pb-1 flex items-center gap-3 text-left transition-colors group/drop",
                "cursor-pointer",
              )}
            >
              <div className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center border border-dashed transition-colors duration-150",
                isDragging
                  ? "border-ink bg-line-mute"
                  : "border-line group-hover/drop:border-ink-soft group-hover/drop:bg-line-mute",
              )}>
                <ImagePlus className={cn(
                  "size-5 transition-colors duration-150",
                  isDragging
                    ? "text-ink"
                    : "text-ink-quiet group-hover/drop:text-ink-soft",
                )} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground group-hover/drop:text-foreground transition-colors">
                  Add a photo for better matches
                </p>
                <p className="text-[11px] text-ink-quiet font-medium">
                  Drop or click — JPG, PNG, HEIC, WEBP
                </p>
              </div>
            </motion.button>
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
            placeholder={GHOST_PROMPTS[ghostIdx]}
            maxLength={500}
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
            {previewUrl && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className={cn(
                  "flex h-8 items-center gap-1.5 px-2 transition-colors duration-150",
                  "text-muted-foreground hover:text-foreground hover:bg-line-mute",
                  "disabled:cursor-not-allowed disabled:opacity-40"
                )}
                aria-label="Change image"
              >
                <Camera className="size-3.5" />
                <span className="text-[11px] font-medium">Change</span>
              </button>
            )}

            <GenderSelector value={gender} onChange={onGenderChange} />
          </div>

          {/* Right: submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "flex h-8 w-8 items-center justify-center transition-colors duration-150",
              canSubmit
                ? "bg-foreground text-background hover:opacity-80"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            aria-label="Search for this style"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/webp"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        aria-label="Upload outfit image (JPEG, PNG, WebP, HEIC, max 10MB)"
        onChange={handleFileInputChange}
      />
    </motion.div>
  )
}
