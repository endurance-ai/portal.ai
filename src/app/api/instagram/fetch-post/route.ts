import {NextResponse} from "next/server"
import {randomUUID} from "crypto"
import {logger} from "@/lib/logger"
import {supabase} from "@/lib/supabase"
import {parsePostUrl} from "@/lib/instagram/parse-post-url"
import {fetchPostByShortcode} from "@/lib/instagram/post-client"
import {copyPostSlides} from "@/lib/instagram/save-post-images"
import {InstagramFetchError} from "@/lib/instagram/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_SLIDES = 10

interface PostBody {
  input?: string
}

function errorCodeToStatus(code: InstagramFetchError["code"]): number {
  switch (code) {
    case "INVALID_URL":
      return 400
    case "REEL_NOT_SUPPORTED":
      return 415
    case "NOT_FOUND":
    case "POST_NOT_FOUND":
      return 404
    case "TOO_OLD":
      return 410 // deprecated, v1 잔재
    case "PRIVATE":
      return 403
    case "BLOCKED":
      return 503
    case "APIFY_FAILED":
      return 502
    case "NETWORK":
      return 502
    default:
      return 500
  }
}

interface CachedSlide {
  orderIndex: number
  r2Url: string
  originalUrl: string | null
  width: number | null
  height: number | null
  isVideo: boolean
  taggedUsers: unknown
}

interface CachedScrapeResponse {
  scrapeId: string
  shortcode: string
  ownerHandle: string
  ownerFullName: string | null
  mediaType: string
  caption: string | null
  likeCount: number | null
  commentCount: number | null
  takenAt: string | null
  mentionedUsers: unknown
  slides: CachedSlide[]
  cached: true
  imgIndex: number | null
}

/**
 * 같은 shortcode 의 최근 성공 스크랩이 있으면 그 데이터로 즉시 응답.
 * cache miss 면 null.
 */
async function lookupCachedScrape(
  shortcode: string,
  imgIndex: number | null
): Promise<CachedScrapeResponse | null> {
  const {data: scrape, error: scrapeErr} = await supabase
    .from("instagram_post_scrapes")
    .select(
      "id, shortcode, owner_handle, owner_full_name, media_type, caption, like_count, comment_count, taken_at, mentioned_users"
    )
    .eq("shortcode", shortcode)
    .eq("status", "success")
    .order("created_at", {ascending: false})
    .limit(1)
    .maybeSingle()

  if (scrapeErr || !scrape) return null

  const {data: imgs, error: imgErr} = await supabase
    .from("instagram_post_scrape_images")
    .select("order_index, r2_url, original_url, width, height, is_video, tagged_users")
    .eq("scrape_id", scrape.id)
    .order("order_index", {ascending: true})

  if (imgErr || !imgs || imgs.length === 0) return null

  return {
    scrapeId: scrape.id,
    shortcode: scrape.shortcode,
    ownerHandle: scrape.owner_handle,
    ownerFullName: scrape.owner_full_name,
    mediaType: scrape.media_type,
    caption: scrape.caption,
    likeCount: scrape.like_count,
    commentCount: scrape.comment_count,
    takenAt: scrape.taken_at,
    mentionedUsers: scrape.mentioned_users,
    slides: imgs.map((s) => ({
      orderIndex: s.order_index,
      r2Url: s.r2_url,
      originalUrl: s.original_url ?? null,
      width: s.width ?? null,
      height: s.height ?? null,
      isVideo: !!s.is_video,
      taggedUsers: s.tagged_users ?? [],
    })),
    cached: true,
    imgIndex,
  }
}

