import {NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {
  runVisionAnalysis,
  VisionError,
  type VisionAnalysisResult,
} from "@/lib/analyze/run-vision"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_SLIDES_ANALYZED = 10
const SLIDE_FETCH_TIMEOUT_MS = 15_000
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PostBody {
  scrapeId?: string
  userPrompt?: string
}

interface SlideAnalysis {
  slideIndex: number
  r2Url: string
  status: "ok" | "skipped_not_apparel" | "error"
  error?: string
  result?: VisionAnalysisResult
}

function isTrustedImageUrl(url: string): boolean {
  const publicBase = process.env.R2_PUBLIC_URL
  if (!publicBase) return false
  return url.startsWith(publicBase)
}

async function fetchImageBuffer(
  url: string,
  tag: string
): Promise<{buffer: Buffer; mimeType: string}> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), SLIDE_FETCH_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const res = await fetch(url, {signal: ctl.signal})
    if (!res.ok) {
      logger.warn(`${tag} R2 fetch 실패 — HTTP ${res.status}`)
      throw new Error(`image fetch ${res.status}`)
    }
    const ab = await res.arrayBuffer()
    const mimeType = res.headers.get("content-type") || "image/jpeg"
    logger.info(
      `${tag} R2 fetch 완료 — ${Date.now() - t0}ms | ${ab.byteLength}B | ${mimeType}`
    )
    return {buffer: Buffer.from(ab), mimeType}
  } catch (err) {
    logger.error(
      {tag, durationMs: Date.now() - t0, err: (err as Error).message},
      `${tag} R2 fetch 예외`
    )
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  const reqStart = Date.now()
  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({error: "Invalid JSON"}, {status: 400})
  }

  const scrapeId = (body.scrapeId || "").trim()
  const userPrompt = body.userPrompt?.trim()?.slice(0, 500) || undefined

  if (!scrapeId) {
    return NextResponse.json({error: "Missing `scrapeId`"}, {status: 400})
  }
  if (!UUID_RE.test(scrapeId)) {
    // UUID 검증으로 임의 문자열이 DB 왕복 + 로그까지 흘러들어가는 걸 조기 차단.
    return NextResponse.json(
      {error: "Invalid scrapeId format", code: "INVALID_SCRAPE_ID"},
      {status: 400}
    )
  }

  logger.info(`[find/analyze-post] 시작 — scrapeId=${scrapeId}${userPrompt ? ` userPrompt="${userPrompt.slice(0, 60)}"` : ""}`)

  // 1) 스크랩 + 슬라이드 로드 (service role 쿠키 없음 — server client로만 읽힘)
  const {data: scrape, error: scrapeErr} = await supabase
    .from("instagram_post_scrapes")
    .select("id, shortcode, owner_handle, caption, media_type, mentioned_users")
    .eq("id", scrapeId)
    .single()

  if (scrapeErr || !scrape) {
    logger.warn({scrapeErr}, `[find/analyze-post] ❌ scrape 미조회 — ${scrapeId}`)
    return NextResponse.json(
      {error: "Scrape not found", code: "SCRAPE_NOT_FOUND"},
      {status: 404}
    )
  }

  const {data: slides, error: slidesErr} = await supabase
    .from("instagram_post_scrape_images")
    .select("order_index, r2_url, is_video, tagged_users")
    .eq("scrape_id", scrapeId)
    .order("order_index", {ascending: true})

  if (slidesErr || !slides || slides.length === 0) {
    logger.warn({slidesErr}, `[find/analyze-post] ❌ slides 없음 — scrape_id=${scrapeId}`)
    return NextResponse.json(
      {error: "No slides saved for this scrape", code: "NO_SLIDES"},
      {status: 404}
    )
  }

  logger.info(
    `[find/analyze-post] scrape=${scrape.shortcode} owner=@${scrape.owner_handle} media_type=${scrape.media_type} | slides(DB)=${slides.length}`
  )

  // 2) 병렬 Vision. SSRF 가드 — trusted R2만.
  const skippedBySSRF = slides.filter((s) => !s.is_video && !isTrustedImageUrl(s.r2_url))
  if (skippedBySSRF.length > 0) {
    logger.warn(
      `[find/analyze-post] ⚠️ SSRF 가드로 제외된 슬라이드 ${skippedBySSRF.length}개 — R2_PUBLIC_URL=${process.env.R2_PUBLIC_URL?.slice(0, 60) || "(env 없음)"} | 첫 url=${skippedBySSRF[0].r2_url.slice(0, 80)}`
    )
  }
  const skippedVideos = slides.filter((s) => s.is_video).length
  if (skippedVideos > 0) {
    logger.info(`[find/analyze-post] 비디오 슬라이드 ${skippedVideos}개 스킵`)
  }

  const analyzable = slides
    .slice(0, MAX_SLIDES_ANALYZED)
    .filter((s) => !s.is_video && isTrustedImageUrl(s.r2_url))

  // 전부 SSRF 가드로 제외된 경우 — R2_PUBLIC_URL 설정 오류를 NOT_APPAREL로 오분류하지 않기.
  const nonVideoCount = slides.filter((s) => !s.is_video).length
  if (analyzable.length === 0 && nonVideoCount > 0) {
    logger.error(
      `[find/analyze-post] ❌ 모든 슬라이드 SSRF 가드 탈락 — R2_PUBLIC_URL 설정 확인 필요`
    )
    return NextResponse.json(
      {
        error: "Image storage misconfigured — contact admin",
        code: "R2_CONFIG_ERROR",
      },
      {status: 500}
    )
  }

  logger.info(`[find/analyze-post] 분석 대상 ${analyzable.length}장 → 병렬 Vision 팬아웃`)

  const fanouts = await Promise.allSettled(
    analyzable.map(async (s): Promise<SlideAnalysis> => {
      const tag = `[slide#${s.order_index}]`
      try {
        const {buffer, mimeType} = await fetchImageBuffer(s.r2_url, tag)
        const result = await runVisionAnalysis({
          imageBuffer: buffer,
          mimeType,
          userPrompt,
          label: `${scrape.shortcode}/${s.order_index}`,
        })
        if (!result.isApparel) {
          logger.info(`${tag} → skipped_not_apparel`)
          return {
            slideIndex: s.order_index,
            r2Url: s.r2_url,
            status: "skipped_not_apparel",
          }
        }
        logger.info(
          `${tag} → ok | items=${result.items.length} node=${result.styleNode?.primary ?? "?"}`
        )
        return {
          slideIndex: s.order_index,
          r2Url: s.r2_url,
          status: "ok",
          result,
        }
      } catch (err) {
        const msg =
          err instanceof VisionError
            ? `${err.code}: ${err.message}`
            : (err as Error).message || "unknown"
        logger.error({tag, err: msg}, `${tag} → error`)
        return {
          slideIndex: s.order_index,
          r2Url: s.r2_url,
          status: "error",
          error: msg,
        }
      }
    })
  )

  const slideResults: SlideAnalysis[] = fanouts.map((f) =>
    f.status === "fulfilled"
      ? f.value
      : {
          slideIndex: -1,
          r2Url: "",
          status: "error" as const,
          error: (f.reason as Error)?.message || "unknown",
        }
  )

  const okSlides = slideResults.filter(
    (s): s is SlideAnalysis & {status: "ok"; result: VisionAnalysisResult} =>
      s.status === "ok"
  )
  const skippedCount = slideResults.filter(
    (s) => s.status === "skipped_not_apparel"
  ).length
  const erroredCount = slideResults.filter((s) => s.status === "error").length

  logger.info(
    `[find/analyze-post] 팬아웃 결과 — ok=${okSlides.length} skipped=${skippedCount} error=${erroredCount} | 총 ${Date.now() - reqStart}ms`
  )

  // 전부 의류 아님 → 에러.
  if (okSlides.length === 0) {
    const allNotApparel = slideResults.every(
      (s) => s.status === "skipped_not_apparel"
    )
    logger.warn(
      `[find/analyze-post] ❌ 422 반환 — ${allNotApparel ? "NOT_APPAREL (전부 비의류)" : "ANALYZE_FAILED (에러 섞임)"}`
    )
    return NextResponse.json(
      {
        error: allNotApparel
          ? "that's not clothes, babe. try another post."
          : "Could not analyze any slide in this post.",
        code: allNotApparel ? "NOT_APPAREL" : "ANALYZE_FAILED",
        slides: slideResults,
      },
      {status: 422}
    )
  }

  // 3) 아이템 머지 — 각 아이템에 slideIndex 부여, category+color+fit 기준 dedupe.
  type MergedItem = VisionAnalysisResult["items"][number] & {slideIndex: number}
  const mergedItems: MergedItem[] = []
  const seen = new Set<string>()
  for (const s of okSlides) {
    for (const it of s.result.items ?? []) {
      const key = [
        (it.category || "").toLowerCase(),
        (it.subcategory || "").toLowerCase(),
        (it.colorFamily || it.color || "").toLowerCase(),
        (it.fit || "").toLowerCase(),
      ].join("|")
      if (seen.has(key)) continue
      seen.add(key)
      mergedItems.push({...it, slideIndex: s.slideIndex})
    }
  }

  // 4) 대표 styleNode — 첫 번째 성공 슬라이드 기준(confidence 비교는 과공학).
  const primarySlide = okSlides[0].result

  return NextResponse.json({
    scrapeId,
    shortcode: scrape.shortcode,
    ownerHandle: scrape.owner_handle,
    caption: scrape.caption,
    mentionedUsers: scrape.mentioned_users ?? [],
    slides: slideResults,
    aggregated: {
      mergedItems,
      primaryStyleNode: primarySlide.styleNode ?? null,
      primaryMood: primarySlide.mood ?? null,
      primaryStyle: primarySlide.style ?? null,
      sensitivityTags: primarySlide.sensitivityTags ?? [],
      palette: primarySlide.palette ?? [],
    },
    stats: {
      totalSlides: slides.length,
      analyzed: okSlides.length,
      skippedNotApparel: slideResults.filter(
        (s) => s.status === "skipped_not_apparel"
      ).length,
      errored: slideResults.filter((s) => s.status === "error").length,
    },
  })
}
