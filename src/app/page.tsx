"use client"

import {useCallback, useRef, useState} from "react"
import {useRouter} from "next/navigation"
import {AnimatePresence, motion} from "framer-motion"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {type Gender} from "@/components/upload/gender-selector"
import {SearchBar} from "@/components/search/search-bar"
import {AnalyzingView} from "@/components/analysis/analyzing-view"
import {parsePrice} from "@/lib/parse-price"

type AppState = "upload" | "analyzing"

export default function Home() {
  const router = useRouter()
  const [state, setState] = useState<AppState>("upload")
  const [imageUrl, setImageUrl] = useState<string>("")
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

    let url = ""
    if (data.file) {
      url = URL.createObjectURL(data.file)
      setImageUrl(url)
    } else {
      setImageUrl("")
    }

    if (data.prompt) setPromptText(data.prompt)
    else setPromptText("")

    const { priceFilter, cleanPrompt } = data.prompt
      ? parsePrice(data.prompt)
      : { priceFilter: null, cleanPrompt: "" }

    // suppress unused var — priceFilter is passed via formData below
    void priceFilter

    setState("analyzing")
    setError(null)
    setProgress(0)
    setProgressLabel(hasImage ? "Uploading image..." : "Analyzing prompt...")
    fileRef.current = data.file ?? null

    // Progress simulation
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

      const analysis = await analyzeRes.json()

      isSubmitting.current = false

      // 결과 페이지로 이동
      if (analysis._logId) {
        router.push(`/result/${analysis._logId}`)
      } else {
        setState("upload")
        setError("Analysis completed but no result ID returned.")
      }
    } catch (err) {
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
  }, [gender, imageUrl, router])

  return (
    <>
      <Header />

      <main className="flex-grow flex flex-col items-center justify-center px-6 pt-24 pb-12 relative overflow-x-hidden industrial-grid min-h-screen">
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
                  Stop browsing.
                  <br />
                  <span className="text-muted-foreground">
                    Start finding what to wear.
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
        </AnimatePresence>
      </main>

      <Footer />
    </>
  )
}
