import {NextResponse} from "next/server"
import {randomUUID} from "crypto"
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
    case "INVALID_HANDLE":
      return 400
    case "REEL_NOT_SUPPORTED":
      return 415
    case "NOT_FOUND":
      return 404
    case "TOO_OLD":
      return 410
    case "PRIVATE":
      return 403
    case "BLOCKED":
      return 503
    case "NETWORK":
      return 502
    default:
      return 500
  }
}

export async function POST(request: Request) {
  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({error: "Invalid JSON"}, {status: 400})
  }

  const input = (body.input || "").toString()
  if (!input) {
    return NextResponse.json({error: "Missing `input`"}, {status: 400})
  }

  let shortcode: string
  try {
    ;({shortcode} = parsePostUrl(input))
  } catch (err) {
    const e = err as InstagramFetchError
    return NextResponse.json(
      {error: e.message, code: e.code},
      {status: errorCodeToStatus(e.code)}
    )
  }

  const scrapeId = randomUUID()

  try {
    const {post, raw, usedProxy} = await fetchPostByShortcode(shortcode)

    const savedSlides = await copyPostSlides(
      scrapeId,
      post.shortcode,
      post.slides,
      MAX_SLIDES
    )

    const {error: scrapeErr} = await supabase
      .from("instagram_post_scrapes")
      .insert({
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
        source: "profile_walk",
        status: savedSlides.length === 0 ? "partial" : "success",
        used_proxy: usedProxy,
        raw_data: raw,
      })

    if (scrapeErr) {
      console.error("instagram_post_scrapes insert failed", scrapeErr)
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
      if (slideErr) console.error("instagram_post_scrape_images insert failed", slideErr)
    }

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
    })
  } catch (err) {
    if (err instanceof InstagramFetchError) {
      try {
        await supabase.from("instagram_post_scrapes").insert({
          id: scrapeId,
          shortcode,
          owner_handle: "unknown",
          media_type: "image", // fallback — 실제값 모름
          source: "profile_walk",
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
    const message = (err as Error).message || "Unknown error"
    console.error("unexpected fetch-post error", err)
    return NextResponse.json({error: message, code: "UNKNOWN"}, {status: 500})
  }
}
