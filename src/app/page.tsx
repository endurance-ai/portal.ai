"use client"

import {useCallback, useRef, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {UploadZone} from "@/components/upload/upload-zone"
import {MoodChips} from "@/components/upload/mood-chips"
import {AnalyzingView} from "@/components/analysis/analyzing-view"
import type {LookItem, Product} from "@/components/result/look-breakdown"
import {LookBreakdown} from "@/components/result/look-breakdown"

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
    position?: { top: number; left: number }
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
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const fileRef = useRef<File | null>(null)

  const handleFileSelect = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setState("analyzing")
    setError(null)
    setProgress(0)
    setProgressLabel("Uploading image...")
    fileRef.current = file

    // Smooth progress simulation — ticks up gradually while waiting for API
    let simulated = 5
    const ticker = setInterval(() => {
      simulated += Math.random() * 3 + 0.5 // +0.5~3.5% per tick
      if (simulated > 52) simulated = 52  // cap before real response
      setProgress(Math.round(simulated))
    }, 400)

    let ticker2: ReturnType<typeof setInterval> | null = null

    try {
      // Step 1: AI image analysis (0% → ~55%)
      setProgressLabel("Analyzing silhouette & texture...")

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

      clearInterval(ticker)
      setProgress(55)
      setProgressLabel("Extracting mood & palette...")

      const analysis: AnalysisResult & { _logId?: string } = await analyzeRes.json()
      const logId = analysis._logId

      // Step 2: Search products (60% → 95%)
      // Start a new ticker for product search phase
      let simulated2 = 60
      ticker2 = setInterval(() => {
        simulated2 += Math.random() * 2.5 + 0.5
        if (simulated2 > 88) simulated2 = 88
        setProgress(Math.round(simulated2))
      }, 300)

      setProgress(60)
      setProgressLabel("Searching products across platforms...")

      const detectedGender = analysis.style?.detectedGender || "unisex"
      const searchRes = await fetch("/api/search-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: detectedGender,
          _logId: logId,
          queries: analysis.items.map((item) => ({
            id: item.id,
            category: item.category,
            searchQuery: item.searchQuery,
          })),
        }),
      })

      clearInterval(ticker2)
      setProgress(92)
      setProgressLabel("Compiling results...")

      let productResults: ProductSearchResult["results"] = []
      if (searchRes.ok) {
        const searchData: ProductSearchResult = await searchRes.json()
        productResults = searchData.results
      }

      // Build final items with products merged
      const finalItems: LookItem[] = analysis.items.map((item) => {
        const found = productResults.find((r) => r.id === item.id)
        return {
          id: item.id,
          category: item.category,
          name: item.name,
          detail: item.detail,
          fabric: item.fabric,
          color: item.color,
          fit: item.fit,
          position: item.position,
          thumbnailUrl: "",
          products: found?.products ?? [],
        }
      })

      setProgress(100)
      setProgressLabel("Complete")

      // Brief pause at 100% so the user sees it
      await new Promise((r) => setTimeout(r, 400))

      setMoodTags(analysis.mood.tags)
      setPalette(analysis.palette)
      setMoodMeta({
        summary: analysis.mood.summary,
        vibe: analysis.mood.vibe,
        season: analysis.mood.season,
        occasion: analysis.mood.occasion,
        style: analysis.style,
      })
      setItems(finalItems)
      setState("result")
    } catch (err) {
      clearInterval(ticker)
      if (ticker2) clearInterval(ticker2)
      URL.revokeObjectURL(url)
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
    setProgress(0)
    setProgressLabel("")
    fileRef.current = null
    setState("upload")
  }, [imageUrl])

  return (
    <>
      <Header />

      <main className="flex-grow flex flex-col items-center justify-center px-6 pt-24 pb-12 relative overflow-hidden industrial-grid min-h-screen">
        <AnimatePresence mode="wait">
          {state === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl text-center space-y-10 z-10"
            >
              <motion.div
                className="space-y-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <h1 className="text-4xl md:text-6xl font-extrabold text-foreground tracking-[-0.03em] leading-tight">
                  Drop your fit.
                  <br />
                  <span className="text-primary">
                    We&apos;ll read the vibe.
                  </span>
                </h1>
                <p className="text-on-surface-variant text-base md:text-lg max-w-md mx-auto font-medium leading-relaxed">
                  Upload one outfit photo and our AI extracts the mood, palette,
                  and style DNA.
                </p>
              </motion.div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-400 text-sm font-mono bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg"
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
              <AnalyzingView imageUrl={imageUrl} progress={progress} progressLabel={progressLabel} />
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
