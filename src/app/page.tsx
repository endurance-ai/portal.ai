"use client"

import {useCallback, useRef, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {type Gender} from "@/components/upload/gender-selector"
import {SearchBar} from "@/components/search/search-bar"
import {AnalyzingView} from "@/components/analysis/analyzing-view"
import type {LookItem, Product} from "@/components/result/look-breakdown"
import {LookBreakdown} from "@/components/result/look-breakdown"
import {parsePrice} from "@/lib/parse-price"

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
    subcategory?: string
    name: string
    detail?: string
    fabric?: string
    color?: string
    fit?: string
    colorFamily?: string
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
  const [promptText, setPromptText] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const fileRef = useRef<File | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleSubmit = useCallback(async (data: { prompt?: string; file?: File }) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    const hasImage = !!data.file

    // Revoke previous blob URL before creating new one
    if (imageUrl) URL.revokeObjectURL(imageUrl)

    // Set image URL if file exists
    let url = ""
    if (data.file) {
      url = URL.createObjectURL(data.file)
      setImageUrl(url)
    } else {
      setImageUrl("")
    }

    if (data.prompt) setPromptText(data.prompt)
    else setPromptText("")

    // 가격 필터 파싱 (AI 호출 전에 처리)
    const { priceFilter } = data.prompt ? parsePrice(data.prompt) : { priceFilter: null }

    setState("analyzing")
    setError(null)
    setProgress(0)
    setProgressLabel(hasImage ? "Uploading image..." : "Analyzing prompt...")
    fileRef.current = data.file ?? null

    // Progress simulation — faster for prompt-only
    let simulated = 5
    const speed = hasImage ? 3 : 12
    const cap = hasImage ? 85 : 90
    const ticker = setInterval(() => {
      simulated += Math.random() * speed + 0.5
      if (simulated > cap) simulated = cap
      setProgress(Math.round(simulated))
    }, 400)

    try {
      if (hasImage) {
        setProgressLabel("Analyzing silhouette & texture...")
      } else {
        setProgressLabel("Extracting keywords...")
      }

      const formData = new FormData()
      if (data.file) formData.append("image", data.file)
      if (data.prompt) formData.append("prompt", data.prompt)
      formData.append("gender", gender)

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        signal,
      })

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json().catch(() => ({}))
        throw new Error(errorData.error || "Analysis failed")
      }

      clearInterval(ticker)
      setProgress(100)
      setProgressLabel("Complete")

      const analysis: AnalysisResult & { _logId?: string; _promptOnly?: boolean } =
        await analyzeRes.json()
      const logId = analysis._logId

      const initialItems: LookItem[] = (analysis.items || []).map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
        detail: item.detail,
        fabric: item.fabric,
        color: item.color,
        fit: item.fit,
        position: item.position,
        products: [],
      }))

      await new Promise((r) => setTimeout(r, 300))

      setMoodTags(analysis.mood?.tags || [])
      setPalette(analysis.palette || [])
      setMoodMeta({
        summary: analysis.mood?.summary,
        vibe: analysis.mood?.vibe,
        season: analysis.mood?.season,
        occasion: analysis.mood?.occasion,
        style: analysis.style,
      })
      setItems(initialItems)
      setState("result")

      // Background: fetch products
      fetch("/api/search-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          gender,
          styleNode: analysis.styleNode,
          moodTags: analysis.mood?.tags?.map((t: { label: string }) => t.label) || [],
          _logId: logId,
          ...(priceFilter && { priceFilter }),
          queries: (analysis.items || []).map((item) => ({
            id: item.id,
            category: item.category,
            subcategory: item.subcategory,
            fit: item.fit,
            fabric: item.fabric,
            colorFamily: item.colorFamily,
            searchQuery: item.searchQuery,
            searchQueryKo: item.searchQueryKo,
          })),
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((searchData: ProductSearchResult | null) => {
          if (!searchData) return
          setItems((prev) =>
            prev.map((item) => {
              const found = searchData.results.find((r) => r.id === item.id)
              return found
                ? { ...item, products: found.products, productsLoaded: true }
                : { ...item, productsLoaded: true }
            }),
          )
        })
        .catch((err) => {
          console.error("Product search failed:", err)
          setItems((prev) => prev.map((item) => ({ ...item, productsLoaded: true })))
        })
    } catch (err) {
      clearInterval(ticker)
      setImageUrl("")
      setState("upload")
      if (url) URL.revokeObjectURL(url)
      console.error("Analysis error:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze. Please try again.",
      )
    }
  }, [gender, imageUrl])

  const handleTryAnother = useCallback(() => {
    abortRef.current?.abort()
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl("")
    setPromptText("")
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

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-400 text-sm font-mono bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}

              <SearchBar
                gender={gender}
                onGenderChange={setGender}
                onSubmit={handleSubmit}
              />
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
              {promptText && (
                <div className="max-w-4xl mx-auto mb-6 px-4">
                  <p className="text-sm text-muted-foreground font-mono">
                    <span className="text-foreground">Search:</span> &quot;{promptText}&quot;
                  </p>
                </div>
              )}
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
