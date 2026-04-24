"use client"

import {useState, type FormEvent} from "react"
import {FindResult, type FindResultData} from "./find-result"
import {RefinementBar, type RefinementPayload} from "./refinement-bar"

type Phase =
  | "idle"
  | "fetching_post"
  | "analyzing"
  | "searching"
  | "refining"
  | "success"
  | "error"

interface ErrorState {
  code: string
  message: string
}

interface AnalyzeContext {
  scrapeId: string
  shortcode: string
  ownerHandle: string
  caption: string | null
  slides: FindResultData["slides"]
  mentionedUsers: FindResultData["mentionedUsers"]
  mergedItems: FindResultData["mergedItems"]
  gender?: string
  styleNodePrimary?: string
  styleNodeSecondary?: string
  moodTags?: string[]
}

const LIME = "#D9FF00"

export function FindClient() {
  const [value, setValue] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<ErrorState | null>(null)
  const [ctx, setCtx] = useState<AnalyzeContext | null>(null)
  const [data, setData] = useState<FindResultData | null>(null)

  async function runSearch(
    context: AnalyzeContext,
    refinement?: RefinementPayload
  ) {
    const promptSuffix =
      refinement?.kind === "prompt" && refinement.prompt
        ? ` ${refinement.prompt}`
        : ""

    const items = context.mergedItems.map((it, idx) => ({
      id: `s${it.slideIndex ?? 0}-${idx}`,
      category: it.category,
      subcategory: it.subcategory,
      fit: it.fit,
      colorFamily: it.colorFamily,
      searchQuery: `${it.name ?? it.category}${promptSuffix}`.trim(),
    }))

    // styleNode 기본값. different-vibe는 primary↔secondary 스왑
    let styleNode: {primary: string; secondary?: string} | undefined
    if (context.styleNodePrimary) {
      if (refinement?.kind === "different-vibe" && context.styleNodeSecondary) {
        styleNode = {
          primary: context.styleNodeSecondary,
          secondary: context.styleNodePrimary,
        }
      } else {
        styleNode = {
          primary: context.styleNodePrimary,
          secondary: context.styleNodeSecondary,
        }
      }
    }

    // taggedHandles — same-mood은 브랜드 편향 제거
    const taggedHandles =
      refinement?.kind === "same-mood"
        ? []
        : context.mentionedUsers
            .map((u) => u.username)
            .filter(Boolean)
            .slice(0, 20)

    const priceFilter =
      refinement?.kind === "cheaper"
        ? {maxPrice: 100000}
        : undefined

    const payload = {
      items,
      taggedHandles,
      gender: context.gender,
      styleNode,
      moodTags: context.moodTags,
      priceFilter,
      strongMatchTolerance: 0.5,
      generalTolerance: refinement?.kind === "different-vibe" ? 0.8 : 0.5,
    }

    const searchRes = await fetch("/api/find/search", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload),
    })
    if (!searchRes.ok) {
      throw new Error("Search failed")
    }
    return (await searchRes.json()) as {
      strongMatches: FindResultData["strongMatches"]
      general: FindResultData["general"]
      resolvedBrands: FindResultData["resolvedBrands"]
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim() || phase === "fetching_post" || phase === "analyzing" || phase === "searching") return

    setPhase("fetching_post")
    setError(null)
    setData(null)
    setCtx(null)

    // 1) 포스트 스크래핑
    // 응답 shape가 유동적이라 FetchJson을 success payload 타입으로만 좁혀서 받음.
    type FetchJson = {
      scrapeId: string
      shortcode: string
      ownerHandle: string
      caption: string | null
      slides: FindResultData["slides"]
      mentionedUsers: FindResultData["mentionedUsers"]
    }
    let fetchJson: FetchJson
    try {
      const fetchRes = await fetch("/api/instagram/fetch-post", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({input: value.trim()}),
      })
      const parsed = (await fetchRes.json()) as Partial<FetchJson> & {
        code?: string
        error?: string
      }
      if (!fetchRes.ok) {
        setPhase("error")
        setError({
          code: parsed.code || "UNKNOWN",
          message: friendlyError(parsed.code, parsed.error),
        })
        return
      }
      fetchJson = parsed as FetchJson
    } catch {
      // 네트워크 단절 / 비-JSON 게이트웨이 응답(504 HTML 등) — 스피너 무한 대기 방지.
      setPhase("error")
      setError({code: "NETWORK", message: friendlyError("NETWORK")})
      return
    }

    // 2) 병렬 Vision 분석
    setPhase("analyzing")
    type AnalyzeJson = {
      aggregated?: {
        mergedItems?: FindResultData["mergedItems"]
        primaryStyle?: {detectedGender?: string}
        primaryStyleNode?: {primary: string; secondary?: string}
        primaryMood?: {tags?: Array<{label: string}>}
      }
    }
    let analyzeJson: AnalyzeJson
    try {
      const analyzeRes = await fetch("/api/find/analyze-post", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({scrapeId: fetchJson.scrapeId}),
      })
      const parsed = (await analyzeRes.json()) as AnalyzeJson & {
        code?: string
        error?: string
      }
      if (!analyzeRes.ok) {
        setPhase("error")
        setError({
          code: parsed.code || "ANALYZE_FAILED",
          message: friendlyError(parsed.code, parsed.error),
        })
        return
      }
      analyzeJson = parsed
    } catch {
      setPhase("error")
      setError({code: "NETWORK", message: friendlyError("NETWORK")})
      return
    }

    const items: FindResultData["mergedItems"] = analyzeJson.aggregated?.mergedItems ?? []
    if (items.length === 0) {
      setPhase("error")
      setError({code: "NO_ITEMS", message: "Couldn't find any clothes in this post."})
      return
    }

    const newCtx: AnalyzeContext = {
      scrapeId: fetchJson.scrapeId,
      shortcode: fetchJson.shortcode,
      ownerHandle: fetchJson.ownerHandle,
      caption: fetchJson.caption,
      slides: fetchJson.slides,
      mentionedUsers: fetchJson.mentionedUsers,
      mergedItems: items,
      gender: analyzeJson.aggregated?.primaryStyle?.detectedGender,
      styleNodePrimary: analyzeJson.aggregated?.primaryStyleNode?.primary,
      styleNodeSecondary: analyzeJson.aggregated?.primaryStyleNode?.secondary,
      moodTags: analyzeJson.aggregated?.primaryMood?.tags?.map(
        (t: {label: string}) => t.label
      ),
    }
    setCtx(newCtx)

    // 3) 상품 검색 (strong + general)
    setPhase("searching")
    try {
      const s = await runSearch(newCtx)
      setData({
        ...newCtx,
        strongMatches: s.strongMatches,
        general: s.general,
        resolvedBrands: s.resolvedBrands,
      })
      setPhase("success")
    } catch {
      setPhase("error")
      setError({code: "SEARCH_FAILED", message: "Search failed. Try another post."})
    }
  }

  async function handleRefine(payload: RefinementPayload) {
    if (!ctx || !data) return
    setPhase("refining")
    try {
      const s = await runSearch(ctx, payload)
      setData({
        ...data,
        strongMatches: s.strongMatches,
        general: s.general,
        resolvedBrands: s.resolvedBrands,
      })
      setPhase("success")
    } catch {
      setPhase("error")
      setError({code: "SEARCH_FAILED", message: "Re-search failed."})
    }
  }

  const busy =
    phase === "fetching_post" ||
    phase === "analyzing" ||
    phase === "searching" ||
    phase === "refining"

  return (
    <section className="w-full max-w-[1200px] mx-auto px-5 md:px-10 pt-10 md:pt-14 pb-32">
      <Hero />

      <form
        onSubmit={handleSubmit}
        className="flex items-stretch gap-2 max-w-[640px] mb-10"
      >
        <input
          type="url"
          placeholder="https://www.instagram.com/p/..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          className="flex-1 h-[52px] px-5 bg-white border border-line text-[14px] text-ink placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors disabled:opacity-60"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          style={{
            backgroundColor: busy || !value.trim() ? "#1a1a1a" : LIME,
            color: busy || !value.trim() ? "#888" : "#0a0a0a",
          }}
          className="h-[52px] px-7 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors disabled:cursor-not-allowed"
        >
          {phase === "idle" || phase === "error" || phase === "success" ? "snitch" : "snitching…"}
        </button>
      </form>

      {(phase === "fetching_post" || phase === "analyzing" || phase === "searching") && (
        <PhaseIndicator phase={phase} />
      )}

      {phase === "error" && error && <ErrorPanel error={error} onRetry={() => setPhase("idle")} />}

      {(phase === "success" || phase === "refining") && data && (
        <div className="flex flex-col gap-12">
          <FindResult data={data} />
          <RefinementBar onRefine={handleRefine} busy={phase === "refining"} />
        </div>
      )}
    </section>
  )
}

