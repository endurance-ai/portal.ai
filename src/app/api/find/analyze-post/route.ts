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

const SLIDE_FETCH_TIMEOUT_MS = 15_000
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PostBody {
  scrapeId?: string
  /** 1-indexed (IG `?img_index=N` 매핑). 없으면 0번 슬라이드(첫 장). */
  slideIndex?: number
  userPrompt?: string
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

/**
 * 메인 플로우 v2 — 단일 슬라이드 Vision 분석.
 *
 * 입력: scrapeId + slideIndex (1-indexed). slideIndex 미지정 시 첫 슬라이드.
 * 출력: 해당 슬라이드의 VisionAnalysisResult (다중 아이템 검출 + isApparel 게이트).
 *
 * v1 (multi-slide 팬아웃 + merge) 은 폐기 — 사용자가 picker로 1장 선택 후 호출.
 */
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

  // slideIndex 입력 검증 — 파서 단계에서 1~50 범위로 가드 (parse-post-url 의 img_index 와 일관)
  let slideIndex1: number | null = null
  if (body.slideIndex != null) {
    if (!Number.isInteger(body.slideIndex) || body.slideIndex < 1 || body.slideIndex > 50) {
      return NextResponse.json(
        {error: "Invalid slideIndex (must be integer 1..50)", code: "INVALID_SLIDE_INDEX"},
        {status: 400}
      )
    }
    slideIndex1 = body.slideIndex
  }

  if (!scrapeId) {
    return NextResponse.json({error: "Missing `scrapeId`"}, {status: 400})
  }
  if (!UUID_RE.test(scrapeId)) {
    return NextResponse.json(
      {error: "Invalid scrapeId format", code: "INVALID_SCRAPE_ID"},
      {status: 400}
    )
  }

  logger.info(
    `[find/analyze-post] 시작 — scrapeId=${scrapeId} slideIndex=${slideIndex1 ?? "(default 1)"}${userPrompt ? ` userPrompt="${userPrompt.slice(0, 60)}"` : ""}`
  )

  // 1) 스크랩 메타 + 대상 슬라이드 1장 로드
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

  const {data: allSlides, error: slidesErr} = await supabase
    .from("instagram_post_scrape_images")
    .select("order_index, r2_url, is_video, tagged_users")
    .eq("scrape_id", scrapeId)
    .order("order_index", {ascending: true})

  if (slidesErr || !allSlides || allSlides.length === 0) {
    logger.warn({slidesErr}, `[find/analyze-post] ❌ slides 없음 — scrape_id=${scrapeId}`)
    return NextResponse.json(
      {error: "No slides saved for this scrape", code: "NO_SLIDES"},
      {status: 404}
    )
  }

  // slideIndex(1-indexed) → order_index(0-indexed) 매핑. null/오프 시 0번.
  const targetOrderIndex = slideIndex1 != null ? slideIndex1 - 1 : 0
  if (targetOrderIndex < 0 || targetOrderIndex >= allSlides.length) {
    return NextResponse.json(
      {
        error: `slideIndex out of range (got ${slideIndex1}, available 1..${allSlides.length})`,
        code: "SLIDE_INDEX_OUT_OF_RANGE",
        availableSlides: allSlides.length,
      },
      {status: 400}
    )
  }

  const slide = allSlides.find((s) => s.order_index === targetOrderIndex)
  if (!slide) {
    return NextResponse.json(
      {
        error: `slide at order_index=${targetOrderIndex} not found`,
        code: "SLIDE_NOT_FOUND",
      },
      {status: 404}
    )
  }

  // 2) 게이트 — 비디오 슬라이드 / SSRF 가드
  if (slide.is_video) {
    return NextResponse.json(
      {
        error: "Selected slide is a video — pick another slide.",
        code: "SLIDE_IS_VIDEO",
      },
      {status: 415}
    )
  }
  if (!isTrustedImageUrl(slide.r2_url)) {
    logger.error(
      `[find/analyze-post] ❌ SSRF 가드 — slide URL이 R2_PUBLIC_URL prefix 아님: ${slide.r2_url.slice(0, 80)}`
    )
    return NextResponse.json(
      {error: "Image storage misconfigured — contact admin", code: "R2_CONFIG_ERROR"},
      {status: 500}
    )
  }

  // 3) Vision 호출
  const tag = `[slide#${slide.order_index}]`
  let result: VisionAnalysisResult
  try {
    const {buffer, mimeType} = await fetchImageBuffer(slide.r2_url, tag)
    result = await runVisionAnalysis({
      imageBuffer: buffer,
      mimeType,
      userPrompt,
      label: `${scrape.shortcode}/${slide.order_index}`,
    })
  } catch (err) {
    const msg =
      err instanceof VisionError
        ? `${err.code}: ${err.message}`
        : (err as Error).message || "unknown"
    logger.error({tag, err: msg}, `${tag} → error`)
    return NextResponse.json(
      {error: msg, code: "VISION_FAILED"},
      {status: 502}
    )
  }

  if (!result.isApparel || result.items.length === 0) {
    logger.info(`${tag} → not apparel (or 0 items)`)
    return NextResponse.json(
      {
        error: "that's not clothes, babe. try another slide.",
        code: "NOT_APPAREL",
        slideIndex: targetOrderIndex + 1, // 응답은 1-indexed로 통일
      },
      {status: 422}
    )
  }

  logger.info(
    `[find/analyze-post] ok | items=${result.items.length} node=${result.styleNode?.primary ?? "?"} | 총 ${Date.now() - reqStart}ms`
  )

  return NextResponse.json({
    scrapeId,
    shortcode: scrape.shortcode,
    ownerHandle: scrape.owner_handle,
    caption: scrape.caption,
    mentionedUsers: scrape.mentioned_users ?? [],
    slideIndex: targetOrderIndex + 1, // 1-indexed return
    r2Url: slide.r2_url,
    result,
  })
}
