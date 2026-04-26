"use client"

import {useCallback, useEffect, useReducer, useRef} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {AnalyzingView} from "@/components/analysis/analyzing-view"
import {AgentProgress} from "./_qa/agent-progress"
import {StepInput} from "./_qa/step-input"
import {StepConfirm} from "./_qa/step-confirm"
import {StepHold} from "./_qa/step-hold"
import {StepConditions} from "./_qa/step-conditions"
import {StepResults} from "./_qa/step-results"
import {StepFeedback} from "./_qa/step-feedback"
import {
    type AgentProduct,
    type AnalyzedItem,
    INITIAL_AGENT_STATE,
    type LockableAttr,
    type SimilarityLevel,
} from "./_qa/types"
import {agentReducer} from "./_qa/agent-reducer"
import {type FeedbackRating, type FeedbackTagId} from "@/lib/feedback-tags"

export default function Home() {
  const [state, dispatch] = useReducer(agentReducer, INITIAL_AGENT_STATE)
  const objectUrlRef = useRef<string | null>(null)
  const analyzeAbortRef = useRef<AbortController | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTicker = useCallback(() => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopTicker()
  }, [stopTicker])

  // Step 1 → analyze
  const handleAnalyze = useCallback(
    async (data: { prompt?: string; file?: File }) => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      analyzeAbortRef.current?.abort()
      const controller = new AbortController()
      analyzeAbortRef.current = controller

      let imageUrl = ""
      if (data.file) {
        imageUrl = URL.createObjectURL(data.file)
        objectUrlRef.current = imageUrl
      }
      const promptText = data.prompt ?? ""
      const hasImage = !!data.file

      dispatch({ type: "ANALYZE_START", imageUrl, promptText })

      // Progress simulation
      stopTicker()
      let simulated = 5
      const speed = hasImage ? 3 : 12
      const cap = hasImage ? 85 : 90
      dispatch({ type: "ANALYZE_PROGRESS", progress: 5, label: hasImage ? "Reading silhouette" : "Reading the look" })
      tickerRef.current = setInterval(() => {
        simulated += Math.random() * speed + 0.5
        if (simulated > cap) simulated = cap
        dispatch({ type: "ANALYZE_PROGRESS", progress: Math.round(simulated), label: "" })
      }, 400)

      try {
        const formData = new FormData()
        if (data.file) formData.append("image", data.file)
        if (data.prompt) {
          formData.append("prompt", data.prompt)
          formData.append("originalPrompt", data.prompt)
        }
        formData.append("gender", state.gender)

        const res = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || "Analysis failed")
        }
        const result = await res.json()
        const items = (Array.isArray(result.items) ? result.items : []) as AnalyzedItem[]
        if (items.length === 0) {
          throw new Error("No items detected. Try a different image or prompt.")
        }
        stopTicker()
        dispatch({
          type: "ANALYZE_SUCCESS",
          analysisId: result._logId || null,
          items,
          styleNode: result.styleNode ?? null,
          moodTags: Array.isArray(result.mood?.tags)
            ? result.mood.tags.map((t: { label: string }) => t.label).filter(Boolean)
            : [],
        })
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
        stopTicker()
        dispatch({
          type: "ANALYZE_ERROR",
          error: e instanceof Error ? e.message : "Analysis failed",
        })
      }
    },
    [state.gender, stopTicker],
  )

  // Search
  const runSearch = useCallback(
    async (overrideLocked?: LockableAttr[]) => {
      const item = state.items.find((i) => i.id === state.selectedItemId)
      if (!item) return

      searchAbortRef.current?.abort()
      const controller = new AbortController()
      searchAbortRef.current = controller

      dispatch({ type: "SEARCH_START" })

      const effectiveLocked = Array.isArray(overrideLocked)
        ? overrideLocked
        : state.lockedAttrs

      const lockedAttributes: Record<string, string> = {}
      for (const attr of effectiveLocked) {
        const value = item[attr as keyof AnalyzedItem]
        if (typeof value === "string" && value) {
          lockedAttributes[attr] = value
        }
      }

      const priceFilter =
        state.priceMin !== null || state.priceMax !== null
          ? {
              minPrice: state.priceMin ?? undefined,
              maxPrice: state.priceMax ?? undefined,
            }
          : null

      try {
        const res = await fetch("/api/search-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gender: state.gender,
            styleNode: state.styleNode,
            moodTags: state.moodTags,
            _logId: state.analysisId || undefined,
            priceFilter,
            styleTolerance: state.styleTolerance,
            queries: [
              {
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
                lockedAttributes,
              },
            ],
          }),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error("Search failed")
        const data = await res.json()
        const products: AgentProduct[] = data.results?.[0]?.products ?? []
        dispatch({ type: "SEARCH_SUCCESS", products })
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return
        dispatch({
          type: "SEARCH_ERROR",
          error: e instanceof Error ? e.message : "Search failed",
        })
      }
    },
    [
      state.items,
      state.selectedItemId,
      state.lockedAttrs,
      state.priceMin,
      state.priceMax,
      state.styleTolerance,
      state.gender,
      state.styleNode,
      state.moodTags,
      state.analysisId,
    ],
  )

  // Feedback submission
  const handleFeedback = useCallback(
    async (data: {
      rating: FeedbackRating
      tags: FeedbackTagId[]
      comment: string
      email: string
    }) => {
      try {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: state.analysisId,
            rating: data.rating,
            tags: data.tags,
            comment: data.comment,
            email: data.email,
          }),
        })
      } catch {
        // 피드백 전송 실패해도 UX에 영향 주지 않음
      }
      dispatch({ type: "FEEDBACK_SUBMITTED" })
    },
    [state.analysisId],
  )

  const selectedItem = state.items.find((i) => i.id === state.selectedItemId) ?? null

  // Keyboard navigation
  const runSearchRef = useRef(runSearch)
  const kbStateRef = useRef({ step: state.step })
  useEffect(() => {
    runSearchRef.current = runSearch
  }, [runSearch])
  useEffect(() => {
    kbStateRef.current = { step: state.step }
  }, [state.step])

  useEffect(() => {
    function isFormField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
    }

    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isFormField(e.target)) return
      if (e.target instanceof HTMLElement && e.target.closest("[data-no-kb-nav]")) return

      const { step: currentStep } = kbStateRef.current

      if (e.key === "Enter") {
        if (currentStep === "confirm") {
          e.preventDefault()
          dispatch({ type: "CONFIRM_ITEM" })
        } else if (currentStep === "hold") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "conditions" })
        } else if (currentStep === "conditions") {
          e.preventDefault()
          void runSearchRef.current()
        }
      } else if (e.key === "Escape") {
        if (currentStep === "confirm") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "input" })
        } else if (currentStep === "hold") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "confirm" })
        } else if (currentStep === "conditions") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "hold" })
        } else if (currentStep === "results") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "conditions" })
        } else if (currentStep === "feedback") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "results" })
        }
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <>
      <Header />
      <main className="flex-grow flex flex-col items-center px-6 md:px-14 pt-28 pb-12 relative min-h-screen">
        <div className="w-full max-w-5xl mx-auto mb-10 z-10">
          <AgentProgress
            current={state.step}
            onStepClick={(s) => dispatch({ type: "GO_TO_STEP", step: s })}
          />
        </div>

        <div className="w-full z-10 flex-1 flex flex-col items-center justify-start">
          <AnimatePresence mode="wait">
            {/* Step 1 — Analyzing */}
            {state.step === "input" && state.searching && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="w-full"
              >
                <AnalyzingView
                  imageUrl={state.imageUrl}
                  promptText={state.promptText}
                  progress={state.analyzeProgress}
                  progressLabel={state.analyzeLabel}
                />
              </motion.div>
            )}

            {/* Step 1 — Input */}
            {state.step === "input" && !state.searching && (
              <motion.div
                key="input"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="w-full"
              >
                <StepInput
                  gender={state.gender}
                  onGenderChange={(g) => dispatch({ type: "SET_GENDER", gender: g })}
                  onSubmit={handleAnalyze}
                  error={state.searchError}
                  loading={false}
                />
              </motion.div>
            )}

            {/* Step 2 — Confirm */}
            {state.step === "confirm" && state.items.length > 0 && (
              <StepConfirm
                key="confirm"
                items={state.items}
                selectedItemId={state.selectedItemId}
                editedItem={state.editedItem}
                onSelectItem={(id) => dispatch({ type: "SELECT_ITEM", itemId: id })}
                onEditAttr={(key, value) => dispatch({ type: "EDIT_ITEM_ATTR", key, value })}
                onBack={() => dispatch({ type: "GO_TO_STEP", step: "input" })}
                onConfirm={() => dispatch({ type: "CONFIRM_ITEM" })}
              />
            )}

            {/* Step 3 — Hold */}
            {state.step === "hold" && selectedItem && (
              <StepHold
                key="hold"
                selectedItem={selectedItem}
                lockedAttrs={state.lockedAttrs}
                onToggleLock={(attr) => dispatch({ type: "TOGGLE_LOCK", attr })}
                onBack={() => dispatch({ type: "GO_TO_STEP", step: "confirm" })}
                onNext={() => dispatch({ type: "GO_TO_STEP", step: "conditions" })}
              />
            )}

            {/* Step 4 — Conditions */}
            {state.step === "conditions" && (
              <StepConditions
                key="conditions"
                similarityLevel={state.similarityLevel}
                priceMin={state.priceMin}
                priceMax={state.priceMax}
                onSetSimilarity={(level: SimilarityLevel) => dispatch({ type: "SET_SIMILARITY", level })}
                onSetPrice={(min, max) => dispatch({ type: "SET_PRICE", min, max })}
                onBack={() => dispatch({ type: "GO_TO_STEP", step: "hold" })}
                onNext={() => void runSearch()}
              />
            )}

            {/* Step 5 — Results */}
            {state.step === "results" && selectedItem && (
              <StepResults
                key="results"
                imageUrl={state.imageUrl}
                selectedItem={selectedItem}
                lockedAttrs={state.lockedAttrs}
                products={state.products}
                searching={state.searching}
                error={state.searchError}
                onGoToFeedback={() => dispatch({ type: "GO_TO_STEP", step: "feedback" })}
                onRefineAgain={() => dispatch({ type: "GO_TO_STEP", step: "hold" })}
                onUnlockAttr={(attr) => {
                  const newLocked = state.lockedAttrs.filter((a) => a !== attr)
                  dispatch({ type: "TOGGLE_LOCK", attr })
                  void runSearch(newLocked)
                }}
                onReset={() => {
                  if (objectUrlRef.current) {
                    URL.revokeObjectURL(objectUrlRef.current)
                    objectUrlRef.current = null
                  }
                  dispatch({ type: "RESET" })
                }}
              />
            )}

            {/* Step 6 — Feedback */}
            {state.step === "feedback" && (
              <StepFeedback
                key="feedback"
                analysisId={state.analysisId}
                feedbackSubmitted={state.feedbackSubmitted}
                onSubmitFeedback={handleFeedback}
                onAdjust={() => dispatch({ type: "GO_TO_STEP", step: "hold" })}
                onReset={() => {
                  if (objectUrlRef.current) {
                    URL.revokeObjectURL(objectUrlRef.current)
                    objectUrlRef.current = null
                  }
                  dispatch({ type: "RESET" })
                }}
              />
            )}
          </AnimatePresence>

          {(state.step === "confirm" || state.step === "hold" || state.step === "conditions") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-8 hidden md:flex items-center justify-center gap-3 text-[11px] font-medium text-ink-quiet tracking-[-0.01em]"
            >
              <span>
                <kbd className="px-2 py-0.5 border border-line bg-cream text-ink text-[11px] font-medium">
                  Enter
                </kbd>{" "}
                next
              </span>
              <span className="text-line">·</span>
              <span>
                <kbd className="px-2 py-0.5 border border-line bg-cream text-ink text-[11px] font-medium">
                  Esc
                </kbd>{" "}
                back
              </span>
            </motion.div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
