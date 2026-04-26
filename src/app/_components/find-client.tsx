"use client"

import {type FormEvent, useState} from "react"
import {FindResult, type FindResultData} from "./find-result"
import {RefinementBar, type RefinementPayload} from "./refinement-bar"
import {type SlideOption, SlidePicker} from "./slide-picker"
import {ItemPicker} from "./item-picker"
import type {VisionAnalysisItem, VisionAnalysisResult} from "@/lib/analyze/run-vision"

const LIME = "#D9FF00"

type Phase =
  | "idle"
  | "fetching_post"
  | "picking_slide"
  | "analyzing"
  | "picking_item"
  | "searching"
  | "refining"
  | "success"
  | "error"

interface ErrorState {
  code: string
  message: string
}

interface FetchedPost {
  scrapeId: string
  shortcode: string
  ownerHandle: string
  caption: string | null
  slides: SlideOption[]
  mentionedUsers: FindResultData["mentionedUsers"]
  imgIndex: number | null
  cached: boolean
}

interface AnalyzedSlide {
  scrapeId: string
  slideIndex1: number // 1-indexed
  slideR2Url: string
  result: VisionAnalysisResult
  shortcode: string
  ownerHandle: string
  caption: string | null
  mentionedUsers: FindResultData["mentionedUsers"]
}

export function FindClient() {
  const [value, setValue] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<ErrorState | null>(null)
  const [post, setPost] = useState<FetchedPost | null>(null)
  const [analyzed, setAnalyzed] = useState<AnalyzedSlide | null>(null)
  const [pickedItem, setPickedItem] = useState<VisionAnalysisItem | null>(null)
  const [data, setData] = useState<FindResultData | null>(null)

  // ── 1) URL 입력 → fetch-post ──────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim() || isBusy(phase)) return

    setPhase("fetching_post")
    setError(null)
    setPost(null)
    setAnalyzed(null)
    setPickedItem(null)
    setData(null)

    let fetched: FetchedPost
    try {
      const res = await fetch("/api/instagram/fetch-post", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({input: value.trim()}),
      })
      const parsed = (await res.json()) as Partial<FetchedPost> & {
        code?: string
        error?: string
      }
      if (!res.ok) {
        setPhase("error")
        setError({
          code: parsed.code || "UNKNOWN",
          message: friendlyError(parsed.code, parsed.error),
        })
        return
      }
      fetched = parsed as FetchedPost
    } catch {
      setPhase("error")
      setError({code: "NETWORK", message: friendlyError("NETWORK")})
      return
    }

    setPost(fetched)

    // imgIndex 가 URL 에 있고 유효 범위면 자동 점프
    const idx = fetched.imgIndex
    const validIdx = idx != null && idx >= 1 && idx <= fetched.slides.length
    if (validIdx) {
      await analyzeSlide(fetched, idx)
    } else {
      setPhase("picking_slide")
    }
  }

  // ── 2) 슬라이드 선택 → analyze-post ─────────────────────────────────
  async function handleSlidePick(slideIndex1: number) {
    if (!post) return
    await analyzeSlide(post, slideIndex1)
  }

  async function analyzeSlide(p: FetchedPost, slideIndex1: number) {
    setPhase("analyzing")
    setError(null)

    try {
      const res = await fetch("/api/find/analyze-post", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({scrapeId: p.scrapeId, slideIndex: slideIndex1}),
      })
      type AnalyzeJson = {
        scrapeId: string
        shortcode: string
        ownerHandle: string
        caption: string | null
        mentionedUsers: FindResultData["mentionedUsers"]
        slideIndex: number
        r2Url: string
        result: VisionAnalysisResult
      }
      const parsed = (await res.json()) as AnalyzeJson & {
        code?: string
        error?: string
      }
      if (!res.ok) {
        setPhase("error")
        setError({
          code: parsed.code || "ANALYZE_FAILED",
          message: friendlyError(parsed.code, parsed.error),
        })
        return
      }

      const a: AnalyzedSlide = {
        scrapeId: parsed.scrapeId,
        slideIndex1: parsed.slideIndex,
        slideR2Url: parsed.r2Url,
        result: parsed.result,
        shortcode: parsed.shortcode,
        ownerHandle: parsed.ownerHandle,
        caption: parsed.caption,
        mentionedUsers: parsed.mentionedUsers ?? [],
      }
      setAnalyzed(a)

      // 단일 아이템이면 자동 선택, 아니면 picker
      if (a.result.items.length === 1) {
        await runSearch(a, a.result.items[0])
      } else {
        setPhase("picking_item")
      }
    } catch {
      setPhase("error")
      setError({code: "NETWORK", message: friendlyError("NETWORK")})
    }
  }

  // ── 3) 아이템 선택 → search ────────────────────────────────────────
  async function handleItemPick(item: VisionAnalysisItem) {
    if (!analyzed) return
    await runSearch(analyzed, item)
  }

  async function runSearch(
    a: AnalyzedSlide,
    item: VisionAnalysisItem,
    refinement?: RefinementPayload
  ) {
    setPhase(refinement ? "refining" : "searching")
    setError(null)
    setPickedItem(item)

    const promptSuffix =
      refinement?.kind === "prompt" && refinement.prompt
        ? ` ${refinement.prompt}`
        : ""

    const itemPayload = {
      id: item.id || `item-${a.slideIndex1}`,
      category: item.category,
      subcategory: item.subcategory,
      fit: item.fit,
      fabric: item.fabric,
      colorFamily: item.colorFamily,
      searchQuery: `${item.searchQuery || item.name || item.category}${promptSuffix}`.trim(),
      searchQueryKo: item.searchQueryKo,
    }

    let styleNode: {primary: string; secondary?: string} | undefined
    const sn = a.result.styleNode
    if (sn?.primary) {
      if (refinement?.kind === "different-vibe" && sn.secondary) {
        styleNode = {primary: sn.secondary, secondary: sn.primary}
      } else {
        styleNode = {primary: sn.primary, secondary: sn.secondary}
      }
    }

    // taggedHandles — same-mood 일 땐 브랜드 편향 제거 (브랜드 무시)
    const taggedHandles =
      refinement?.kind === "same-mood"
        ? []
        : a.mentionedUsers
            .map((u) => u.username)
            .filter(Boolean)
            .slice(0, 20)

    const priceFilter =
      refinement?.kind === "cheaper" ? {maxPrice: 100000} : undefined

    const payload = {
      item: itemPayload,
      imageUrl: a.slideR2Url,
      taggedHandles,
      gender: a.result.style?.detectedGender,
      styleNode,
      moodTags: a.result.mood?.tags?.map((t) => t.label),
      priceFilter,
      strongMatchTolerance: 0.5,
      generalTolerance: refinement?.kind === "different-vibe" ? 0.8 : 0.5,
    }

    try {
      const res = await fetch("/api/find/search", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setPhase("error")
        setError({code: "SEARCH_FAILED", message: "Search failed. Try another piece."})
        return
      }
      const json = (await res.json()) as {
        strongMatches: FindResultData["strongMatches"]
        general: FindResultData["general"]
        resolvedBrands: FindResultData["resolvedBrands"]
      }

      // FindResultData 셰입 — slides 는 선택한 1장만 노출 (UI는 동일)
      const slidesForResult = post
        ? post.slides.filter((s) => s.orderIndex + 1 === a.slideIndex1)
        : []

      setData({
        scrapeId: a.scrapeId,
        shortcode: a.shortcode,
        ownerHandle: a.ownerHandle,
        caption: a.caption,
        slides: slidesForResult,
        mentionedUsers: a.mentionedUsers,
        mergedItems: [
          {
            category: item.category,
            subcategory: item.subcategory,
            name: item.name,
            colorFamily: item.colorFamily,
            fit: item.fit,
            slideIndex: a.slideIndex1 - 1,
          },
        ],
        strongMatches: json.strongMatches,
        general: json.general,
        resolvedBrands: json.resolvedBrands,
      })
      setPhase("success")
    } catch {
      setPhase("error")
      setError({code: "SEARCH_FAILED", message: "Search failed. Try another piece."})
    }
  }

  // ── 4) refinement bar ──────────────────────────────────────────────
  async function handleRefine(payload: RefinementPayload) {
    if (!analyzed || !pickedItem) return
    await runSearch(analyzed, pickedItem, payload)
  }

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
          disabled={isBusy(phase)}
          className="flex-1 h-[52px] px-5 bg-white border border-line text-[14px] text-ink placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors disabled:opacity-60"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={isBusy(phase) || !value.trim()}
          style={{
            backgroundColor: isBusy(phase) || !value.trim() ? "#1a1a1a" : LIME,
            color: isBusy(phase) || !value.trim() ? "#888" : "#0a0a0a",
          }}
          className="h-[52px] px-7 text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors disabled:cursor-not-allowed"
        >
          {phase === "idle" || phase === "error" || phase === "success"
            ? "snitch"
            : "snitching…"}
        </button>
      </form>

      {(phase === "fetching_post" ||
        phase === "analyzing" ||
        phase === "searching") && <PhaseIndicator phase={phase} cached={post?.cached} />}

      {phase === "error" && error && (
        <ErrorPanel error={error} onRetry={() => setPhase("idle")} />
      )}

      {phase === "picking_slide" && post && (
        <SlidePicker slides={post.slides} onPick={handleSlidePick} />
      )}

      {phase === "picking_item" && analyzed && (
        <ItemPicker
          slideR2Url={analyzed.slideR2Url}
          items={analyzed.result.items}
          onPick={handleItemPick}
        />
      )}

      {(phase === "success" || phase === "refining") && data && (
        <div className="flex flex-col gap-12">
          <FindResult data={data} />
          <RefinementBar onRefine={handleRefine} busy={phase === "refining"} />
        </div>
      )}
    </section>
  )
}

