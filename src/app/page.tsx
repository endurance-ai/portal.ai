"use client"

import {useCallback, useRef, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {UploadZone} from "@/components/upload/upload-zone"
import {type Gender, GenderSelector} from "@/components/upload/gender-selector"
import {StyleChips} from "@/components/upload/style-chips"
import {AnalyzingView} from "@/components/analysis/analyzing-view"
import type {LookItem, Product} from "@/components/result/look-breakdown"
import {LookBreakdown} from "@/components/result/look-breakdown"

type AppState = "upload" | "analyzing" | "result"

interface AnalysisResult {
  styleNode?: {
    primary: string
    primaryConfidence: number
    secondary: string
    secondaryConfidence: number
    reasoning: string
  }
  sensitivityTags?: string[]
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
    searchQueryKo?: string
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
  const [gender, setGender] = useState<Gender>("male")
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const fileRef = useRef<File | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleFileSelect = useCallback(async (file: File) => {
    // Abort any in-flight product search from a previous session
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setState("analyzing")
    setError(null)
    setProgress(0)
    setProgressLabel("Uploading image...")
    fileRef.current = file

    // Smooth progress simulation for analyze phase
    let simulated = 5
    const ticker = setInterval(() => {
      simulated += Math.random() * 3 + 0.5
      if (simulated > 85) simulated = 85
      setProgress(Math.round(simulated))
    }, 400)

    try {
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
      setProgress(100)
      setProgressLabel("Complete")

      const analysis: AnalysisResult & { _logId?: string } = await analyzeRes.json()
      const logId = analysis._logId

      // Build items WITHOUT products — show result immediately
      const initialItems: LookItem[] = analysis.items.map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
        detail: item.detail,
        fabric: item.fabric,
        color: item.color,
        fit: item.fit,
        position: item.position,
        products: [], // empty → skeletons shown
      }))

      // Brief pause at 100% so user sees completion
      await new Promise((r) => setTimeout(r, 300))

      // Set result state IMMEDIATELY — user sees look breakdown with skeletons
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

      // Background: fetch products and update progressively
      fetch("/api/search-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          gender,
          styleNode: analysis.styleNode,
          sensitivityTags: analysis.sensitivityTags,
          _logId: logId,
          queries: analysis.items.map((item) => ({
            id: item.id,
            category: item.category,
            searchQuery: item.searchQuery,
            searchQueryKo: item.searchQueryKo,
          })),
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((searchData: ProductSearchResult | null) => {
          if (!searchData) return
          // Update items with products
          setItems((prev) =>
            prev.map((item) => {
              const found = searchData.results.find((r) => r.id === item.id)
              return found ? { ...item, products: found.products } : item
            })
          )
        })
        .catch((err) => {
          console.error("Product search failed:", err)
          // Items stay with empty products — skeletons remain, not a fatal error
        })
    } catch (err) {
      clearInterval(ticker)
      URL.revokeObjectURL(url)
      console.error("Analysis error:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze image. Please try again."
      )
      setState("upload")
    }
  }, [gender])

  const handleTryAnother = useCallback(() => {
    abortRef.current?.abort()
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
                  One photo.
                  <br />
                  <span className="text-muted-foreground">
                    Every option.
                  </span>
                </h1>
                <p className="text-on-surface-variant text-base md:text-lg max-w-md mx-auto font-medium leading-relaxed">
                  Drop an outfit — we break down every piece and find it
                  across platforms.
                </p>
              </motion.div>

              <GenderSelector value={gender} onChange={setGender} />

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
              <StyleChips />
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
