"use client"

import {useMemo, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import Image from "next/image"

interface AnalyzingViewProps {
  imageUrl: string
  promptText?: string
  progress: number
  progressLabel: string
}

const PHASE_MESSAGES = [
  {at: 0, text: "Opening portal..."},
  {at: 15, text: "Reading your style..."},
  {at: 35, text: "Deconstructing the look..."},
  {at: 55, text: "Exploring 26,000+ products..."},
  {at: 75, text: "Almost there — curating your picks..."},
  {at: 100, text: "Portal complete"},
]

const PROMPT_PHASE_MESSAGES = [
  {at: 0, text: "Opening portal..."},
  {at: 15, text: "Parsing your keywords..."},
  {at: 35, text: "Building style profile..."},
  {at: 55, text: "Searching product universe..."},
  {at: 75, text: "Curating the best matches..."},
  {at: 100, text: "Portal complete"},
]

// Keywords that float out of the portal as analysis progresses
const FLOAT_KEYWORDS_IMAGE = [
  {at: 20, text: "Silhouette", x: -130, y: -60},
  {at: 30, text: "Texture", x: 120, y: -40},
  {at: 40, text: "Palette", x: -110, y: 50},
  {at: 50, text: "Fit", x: 135, y: 30},
  {at: 60, text: "Style", x: -80, y: -90},
  {at: 70, text: "Season", x: 90, y: 70},
]

const FLOAT_KEYWORDS_PROMPT = [
  {at: 20, text: "Keywords", x: -130, y: -60},
  {at: 30, text: "Category", x: 120, y: -40},
  {at: 40, text: "Color", x: -110, y: 50},
  {at: 50, text: "Fabric", x: 135, y: 30},
  {at: 60, text: "Price", x: -80, y: -90},
  {at: 70, text: "Match", x: 90, y: 70},
]

export function AnalyzingView({imageUrl, promptText, progress, progressLabel}: AnalyzingViewProps) {
  const [particles] = useState(() =>
    Array.from({length: 12}, (_, i) => ({
      id: i,
      angle: (i * 30) + Math.random() * 15,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 1.5,
      size: 2 + Math.random() * 2,
    }))
  )
  const hasImage = !!imageUrl
  const phases = hasImage ? PHASE_MESSAGES : PROMPT_PHASE_MESSAGES
  const floatKeywords = hasImage ? FLOAT_KEYWORDS_IMAGE : FLOAT_KEYWORDS_PROMPT

  const currentPhase = useMemo(
    () => [...phases].reverse().find((p) => progress >= p.at)?.text ?? phases[0].text,
    [phases, progress],
  )

  const visibleKeywords = useMemo(
    () => floatKeywords.filter((k) => progress >= k.at),
    [floatKeywords, progress],
  )

  // Progress ring calculation (circumference of r=123 circle)
  const circumference = 2 * Math.PI * 123
  const dashOffset = circumference - (circumference * Math.min(progress, 100)) / 100

  return (
    <div className="w-full max-w-3xl mx-auto min-h-[80vh] flex items-center justify-center relative">
      {/* Star streak particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => {
          const rad = (p.angle * Math.PI) / 180
          return (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                left: "50%",
                top: "45%",
                background: p.id % 3 === 0 ? "rgba(85,180,168,0.7)" : "rgba(255,255,255,0.6)",
              }}
              animate={{
                x: [0, Math.cos(rad) * 400],
                y: [0, Math.sin(rad) * 400],
                opacity: [0, 0.8, 0],
                scale: [0.5, 1.5],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          )
        })}
      </div>

      {/* Radial glow background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{background: "radial-gradient(circle at 50% 45%, rgba(85,180,168,0.06) 0%, transparent 55%)"}}
      />

      {/* Center content */}
      <div className="relative flex flex-col items-center z-10">
        {/* Portal */}
        <div className="relative" style={{width: 300, height: 300}}>
          {/* Outer dashed ring — rotates */}
          <motion.svg
            viewBox="0 0 300 300"
            className="absolute inset-0"
            animate={{rotate: 360}}
            transition={{duration: 10, repeat: Infinity, ease: "linear"}}
          >
            <circle
              cx="150" cy="150" r="144"
              fill="none"
              stroke="rgba(85,180,168,0.12)"
              strokeWidth="1"
              strokeDasharray="5 10"
            />
          </motion.svg>

          {/* Progress ring */}
          <svg viewBox="0 0 300 300" className="absolute inset-0" style={{transform: "rotate(-90deg)"}}>
            <circle
              cx="150" cy="150" r="123"
              fill="none"
              stroke="rgba(39,39,42,0.4)"
              strokeWidth="2"
            />
            <motion.circle
              cx="150" cy="150" r="123"
              fill="none"
              stroke="rgba(85,180,168,0.7)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{strokeDashoffset: circumference}}
              animate={{strokeDashoffset: dashOffset}}
              transition={{duration: 0.6, ease: "easeOut"}}
            />
          </svg>

          {/* Glow pulse */}
          <motion.div
            className="absolute rounded-full"
            style={{
              left: "50%", top: "50%",
              width: 255, height: 255,
              transform: "translate(-50%, -50%)",
            }}
            animate={{
              boxShadow: [
                "0 0 30px rgba(85,180,168,0.15), inset 0 0 30px rgba(85,180,168,0.08)",
                "0 0 50px rgba(85,180,168,0.3), inset 0 0 40px rgba(85,180,168,0.12)",
                "0 0 30px rgba(85,180,168,0.15), inset 0 0 30px rgba(85,180,168,0.08)",
              ],
            }}
            transition={{duration: 3, repeat: Infinity, ease: "easeInOut"}}
          />

          {/* Center image / text */}
          <div
            className="absolute overflow-hidden border-2 border-turquoise/30 rounded-full"
            style={{
              left: "50%", top: "50%",
              width: 234, height: 234,
              transform: "translate(-50%, -50%)",
            }}
          >
            {hasImage ? (
              <>
                <Image
                  src={imageUrl}
                  alt="Your look"
                  fill
                  className="object-cover"
                />
                {/* Prompt overlay on image */}
                {promptText && (
                  <div className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-6" style={{background: "linear-gradient(transparent, rgba(9,9,11,0.85))"}}>
                    <p className="text-[9px] font-mono text-foreground/90 text-center leading-snug line-clamp-2">
                      &ldquo;{promptText}&rdquo;
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full bg-surface-dim flex items-center justify-center p-4">
                <p className="text-[11px] font-mono text-foreground/80 text-center leading-relaxed line-clamp-4">
                  &ldquo;{promptText || "..."}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Floating keywords */}
        <div className="absolute pointer-events-none" style={{width: 500, height: 500, left: "50%", top: "50%", transform: "translate(-50%, -50%)"}}>
          <AnimatePresence>
            {visibleKeywords.map((kw) => (
              <motion.span
                key={kw.text}
                className="absolute px-2.5 py-1 bg-turquoise/8 border border-turquoise/20 rounded-lg text-[10px] font-mono font-semibold text-turquoise whitespace-nowrap"
                style={{left: "50%", top: "50%"}}
                initial={{opacity: 0, x: 0, y: 0, scale: 0.5}}
                animate={{opacity: [0, 1, 0.6], x: kw.x, y: kw.y, scale: 1}}
                transition={{duration: 1.2, ease: "easeOut"}}
              >
                {kw.text}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Phase text */}
        <div className="mt-10 text-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentPhase}
              className="text-sm font-mono font-semibold text-foreground tracking-wide"
              initial={{opacity: 0, y: 8}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -8}}
              transition={{duration: 0.3}}
            >
              {currentPhase}
            </motion.p>
          </AnimatePresence>
          <p className="text-[10px] font-mono text-muted-foreground mt-1.5">
            {progressLabel || "Preparing analysis"}
          </p>
        </div>

        {/* Mini progress bar */}
        <div className="mt-6 w-48">
          <div className="h-[3px] bg-border rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{background: "linear-gradient(90deg, rgba(85,180,168,0.5), rgba(85,180,168,1))"}}
              initial={{width: "0%"}}
              animate={{width: `${progress}%`}}
              transition={{duration: 0.5, ease: "easeOut"}}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[9px] font-mono text-on-surface-variant">PORTAL.AI</span>
            <span className="text-[9px] font-mono text-turquoise tabular-nums">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