function Hero() {
  return (
    <div className="flex flex-col gap-3 mb-10">
      <p className="text-[10px] tracking-[0.32em] uppercase text-ink-quiet">
        {"// we snitched."}
      </p>
      <h1 className="font-sans text-[clamp(36px,6.5vw,68px)] leading-[0.95] tracking-[-0.03em] text-ink">
        here&apos;s where
        <br />
        to buy the fit.
      </h1>
      <p className="mt-3 text-[15px] md:text-[16px] leading-[1.55] text-ink-soft max-w-[520px]">
        paste any instagram post. we&apos;ll tell you where to find what
        they&apos;re wearing — even if they didn&apos;t tag it.
      </p>
    </div>
  )
}

function PhaseIndicator({phase}: {phase: Phase}) {
  const steps = [
    {key: "fetching_post", label: "doing recon on instagram"},
    {key: "analyzing", label: "reading the fit"},
    {key: "searching", label: "digging our closet"},
  ] as const
  const activeIdx = steps.findIndex((s) => s.key === phase)
  return (
    <div className="flex flex-col gap-2 border border-line bg-white px-5 py-5 max-w-[640px]">
      {steps.map((s, i) => {
        const done = i < activeIdx
        const active = i === activeIdx
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div
              className="w-4 h-4 border border-line flex items-center justify-center"
              style={{
                backgroundColor: done ? "#0a0a0a" : active ? LIME : "transparent",
              }}
            >
              {done && <span className="text-cream text-[10px]">✓</span>}
            </div>
            <span
              className={
                done
                  ? "text-[12px] text-ink-quiet line-through"
                  : active
                  ? "text-[13px] font-medium text-ink"
                  : "text-[12px] text-ink-quiet"
              }
            >
              {s.label}
              {active && "…"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ErrorPanel({
  error,
  onRetry,
}: {
  error: ErrorState
  onRetry: () => void
}) {
  return (
    <div className="border border-line bg-white px-5 py-6 max-w-[640px] flex flex-col gap-3">
      <span className="text-[10px] tracking-[0.24em] uppercase text-ink-quiet">
        {error.code}
      </span>
      <p className="text-[14px] text-ink leading-[1.55]">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="self-start mt-1 text-[11px] tracking-[0.14em] uppercase underline decoration-ink/40 underline-offset-4 hover:decoration-ink transition-colors"
      >
        try again
      </button>
    </div>
  )
}

function friendlyError(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "INVALID_URL":
      return "that's not a valid instagram post URL. try again?"
    case "REEL_NOT_SUPPORTED":
      return "reels aren't supported yet — try a photo post."
    case "NOT_FOUND":
      return "no post found with that URL."
    case "TOO_OLD":
      return "too old — we can only read the owner's most recent posts right now."
    case "PRIVATE":
      return "this account is private — we can only read public posts."
    case "BLOCKED":
      return "instagram blocked us. try again in a minute."
    case "NETWORK":
      return "couldn't reach instagram. check your connection."
    case "NOT_APPAREL":
      return "that's not clothes, babe. try another post."
    case "ANALYZE_FAILED":
      return "couldn't read the outfit in this post."
    case "SEARCH_FAILED":
      return "search failed. try another post."
    default:
      return fallback || "something went wrong."
  }
}
