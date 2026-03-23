"use client"

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { UploadZone } from "@/components/upload/upload-zone"
import { MoodChips } from "@/components/upload/mood-chips"
import { AnalyzingView } from "@/components/analysis/analyzing-view"
import { LookBreakdown } from "@/components/result/look-breakdown"
import {
  MOCK_MOOD_TAGS,
  MOCK_PALETTE,
  MOCK_ITEMS,
  MOCK_OUTFIT_IMAGE,
} from "@/lib/mock-data"

type AppState = "upload" | "analyzing" | "result"

export default function Home() {
  const [state, setState] = useState<AppState>("upload")
  const [imageUrl, setImageUrl] = useState<string>("")

  const handleFileSelect = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setState("analyzing")

    // Simulate AI analysis (replace with real API call later)
    setTimeout(() => {
      setState("result")
    }, 3000)
  }, [])

  const handleTryAnother = useCallback(() => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl("")
    setState("upload")
  }, [imageUrl])

  return (
    <>
      <Header />

      <main className="flex-grow flex flex-col items-center justify-center px-6 pt-24 pb-12 relative overflow-hidden">
        {/* Background gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-moodfit-primary-container/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-moodfit-secondary-container/20 rounded-full blur-[120px] pointer-events-none" />

        <AnimatePresence mode="wait">
          {state === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl text-center space-y-12 z-10"
            >
              {/* Hero text */}
              <motion.div
                className="space-y-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h1 className="text-4xl md:text-6xl font-black text-moodfit-on-surface tracking-[-0.02em] leading-tight">
                  Drop your fit.
                  <br />
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-moodfit-primary to-moodfit-primary-dim">
                    We&apos;ll read the vibe.
                  </span>
                </h1>
                <p className="text-moodfit-on-surface-variant text-lg md:text-xl max-w-md mx-auto font-medium leading-relaxed">
                  Upload one outfit photo and our AI extracts the mood, palette,
                  and style DNA.
                </p>
              </motion.div>

              <UploadZone onFileSelect={handleFileSelect} />
              <MoodChips />
            </motion.div>
          )}

          {state === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="w-full z-10"
            >
              <AnalyzingView imageUrl={imageUrl} />
            </motion.div>
          )}

          {state === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full z-10 pt-4"
            >
              <LookBreakdown
                imageUrl={imageUrl || MOCK_OUTFIT_IMAGE}
                moodTags={MOCK_MOOD_TAGS}
                palette={MOCK_PALETTE}
                items={MOCK_ITEMS}
                onTryAnother={handleTryAnother}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </>
  )
}
