"use client"

import Image from "next/image"
import {motion} from "framer-motion"

interface AnalyzingViewProps {
  imageUrl: string
  promptText: string
  progress: number          // 0–100
  progressLabel: string
}

/**
 * A2 — 에디토리얼 로딩 화면. DESIGN.md §9 A2.
 * 큰 숫자 percent + 얇은 progress line. 파티클/스캔라인 없음.
 */
export function AnalyzingView({imageUrl, promptText, progress, progressLabel}: AnalyzingViewProps) {
  return (
    <motion.div
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      transition={{duration: 0.4}}
      className="w-full max-w-[640px] mx-auto pt-16 pb-8 flex flex-col items-center text-center gap-4"
    >
      {/* 유저 이미지(있으면) 작게 표시 */}
      {imageUrl && (
        <div className="relative w-[120px] h-[150px] mb-2">
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      {/* 프롬프트 텍스트 (있으면) */}
      {promptText && (
        <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] max-w-[320px] line-clamp-2">
          &ldquo;{promptText}&rdquo;
        </p>
      )}

      {/* Percent — 크게 */}
      <div className="mt-2 flex items-baseline justify-center gap-1">
        <span className="text-[96px] font-light text-ink leading-none tracking-[-0.06em] tabular-nums">
          {progress}
        </span>
        <span className="text-[28px] font-light text-ink-quiet tracking-[-0.02em]">
          %
        </span>
      </div>

      {/* 라벨 */}
      <p className="text-[13px] font-medium text-ink-muted tracking-[-0.01em] max-w-[360px]">
        {progressLabel || "Reading the look — fabric, cut, proportion."}
      </p>

      {/* Progress line */}
      <div className="w-full max-w-[320px] h-px bg-line-mute mt-6 relative">
        <motion.div
          className="absolute left-0 top-0 h-full bg-ink"
          initial={{width: "0%"}}
          animate={{width: `${progress}%`}}
          transition={{duration: 0.4, ease: "easeOut"}}
        />
      </div>
    </motion.div>
  )
}