function isBusy(phase: Phase): boolean {
  return (
    phase === "fetching_post" ||
    phase === "analyzing" ||
    phase === "searching" ||
    phase === "refining"
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

function PhaseIndicator({phase, cached}: {phase: Phase; cached?: boolean}) {
  const steps = [
    {
      key: "fetching_post",
      label: cached ? "loading the post" : "scraping the post (~10s)",
    },
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

function ErrorPanel({error, onRetry}: {error: ErrorState; onRetry: () => void}) {
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
    case "POST_NOT_FOUND":
      return "couldn't find that post. it may be deleted or region-blocked."
    case "PRIVATE":
      return "this account is private — we can only read public posts."
    case "BLOCKED":
      return "instagram blocked us. try again in a minute."
    case "APIFY_FAILED":
      return "scraping service hiccup. try again in a sec."
    case "NETWORK":
      return "couldn't reach instagram. check your connection."
    case "NOT_APPAREL":
      return "that's not clothes, babe. try another slide."
    case "ANALYZE_FAILED":
    case "VISION_FAILED":
      return "couldn't read the outfit in this slide."
    case "SEARCH_FAILED":
      return "search failed. try another piece."
    case "SLIDE_INDEX_OUT_OF_RANGE":
      return "that slide doesn't exist in this post."
    case "SLIDE_IS_VIDEO":
      return "that slide is a video — pick another one."
    default:
      return fallback || "something went wrong."
  }
}