export async function POST(request: Request) {
  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({error: "Invalid JSON"}, {status: 400})
  }

  const rawInput = body.input
  if (typeof rawInput !== "string" || rawInput.length === 0) {
    return NextResponse.json({error: "Missing `input`"}, {status: 400})
  }
  if (rawInput.length > 2048) {
    return NextResponse.json({error: "Input too long"}, {status: 413})
  }
  const input = rawInput

  const reqStart = Date.now()
  let shortcode: string
  let imgIndex: number | null
  try {
    ;({shortcode, imgIndex} = parsePostUrl(input))
  } catch (err) {
    const e = err as InstagramFetchError
    logger.warn(
      `[fetch-post] ❌ parsePostUrl 실패 — code=${e.code} input="${input.slice(0, 80)}"`
    )
    return NextResponse.json(
      {error: e.message, code: e.code},
      {status: errorCodeToStatus(e.code)}
    )
  }

  logger.info(
    `[STEP 1.1][fetch-post] 진입 — input="${input.slice(0, 80)}" parsed: shortcode=${shortcode} imgIndex=${imgIndex ?? "(none)"}`
  )

  // 1) 캐시 lookup — 같은 shortcode 의 최근 성공 row 가 있으면 즉시 반환
  const cacheT0 = Date.now()
  const cached = await lookupCachedScrape(shortcode, imgIndex)
  if (cached) {
    logger.info(
      `[STEP 1.2][fetch-post] ✅ cache HIT — ${Date.now() - cacheT0}ms | slides=${cached.slides.length} | scrapeId=${cached.scrapeId} | owner=@${cached.ownerHandle} | mediaType=${cached.mediaType}`
    )
    logger.info(
      `[STEP 1.9][fetch-post] 응답 (cache) — slides=${cached.slides.length}장 (R2 URL 포함) → 클라이언트에 반환, 다음 단계 [STEP 2] analyze-post`
    )
    return NextResponse.json(cached)
  }
  logger.info(
    `[STEP 1.2][fetch-post] cache MISS — lookup ${Date.now() - cacheT0}ms → [STEP 1.3] Apify 호출 진행`
  )

  // 2) cache miss — Apify 호출
  const scrapeId = randomUUID()

  try {
    const apifyT0 = Date.now()
    const {post, raw} = await fetchPostByShortcode(shortcode)
    logger.info(
      `[STEP 1.3][fetch-post] Apify+parse 완료 — ${Date.now() - apifyT0}ms | mediaType=${post.mediaType} | slides=${post.slides.length}장 받음 | owner=@${post.ownerHandle} | caption(70)=${(post.caption ?? "").slice(0, 70).replace(/\n/g, " ")}`
    )

    const r2T0 = Date.now()
    const savedSlides = await copyPostSlides(
      scrapeId,
      post.shortcode,
      post.slides,
      MAX_SLIDES
    )
    logger.info(
      `[STEP 1.4][fetch-post] R2 copy — ${Date.now() - r2T0}ms | saved=${savedSlides.length}/${post.slides.length} (MAX_SLIDES 캡=${MAX_SLIDES}) | scrapeId=${scrapeId}`
    )

    const dbT0 = Date.now()
    const {error: scrapeErr} = await supabase.from("instagram_post_scrapes").insert({
      id: scrapeId,
      shortcode: post.shortcode,
      owner_handle: post.ownerHandle,
      owner_full_name: post.ownerFullName,
      media_type: post.mediaType,
      caption: post.caption,
      mentioned_users: post.mentionedUsers,
      like_count: post.likeCount,
      comment_count: post.commentCount,
      taken_at: post.takenAt,
      source: "direct", // Apify direct post URL fetch
      status: savedSlides.length === 0 ? "partial" : "success",
      used_proxy: false,
      raw_data: raw,
    })

    if (scrapeErr) {
      logger.error({err: scrapeErr}, `[fetch-post] ❌ instagram_post_scrapes insert 실패`)
    } else if (savedSlides.length > 0) {
      const rows = savedSlides.map((s) => ({
        scrape_id: scrapeId,
        order_index: s.orderIndex,
        r2_url: s.r2Url,
        original_url: s.originalUrl,
        width: s.slide.width,
        height: s.slide.height,
        is_video: s.slide.isVideo,
        tagged_users: s.slide.taggedUsers,
      }))
      const {error: slideErr} = await supabase
        .from("instagram_post_scrape_images")
        .insert(rows)
      if (slideErr) {
        logger.error({err: slideErr}, `[fetch-post] ❌ instagram_post_scrape_images insert 실패`)
      } else {
        logger.info(
          `[STEP 1.5][fetch-post] DB insert — ${Date.now() - dbT0}ms | scrape row + ${rows.length}개 image rows`
        )
      }
    } else {
      logger.warn(`[STEP 1.5][fetch-post] ⚠️ savedSlides=0 — scrape row 만 insert (status=partial)`)
    }

    logger.info(
      `[STEP 1.9][fetch-post] ✅ 응답 — totalSlides=${post.slides.length} copiedSlides=${savedSlides.length} | 총 ${Date.now() - reqStart}ms → 다음 단계 [STEP 2] analyze-post`
    )

    return NextResponse.json({
      scrapeId,
      shortcode: post.shortcode,
      ownerHandle: post.ownerHandle,
      ownerFullName: post.ownerFullName,
      mediaType: post.mediaType,
      caption: post.caption,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      takenAt: post.takenAt,
      mentionedUsers: post.mentionedUsers,
      slides: savedSlides.map((s) => ({
        orderIndex: s.orderIndex,
        r2Url: s.r2Url,
        originalUrl: s.originalUrl,
        width: s.slide.width,
        height: s.slide.height,
        isVideo: s.slide.isVideo,
        taggedUsers: s.slide.taggedUsers,
      })),
      stats: {
        totalSlides: post.slides.length,
        copiedSlides: savedSlides.length,
      },
      cached: false,
      imgIndex,
    })
  } catch (err) {
    if (err instanceof InstagramFetchError) {
      try {
        await supabase.from("instagram_post_scrapes").insert({
          id: scrapeId,
          shortcode,
          owner_handle: "unknown",
          media_type: "image", // fallback
          source: "direct",
          status: "failed",
          error_code: err.code,
          error_message: err.message,
        })
      } catch {
        // 로그 실패는 무시
      }
      return NextResponse.json(
        {error: err.message, code: err.code},
        {status: errorCodeToStatus(err.code)}
      )
    }
    console.error("unexpected fetch-post error", err)
    return NextResponse.json(
      {error: "Internal server error", code: "UNKNOWN"},
      {status: 500}
    )
  }
}
