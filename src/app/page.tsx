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
import {FeedbackFlow} from "@/components/result/feedback-flow"
import {StickyRefineBar} from "@/components/result/sticky-refine-bar"
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
    season?: string
    pattern?: string
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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null)
  const [currentSequence, setCurrentSequence] = useState(1)
  const [suggestionText, setSuggestionText] = useState<string>("")
  const [gender, setGender] = useState<Gender>("male")
  const [promptText, setPromptText] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")
  const fileRef = useRef<File | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isSubmitting = useRef(false)

  const handleSubmit = useCallback(async (data: { prompt?: string; file?: File }) => {
    if (isSubmitting.current) return
    isSubmitting.current = true
    try { abortRef.current?.abort() } catch { /* ignore previous abort */ }
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

    // 가격 필터 파싱 (AI 호출 전에 처리 — 가격 텍스트 제거한 cleanPrompt를 AI에 전달)
    const { priceFilter, cleanPrompt } = data.prompt
      ? parsePrice(data.prompt)
      : { priceFilter: null, cleanPrompt: "" }

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
      if (data.prompt) formData.append("prompt", cleanPrompt || data.prompt)
      if (data.prompt) formData.append("originalPrompt", data.prompt)
      formData.append("gender", gender)
      if (sessionId) formData.append("sessionId", sessionId)
      if (currentAnalysisId) formData.append("parentAnalysisId", currentAnalysisId)
      if (sessionId && data.prompt) formData.append("refinementPrompt", data.prompt)
      if (sessionId && items.length > 0) {
        formData.append("previousContext", JSON.stringify({
          items: items.map((i) => ({
            category: i.category,
            name: i.name,
            color: i.color || "",
            fit: i.fit || "",
          })),
          styleNode: moodMeta?.style?.aesthetic || "",
          moodTags: moodTags.map((t) => t.label),
        }))
      }

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

      const analysis: AnalysisResult & { _logId?: string; _promptOnly?: boolean; detectedGender?: string; _sessionId?: string; _sequenceNumber?: number } =
        await analyzeRes.json()
      const logId = analysis._logId

      setSessionId(analysis._sessionId ?? null)
      setCurrentAnalysisId(analysis._logId ?? null)
      setCurrentSequence(analysis._sequenceNumber ?? 1)

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
      isSubmitting.current = false

      // Background: fetch products
      // GPT detected_gender가 있으면 우선 사용, 없으면 UI 셀렉터 값
      const effectiveGender = analysis.style?.detectedGender || analysis.detectedGender || gender
      fetch("/api/search-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          gender: effectiveGender,
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
            season: item.season,
            pattern: item.pattern,
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
      // AbortError는 새 요청 시 이전 요청 취소로 발생 — UI 상태 건드리지 않음
      if (err instanceof Error && err.name === "AbortError") {
        clearInterval(ticker)
        isSubmitting.current = false
        return
      }
      isSubmitting.current = false
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSessionId(null)
    setCurrentAnalysisId(null)
    setCurrentSequence(1)
    setSuggestionText("")
    setState("upload")
  }, [imageUrl])

  const handleRefine = useCallback((data: { prompt: string; file?: File }) => {
    handleSubmit({ prompt: data.prompt, file: data.file })
  }, [handleSubmit])

  const handleSuggestionClick = useCallback((text: string) => {
    setSuggestionText(text)
  }, [])

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
                  Describe your style.
                  <br />
                  <span className="text-muted-foreground">
                    We find every piece.
                  </span>
                </h1>
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

              {/* Platform logos + Stats */}
              <div className="space-y-6 pt-4">
                <div className="flex items-center justify-center gap-5 flex-wrap">
                  {["AMOMENTO", "Slow Steady Club", "ETC Seoul", "SCULP Store", "Freight"].map((name) => (
                    <span key={name} className="text-[11px] font-mono font-semibold text-white/20 tracking-wide">
                      {name}
                    </span>
                  ))}
                  <span className="text-[11px] font-mono font-medium text-white/12 tracking-wide">
                    +17 more
                  </span>
                </div>
                <div className="flex items-center justify-center gap-8">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-base font-mono font-bold text-white/30">26,000+</span>
                    <span className="text-[10px] font-mono text-white/15 tracking-widest">products</span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-base font-mono font-bold text-white/30">22</span>
                    <span className="text-[10px] font-mono text-white/15 tracking-widest">platforms</span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-base font-mono font-bold text-white/30">15</span>
                    <span className="text-[10px] font-mono text-white/15 tracking-widest">style nodes</span>
                  </div>
                </div>
              </div>
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
              <AnalyzingView imageUrl={imageUrl} promptText={promptText} progress={progress} progressLabel={progressLabel} />
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
                onSuggestionClick={handleSuggestionClick}
              />
              {sessionId && currentAnalysisId && (
                <FeedbackFlow
                  sessionId={sessionId}
                  analysisId={currentAnalysisId}
                />
              )}
              <StickyRefineBar
                currentSequence={currentSequence}
                onSubmit={handleRefine}
                onReset={handleTryAnother}
                initialText={suggestionText}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </>
  )
}
