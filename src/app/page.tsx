"use client"

import { useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { UploadZone } from "@/components/upload/upload-zone"
import { MoodChips } from "@/components/upload/mood-chips"
import { AnalyzingView } from "@/components/analysis/analyzing-view"
import { LookBreakdown } from "@/components/result/look-breakdown"
import type { LookItem, Product } from "@/components/result/look-breakdown"

type AppState = "upload" | "analyzing" | "result"

interface AnalysisResult {
  mood: {
    tags: { label: string; score: number }[]
    summary: string
    vibe?: string
    season?: string
    occasion?: string
  }
  palette: { hex: string; label: string }[]
  style?: {
    fit: string
    aesthetic: string
    gender: string
    detectedGender?: string
  }
  items: {
    id: string
    category: string
    name: string
    detail?: string
    fabric?: string
    color?: string
    fit?: string
    searchQuery: string
  }[]
}

interface ProductSearchResult {
  results: {
    id: string
    products: Product[]
  }[]
}

export default function Home() {
  const [state, setState] = useState<AppState>("upload")
  const [imageUrl, setImageUrl] = useState<string>("")
  const [moodTags, setMoodTags] = useState<{ label: string; score: number }[]>(
    []
  )
  const [palette, setPalette] = useState<{ hex: string; label: string }[]>([])
  const [items, setItems] = useState<LookItem[]>([])
  const [moodMeta, setMoodMeta] = useState<{
    summary?: string
    vibe?: string
    season?: string
    occasion?: string
    style?: { fit: string; aesthetic: string; gender: string }
  }>({})
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)

  const handleFileSelect = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setState("analyzing")
    setError(null)
    fileRef.current = file

    try {
      // Step 1: AI image analysis
      const formData = new FormData()
      formData.append("image", file)

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      })

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json().catch(() => ({}))
        throw new Error(errorData.error || "Analysis failed")
      }

      const analysis: AnalysisResult = await analyzeRes.json()

      // Show results immediately with empty products
      const initialItems: LookItem[] = analysis.items.map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
        detail: item.detail,
        fabric: item.fabric,
        color: item.color,
        fit: item.fit,
        thumbnailUrl: "",
        products: [],
      }))

      setMoodTags(analysis.mood.tags)
      setPalette(analysis.palette)
      setMoodMeta({
        summary: analysis.mood.summary,
        vibe: analysis.mood.vibe,
        season: analysis.mood.season,
        occasion: analysis.mood.occasion,
        style: analysis.style,
      })
      setItems(initialItems)
      setState("result")

      // Step 2: Search for real products in background
      const detectedGender = analysis.style?.detectedGender || "unisex"
      const searchRes = await fetch("/api/search-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: detectedGender,
          queries: analysis.items.map((item) => ({
            id: item.id,
            category: item.category,
            searchQuery: item.searchQuery,
          })),
        }),
      })

      if (searchRes.ok) {
        const searchData: ProductSearchResult = await searchRes.json()

        // Merge products into items
        setItems((prev) =>
          prev.map((item) => {
            const found = searchData.results.find((r) => r.id === item.id)
            return found ? { ...item, products: found.products } : item
          })
        )
      }
    } catch (err) {
      console.error("Analysis error:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze image. Please try again."
      )
      setState("upload")
    }
  }, [])

  const handleTryAnother = useCallback(() => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl("")
    setMoodTags([])
    setPalette([])
    setItems([])
    setMoodMeta({})
    setError(null)
    fileRef.current = null
    setState("upload")
  }, [imageUrl])

  return (
    <>
      <Header />

      <main className="flex-grow flex flex-col items-center justify-center px-6 pt-24 pb-12 relative overflow-hidden">
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

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-500 text-sm font-medium bg-red-50 px-4 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}

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
                imageUrl={imageUrl}
                moodTags={moodTags}
                palette={palette}
                items={items}
                moodMeta={moodMeta}
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
