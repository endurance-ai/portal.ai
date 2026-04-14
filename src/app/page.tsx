"use client"

import {useCallback, useEffect, useReducer, useRef, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {AnalyzingView} from "@/components/analysis/analyzing-view"
import {AgentProgress} from "./_qa/agent-progress"
import {StepInput} from "./_qa/step-input"
import {StepAttributes} from "./_qa/step-attributes"
import {StepRefine} from "./_qa/step-refine"
import {StepResults} from "./_qa/step-results"
import {type AgentProduct, type AnalyzedItem, INITIAL_AGENT_STATE, type LockableAttr,} from "./_qa/types"
import {agentReducer} from "./_qa/agent-reducer"

export default function Home() {
  const [state, dispatch] = useReducer(agentReducer, INITIAL_AGENT_STATE)
  const objectUrlRef = useRef<string | null>(null)
  const analyzeAbortRef = useRef<AbortController | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Step 1 분석 진행 시뮬레이션 (UI feedback only — 실제 진행과 무관)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [analyzeLabel, setAnalyzeLabel] = useState("")

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
      // 이전 blob URL 해제
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }

      // 이전 analyze 요청 취소 (유저가 이전 분석 끝나기 전에 새 요청 하면)
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

      // Progress 시뮬레이션 시작 (5 → cap 까지 점진 증가)
      stopTicker()
      setAnalyzeProgress(5)
      setAnalyzeLabel(hasImage ? "Reading silhouette" : "Reading the look")
      let simulated = 5
      const speed = hasImage ? 3 : 12
      const cap = hasImage ? 85 : 90
      tickerRef.current = setInterval(() => {
        simulated += Math.random() * speed + 0.5
        if (simulated > cap) simulated = cap
        setAnalyzeProgress(Math.round(simulated))
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
        setAnalyzeProgress(100)
        setAnalyzeLabel("Done.")
        dispatch({
          type: "ANALYZE_SUCCESS",
          analysisId: result._logId ?? "",
          items,
          styleNode: result.styleNode ?? null,
          moodTags: Array.isArray(result.mood?.tags)
            ? result.mood.tags.map((t: { label: string }) => t.label).filter(Boolean)
            : [],
        })
      } catch (e) {
        // AbortError는 의도된 취소이므로 에러로 표시하지 않음
        if (e instanceof Error && e.name === "AbortError") return
        stopTicker()
        setAnalyzeProgress(0)
        setAnalyzeLabel("")
        dispatch({
          type: "ANALYZE_ERROR",
          error: e instanceof Error ? e.message : "Analysis failed",
        })
      }
    },
    [state.gender, stopTicker],
  )

  // Step 4 → search
  // overrideLocked: 직전에 dispatch된 lock 변경을 즉시 반영하고 싶을 때 사용 (stale closure 회피)
  const runSearch = useCallback(
    async (overrideLocked?: LockableAttr[]) => {
      const item = state.items.find((i) => i.id === state.selectedItemId)
      if (!item) return

      // 이전 검색 취소
      searchAbortRef.current?.abort()
      const controller = new AbortController()
      searchAbortRef.current = controller

      dispatch({ type: "SEARCH_START" })

      // 방어: overrideLocked가 배열이 아니면 (e.g. 실수로 이벤트 객체 전달) state 사용
      const effectiveLocked = Array.isArray(overrideLocked)
        ? overrideLocked
        : state.lockedAttrs

      // locked attribute → query 필드 매핑
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

  const selectedItem = state.items.find((i) => i.id === state.selectedItemId) ?? null

  // 키보드 네비게이션 — runSearch + step + lockedAttrs.length를 ref에 저장해
  // mount 1회만 listener 등록 (deps에 runSearch 넣으면 search state 바뀔 때마다
  // re-subscribe 발생하는 비용 회피).
  const runSearchRef = useRef(runSearch)
  const kbStateRef = useRef({ step: state.step, canAdvanceStep2: state.lockedAttrs.length > 0 })
  useEffect(() => {
    runSearchRef.current = runSearch
  }, [runSearch])
  useEffect(() => {
    kbStateRef.current = {
      step: state.step,
      canAdvanceStep2: state.lockedAttrs.length > 0,
    }
  }, [state.step, state.lockedAttrs.length])

  useEffect(() => {
    function isFormField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      )
    }

    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isFormField(e.target)) return

      const { step: currentStep, canAdvanceStep2 } = kbStateRef.current

      if (e.key === "Enter") {
        if (currentStep === "attributes" && canAdvanceStep2) {
          e.preventDefault()
          dispatch({ type: "GO_TO_REFINE" })
        } else if (currentStep === "refine") {
          e.preventDefault()
          void runSearchRef.current()
        }
      } else if (e.key === "Escape") {
        if (currentStep === "attributes") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "input" })
        } else if (currentStep === "refine") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "attributes" })
        } else if (currentStep === "results") {
          e.preventDefault()
          dispatch({ type: "GO_TO_STEP", step: "refine" })
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
                  progress={analyzeProgress}
                  progressLabel={analyzeLabel}
                />
              </motion.div>
            )}

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

            {state.step === "attributes" && selectedItem && (
              <StepAttributes
                key="attributes"
                imageUrl={state.imageUrl}
                items={state.items}
                selectedItemId={state.selectedItemId}
                lockedAttrs={state.lockedAttrs}
                onSelectItem={(id) => dispatch({ type: "SELECT_ITEM", itemId: id })}
                onToggleLock={(attr) => dispatch({ type: "TOGGLE_LOCK", attr })}
                onBack={() => dispatch({ type: "GO_TO_STEP", step: "input" })}
                onNext={() => dispatch({ type: "GO_TO_REFINE" })}
              />
            )}

            {state.step === "refine" && selectedItem && (
              <StepRefine
                key="refine"
                tolerance={state.styleTolerance}
                priceMin={state.priceMin}
                priceMax={state.priceMax}
                reason={state.refineReason}
                onSetTolerance={(v) => dispatch({ type: "SET_TOLERANCE", value: v })}
                onSetPrice={(min, max) => dispatch({ type: "SET_PRICE", min, max })}
                onSetReason={(r) => dispatch({ type: "SET_REASON", reason: r })}
                onBack={() => dispatch({ type: "GO_TO_STEP", step: "attributes" })}
                onNext={() => {
                  void runSearch()
                }}
              />
            )}

            {state.step === "results" && selectedItem && (
              <StepResults
                key="results"
                imageUrl={state.imageUrl}
                selectedItem={selectedItem}
                lockedAttrs={state.lockedAttrs}
                products={state.products}
                searching={state.searching}
                error={state.searchError}
                onRefineAgain={() => dispatch({ type: "GO_TO_STEP", step: "refine" })}
                onUnlockAttr={(attr) => {
                  // 안전성: dispatch는 비동기 배치되므로 runSearch가 stale state.lockedAttrs를
                  // 읽음. overrideLocked로 새 lock 배열을 명시적으로 전달해 우회.
                  // runSearch가 의존하는 다른 state(items, selectedItemId, gender, ...)는
                  // 이 핸들러 내에서 변경되지 않으므로 stale 안전.
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
          </AnimatePresence>


          {(state.step === "attributes" || state.step === "refine") && (
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
