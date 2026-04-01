"use client"

import {useMemo} from "react"
import {motion} from "framer-motion"
import Image from "next/image"

interface AnalyzingViewProps {
  imageUrl: string
  progress: number
  progressLabel: string
}

const READOUT_LINES = [
  { at: 0, text: "INITIALIZING SCAN..." },
  { at: 10, text: "UPLOADING IMAGE DATA..." },
  { at: 20, text: "DETECTING SILHOUETTE..." },
  { at: 35, text: "MAPPING FABRIC TEXTURE..." },
  { at: 55, text: "EXTRACTING COLOR PALETTE..." },
  { at: 65, text: "SEARCHING PRODUCT DATABASE..." },
  { at: 80, text: "MATCHING CROSS-PLATFORM ITEMS..." },
  { at: 90, text: "COMPILING RESULTS..." },
  { at: 100, text: "ANALYSIS COMPLETE" },
]

export function AnalyzingView({ imageUrl, progress, progressLabel }: AnalyzingViewProps) {
  const visibleLines = useMemo(
    () => READOUT_LINES.filter((line) => progress >= line.at),
    [progress]
  )

  return (
    <div className="w-full max-w-7xl mx-auto min-h-[80vh]">
      <div className="flex flex-col-reverse lg:flex-row gap-8 lg:gap-12 items-start">
        {/* Left: Image with scan — on mobile this renders BELOW the readout */}
        <motion.div
          className="w-full lg:w-[55%] relative"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="rounded-lg overflow-hidden bg-card border border-border corner-brackets aspect-[4/3] lg:aspect-[4/5] relative">
            <Image
              src={imageUrl}
              alt="Uploaded outfit"
              fill
              className="object-cover"
            />

            {/* Scan overlay */}
            <div className="absolute inset-0 bg-primary/5 pointer-events-none" />

            {/* Scanning line — CSS animation for GPU-accelerated compositing */}
            <div className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 animate-scan-line" />

            {/* System label */}
            <motion.div
              className="absolute bottom-4 left-4 right-4 px-4 py-3 bg-background/80 backdrop-blur-sm border border-border rounded-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-[11px] font-mono font-bold text-primary tracking-widest">
                  SYS.ANALYSIS // ACTIVE
                </span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Right: Technical Readout + Progress */}
        <motion.div
          className="w-full lg:w-[45%] pt-0 lg:pt-8"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-[1.1]">
                Reading the{" "}
                <span className="text-primary">
                  vibe...
                </span>
              </h1>
              <p className="text-on-surface-variant text-sm mt-3 font-mono tracking-wide uppercase">
                {progressLabel || "Preparing analysis"}
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono font-bold text-on-surface-variant tracking-widest uppercase">
                  Progress
                </span>
                <span className="text-sm font-mono font-bold text-primary tabular-nums">
                  {progress}%
                </span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Terminal readout */}
            <div className="bg-card border border-border rounded-lg p-4 font-mono text-xs space-y-1.5 max-h-[240px] overflow-y-auto">
              {visibleLines.map((line, i) => {
                const isLatest = i === visibleLines.length - 1
                return (
                  <motion.div
                    key={line.at}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-primary-dim">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={
                        isLatest && progress < 100
                          ? "text-primary"
                          : progress >= 100
                            ? "text-primary"
                            : "text-outline"
                      }
                    >
                      {line.text}
                    </span>
                    {isLatest && progress < 100 && (
                      <motion.span
                        className="inline-block w-1.5 h-3.5 bg-primary"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                      />
                    )}
                    {!isLatest && (
                      <span className="text-primary/40 ml-auto">OK</span>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
