"use client"

import {useCallback, useState} from "react"
import {motion} from "framer-motion"
import {ArrowUp} from "lucide-react"
import {cn} from "@/lib/utils"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const TARGET_MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.8

async function compressImage(file: File): Promise<File> {
  // Skip compression for small files
  if (file.size < 500 * 1024) return file // < 500KB, skip

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      let { width, height } = img

      // Scale down if larger than target
      if (width > TARGET_MAX_DIMENSION || height > TARGET_MAX_DIMENSION) {
        const ratio = Math.min(TARGET_MAX_DIMENSION / width, TARGET_MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
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
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = URL.createObjectURL(file)
  })
}

interface UploadZoneProps {
  onFileSelect: (file: File) => void
}

export function UploadZone({ onFileSelect }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return
      if (file.size > MAX_FILE_SIZE) {
        alert("Image must be under 10MB")
        return
      }
      try {
        const compressed = await compressImage(file)
        onFileSelect(compressed)
      } catch {
        onFileSelect(file) // fallback to original
      }
    },
    [onFileSelect]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <motion.label
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="relative group cursor-pointer block"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/heic,image/webp"
        className="sr-only"
        onChange={onInputChange}
      />

      <div
        className={cn(
          "rounded-xl p-12 md:p-16 flex flex-col items-center justify-center transition-all duration-300",
          "bg-card border-[1.5px] border-dashed border-border",
          "group-hover:border-primary/30 group-hover:bg-surface-dim",
          isDragging && "border-primary/50 bg-surface-dim"
        )}
      >
        <div className="relative flex flex-col items-center space-y-5">
          <motion.div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300",
              "bg-surface-dim border border-border",
              "group-hover:border-primary/30"
            )}
            animate={isDragging ? { scale: 1.1 } : {}}
          >
            <ArrowUp className="size-6 text-primary" />
          </motion.div>
          <div className="space-y-2 text-center">
            <p className="text-base font-semibold text-foreground">
              Drag image here or click to browse
            </p>
            <p className="text-xs text-on-surface-variant font-mono tracking-wide">
              JPG, PNG, HEIC, WEBP — MAX 10MB
            </p>
          </div>
        </div>
      </div>
    </motion.label>
  )
}
