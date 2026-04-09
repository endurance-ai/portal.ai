"use client"

import {useCallback, useEffect, useRef, useState} from "react"
import {useRouter} from "next/navigation"
import Link from "next/link"
import {motion} from "framer-motion"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {AnalyzingView} from "@/components/analysis/analyzing-view"
import type {LookItem, Product} from "@/components/result/look-breakdown"
import {LookBreakdown} from "@/components/result/look-breakdown"
import {FeedbackFlow} from "@/components/result/feedback-flow"
import {StickyRefineBar} from "@/components/result/sticky-refine-bar"
import {parsePrice, type PriceFilter} from "@/lib/parse-price"
import {useLocale} from "@/lib/i18n"

interface SearchItem {
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
}

interface ResultClientProps {
  analysisId: string
  imageUrl: string
  promptText: string
  detectedGender: string
  sessionId: string
  sequenceNumber: number
  items: SearchItem[]
  mood: { tags?: { label: string; score: number }[]; summary?: string; vibe?: string; season?: string; occasion?: string }
  palette: { hex: string; label: string }[]
  style: { fit?: string; aesthetic?: string; gender?: string }
  styleNode: { primary: string; secondary?: string } | null
  moodTags: { label: string; score: number }[]
}

interface ProductSearchResult {
  results: { id: string; products: Product[] }[]
}

export function ResultClient({
  analysisId,
  imageUrl,
  promptText,
  detectedGender,
  sessionId,
  sequenceNumber,
  items: rawItems,
  mood,
  palette,
  style,
  styleNode,
  moodTags,
}: ResultClientProps) {
  const router = useRouter()
  const {t} = useLocale()
  const [items, setItems] = useState<LookItem[]>(() =>
    rawItems.map((item) => ({
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
  )
  const [suggestionText, setSuggestionText] = useState("")
  const [refining, setRefining] = useState(false)
  const [refineProgress, setRefineProgress] = useState(0)
  const [refineLabel, setRefineLabel] = useState("")
  const itemsRef = useRef(rawItems)
  const moodTagsRef = useRef(moodTags)

  // 프롬프트에서 가격 필터 추출
  const extractedPrice = useRef<PriceFilter | null>(
    promptText ? parsePrice(promptText).priceFilter : null
  )

  const moodMeta = {
    summary: mood.summary,
    vibe: mood.vibe,
    season: mood.season,
    occasion: mood.occasion,
    style: style as { fit: string; aesthetic: string; gender: string },
  }

  // 마운트 시 상품 검색
  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/search-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gender: detectedGender,
        styleNode,
        moodTags: moodTags.map((t) => t.label),
        _logId: analysisId,
        priceFilter: extractedPrice.current,
        queries: rawItems.map((item) => ({
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
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProductSearchResult | null) => {
        if (!data) return
        setItems((prev) =>
          prev.map((item) => {
            const found = data.results.find((r) => r.id === item.id)
            return found ? { ...item, products: found.products, productsLoaded: true } : { ...item, productsLoaded: true }
          })
        )
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return
        setItems((prev) => prev.map((item) => ({ ...item, productsLoaded: true })))
      })

    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 리파인 → 새 분석 → 새 URL
  const handleRefine = useCallback(async (data: { prompt: string; file?: File }) => {
    if (refining) return
    setRefining(true)
    setRefineProgress(5)
    setRefineLabel(t("result.refining"))

    // Progress simulation
    let simulated = 5
    const hasFile = !!data.file
    const speed = hasFile ? 3 : 12
    const cap = hasFile ? 85 : 90
    const ticker = setInterval(() => {
      simulated += Math.random() * speed + 0.5
      if (simulated > cap) simulated = cap
      setRefineProgress(Math.round(simulated))
    }, 400)

    const { priceFilter, cleanPrompt } = parsePrice(data.prompt)
    const formData = new FormData()
    if (data.file) formData.append("image", data.file)
    formData.append("prompt", cleanPrompt || data.prompt)
    formData.append("originalPrompt", data.prompt)
    formData.append("gender", detectedGender)
    if (sessionId) formData.append("sessionId", sessionId)
    formData.append("parentAnalysisId", analysisId)
    formData.append("refinementPrompt", data.prompt)
    formData.append("previousContext", JSON.stringify({
      items: itemsRef.current.map((i) => ({
        category: i.category, name: i.name, color: i.color || "", fit: i.fit || "",
      })),
      styleNode: style.aesthetic || "",
      moodTags: moodTagsRef.current.map((t) => t.label),
    }))
    if (priceFilter) formData.append("priceFilter", JSON.stringify(priceFilter))

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData })
      clearInterval(ticker)
      if (!res.ok) {
        setRefining(false)
        return
      }
      setRefineProgress(100)
      setRefineLabel(t("upload.complete"))
      const result = await res.json()
      if (result._logId) {
        router.push(`/result/${result._logId}`)
      } else {
        setRefining(false)
      }
    } catch {
      clearInterval(ticker)
      setRefining(false)
    }
  }, [analysisId, sessionId, detectedGender, style.aesthetic, router, refining, t])

  const handleSuggestionClick = useCallback((text: string) => {
    setSuggestionText(text)
  }, [])

  return (
    <>
      <Header />
      <main className="flex-grow flex flex-col items-center px-6 pt-24 pb-12 relative overflow-x-hidden industrial-grid min-h-screen">
        {refining ? (
          <motion.div
            key="refining"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full z-10"
          >
            <AnalyzingView imageUrl={imageUrl} promptText={promptText} progress={refineProgress} progressLabel={refineLabel} />
          </motion.div>
        ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full z-10 pt-4"
        >
          {promptText && (
            <div className="max-w-4xl mx-auto mb-6 px-4">
              <p className="text-sm text-muted-foreground font-mono">
                <span className="text-foreground">{t("result.search")}</span> &quot;{promptText}&quot;
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
          {sessionId && analysisId && (
            <FeedbackFlow sessionId={sessionId} analysisId={analysisId} />
          )}
          <div className="flex justify-center py-6">
            <Link
              href="/"
              className="px-8 py-3 bg-primary text-background rounded-lg text-sm font-mono font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              {t("result.tryAnother")}
            </Link>
          </div>
          <div className="h-28" />
          <StickyRefineBar
            currentSequence={sequenceNumber}
            onSubmit={handleRefine}
            onReset={() => router.push("/")}
            initialText={suggestionText}
            disabled={refining}
          />
        </motion.div>
        )}
      </main>
      <Footer />
    </>
  )
}
