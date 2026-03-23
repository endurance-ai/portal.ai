"use client"

import { motion } from "framer-motion"
import Image from "next/image"

interface AnalyzingViewProps {
  imageUrl: string
}

export function AnalyzingView({ imageUrl }: AnalyzingViewProps) {
  return (
    <div className="w-full max-w-7xl mx-auto min-h-[80vh]">
      {/* Main Analysis Section */}
      <div className="flex flex-col lg:flex-row gap-12 items-start">
        {/* Left: Image Scanning (60%) */}
        <motion.div
          className="w-full lg:w-[60%] relative group"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="rounded-xl overflow-hidden shadow-2xl bg-moodfit-surface-container-low aspect-[4/5] relative">
            <Image
              src={imageUrl}
              alt="Uploaded outfit"
              fill
              className="object-cover grayscale-[20%] transition-all duration-700"
            />

            {/* Scanning overlay */}
            <div className="absolute inset-0 bg-moodfit-primary/5 pointer-events-none" />

            {/* Scanning line */}
            <motion.div
              className="absolute left-0 w-full h-1 bg-gradient-to-r from-transparent via-moodfit-primary to-transparent blur-sm opacity-80"
              initial={{ top: "-5%" }}
              animate={{ top: ["- 5%", "105%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />

            {/* Pulsing data points */}
            <motion.div
              className="absolute top-1/4 left-1/3 w-2 h-2 rounded-full bg-moodfit-primary-container shadow-[0_0_15px_rgba(110,59,216,0.8)]"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="absolute top-1/2 left-2/3 w-2 h-2 rounded-full bg-moodfit-tertiary-container shadow-[0_0_15px_rgba(165,49,115,0.8)]"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
            />
            <motion.div
              className="absolute bottom-1/3 left-1/2 w-2 h-2 rounded-full bg-moodfit-secondary-container shadow-[0_0_15px_rgba(134,84,23,0.8)]"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 1 }}
            />

            {/* Glass analysis card */}
            <motion.div
              className="absolute bottom-8 left-8 right-8 p-6 rounded-xl bg-white/70 backdrop-blur-xl border border-white/20 shadow-xl flex items-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="w-12 h-12 rounded-full bg-moodfit-primary flex items-center justify-center shrink-0">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-moodfit-on-surface font-bold text-lg">
                  AI Engine Active
                </p>
                <p className="text-moodfit-on-surface-variant text-sm">
                  Identifying silhouettes & texture maps...
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Right: Vibe Text & Loading (40%) */}
        <motion.div
          className="w-full lg:w-[40%] pt-0 lg:pt-12"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="space-y-6">
            <h1 className="text-4xl lg:text-6xl font-black tracking-tight text-moodfit-on-surface leading-[1.1]">
              Reading the{" "}
              <motion.span
                className="text-transparent bg-clip-text bg-gradient-to-r from-moodfit-primary to-moodfit-tertiary"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                vibe...
              </motion.span>
            </h1>
            <p className="text-xl text-moodfit-on-surface-variant leading-relaxed font-medium">
              Our neural network is decomposing your aesthetic layers to provide
              an editorial mood report.
            </p>

            {/* Loading dots */}
            <div className="flex items-center gap-3 pt-4">
              {[0, 0.2, 0.4].map((delay, i) => (
                <motion.div
                  key={i}
                  className="w-3 h-3 rounded-full bg-moodfit-primary"
                  style={{ opacity: 1 - i * 0.3 }}
                  animate={{ y: [0, -8, 0] }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay,
                    repeatDelay: 0.6,
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Skeleton cards */}
      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Palette skeleton */}
        <motion.div
          className="bg-moodfit-surface-container-low rounded-xl p-8 space-y-6 h-64 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="w-24 h-4 bg-moodfit-surface-container rounded-full" />
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-full h-24 bg-moodfit-surface-container rounded-lg"
              />
            ))}
          </div>
          <div className="space-y-3">
            <div className="w-full h-3 bg-moodfit-surface-container rounded-full" />
            <div className="w-2/3 h-3 bg-moodfit-surface-container rounded-full" />
          </div>
          <ShimmerOverlay />
        </motion.div>

        {/* Style DNA skeleton */}
        <motion.div
          className="bg-moodfit-surface-container-low rounded-xl p-8 space-y-6 h-64 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <div className="w-32 h-4 bg-moodfit-surface-container rounded-full" />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-1/2 h-4 bg-moodfit-surface-container rounded-full" />
              <div className="w-12 h-4 bg-moodfit-primary/20 rounded-full" />
            </div>
            <div className="w-full h-2 bg-moodfit-surface-container rounded-full overflow-hidden">
              <div className="w-3/4 h-full bg-moodfit-primary/40" />
            </div>
          </div>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="w-1/2 h-4 bg-moodfit-surface-container rounded-full" />
              <div className="w-12 h-4 bg-moodfit-tertiary/20 rounded-full" />
            </div>
            <div className="w-full h-2 bg-moodfit-surface-container rounded-full overflow-hidden">
              <div className="w-1/2 h-full bg-moodfit-tertiary/40" />
            </div>
          </div>
          <ShimmerOverlay />
        </motion.div>

        {/* Mood skeleton */}
        <motion.div
          className="bg-moodfit-surface-container-low rounded-xl p-8 space-y-6 h-64 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <div className="w-20 h-4 bg-moodfit-surface-container rounded-full" />
          <div className="flex flex-wrap gap-2">
            {[20, 28, 16, 24].map((w, i) => (
              <div
                key={i}
                className="h-8 bg-moodfit-surface-container rounded-full"
                style={{ width: `${w * 4}px` }}
              />
            ))}
          </div>
          <div className="pt-4">
            <div className="w-full h-12 bg-moodfit-surface-container/50 rounded-lg" />
          </div>
          <ShimmerOverlay />
        </motion.div>
      </div>
    </div>
  )
}

function ShimmerOverlay() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
        backgroundSize: "200% 100%",
      }}
      animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
    />
  )
}
