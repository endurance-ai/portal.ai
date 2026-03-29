"use client"

import {useCallback, useState} from "react"
import {motion} from "framer-motion"
import {ArrowUp} from "lucide-react"
import {cn} from "@/lib/utils"

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
