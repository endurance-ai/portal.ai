"use client"

import { useCallback, useState } from "react"
import { motion } from "framer-motion"
import { CloudUpload } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadZoneProps {
  onFileSelect: (file: File) => void
}

export function UploadZone({ onFileSelect }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      if (file.type.startsWith("image/")) {
        onFileSelect(file)
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

      {/* Dashed border overlay */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none transition-opacity rounded-3xl",
          isDragging ? "opacity-40" : "group-hover:opacity-60"
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='24' ry='24' stroke='%23ADB3B6' stroke-width='2' stroke-dasharray='8%2c 12' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e")`,
        }}
      />

      {/* Glass card */}
      <div
        className={cn(
          "rounded-3xl p-12 md:p-20 flex flex-col items-center justify-center transition-all duration-300",
          "bg-white/70 backdrop-blur-xl",
          "group-hover:bg-white/80 group-hover:shadow-[0_20px_40px_rgba(46,51,54,0.04)]",
          isDragging && "bg-white/90 shadow-[0_20px_40px_rgba(46,51,54,0.08)]"
        )}
      >
        {/* Hover glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-gradient-to-tr from-moodfit-primary/20 via-moodfit-secondary/20 to-moodfit-tertiary/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

        <div className="relative flex flex-col items-center space-y-6">
          <motion.div
            className="w-20 h-20 bg-moodfit-surface-container-low rounded-full flex items-center justify-center text-moodfit-primary group-hover:scale-110 transition-transform duration-300"
            animate={isDragging ? { scale: 1.15 } : {}}
          >
            <CloudUpload className="size-9" />
          </motion.div>
          <div className="space-y-2 text-center">
            <p className="text-xl font-bold text-moodfit-on-surface">
              Drag image here or click to browse
            </p>
            <p className="text-sm text-moodfit-on-surface-variant">
              Supports JPG, PNG, HEIC up to 10MB
            </p>
          </div>
        </div>
      </div>
    </motion.label>
  )
}
