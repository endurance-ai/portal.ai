import {NextResponse} from "next/server"
import {randomUUID} from "crypto"
import {supabase} from "@/lib/supabase"
import {fetchWebProfileInfo} from "@/lib/instagram/client"
import {parseHandle} from "@/lib/instagram/parse-handle"
import {parseWebProfileInfo} from "@/lib/instagram/parse-response"
import {copyPostImages, copyProfilePic} from "@/lib/instagram/save-images"
import {InstagramFetchError} from "@/lib/instagram/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_POSTS = 12

interface PostBody {
  input?: string
}

function errorCodeToStatus(code: InstagramFetchError["code"]): number {
  switch (code) {
    case "INVALID_HANDLE":
      return 400
    case "NOT_FOUND":
      return 404
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

  let handle: string
  try {
    handle = parseHandle(input)
  } catch (err) {
    const e = err as InstagramFetchError
    return NextResponse.json(
      {error: e.message, code: e.code},
      {status: errorCodeToStatus(e.code)}
    )
  }

  const scrapeId = randomUUID()

  try {
    const {json, usedProxy} = await fetchWebProfileInfo(handle)
    const {profile, posts} = parseWebProfileInfo(json)

    const [profilePic, postImages] = await Promise.all([
      copyProfilePic(scrapeId, profile.profilePicUrl),
      copyPostImages(scrapeId, posts, MAX_POSTS),
    ])

    const {error: scrapeErr} = await supabase.from("instagram_scrapes").insert({
      id: scrapeId,
      handle: profile.handle || handle,
      source: "web_profile_info",
      status: postImages.length === 0 ? "partial" : "success",
      used_proxy: usedProxy,
      full_name: profile.fullName,
      biography: profile.biography,
      profile_pic_r2_url: profilePic?.r2Url ?? null,
      profile_pic_original_url: profile.profilePicUrl,
      follower_count: profile.followerCount,
      following_count: profile.followingCount,
      post_count: profile.postCount,
      is_private: profile.isPrivate,
      is_verified: profile.isVerified,
      external_url: profile.externalUrl,
      category: profile.category,
      raw_data: json,
    })

    if (scrapeErr) {
      console.error("instagram_scrapes insert failed", scrapeErr)
    } else if (postImages.length > 0) {
      const rows = postImages.map((img) => ({
        scrape_id: scrapeId,
        order_index: img.orderIndex,
        shortcode: img.post.shortcode || null,
        r2_url: img.r2Url,
        original_url: img.originalUrl,
        caption: img.post.caption,
        like_count: img.post.likeCount,
        comment_count: img.post.commentCount,
        taken_at: img.post.takenAt,
        is_video: img.post.isVideo,
        width: img.post.width,
        height: img.post.height,
      }))
      const {error: imgErr} = await supabase.from("instagram_scrape_images").insert(rows)
      if (imgErr) console.error("instagram_scrape_images insert failed", imgErr)
    }

    return NextResponse.json({
      scrapeId,
      handle: profile.handle || handle,
      profile: {
        ...profile,
        profilePicR2Url: profilePic?.r2Url ?? null,
      },
      posts: postImages.map((img) => ({
        orderIndex: img.orderIndex,
        shortcode: img.post.shortcode,
        r2Url: img.r2Url,
        originalUrl: img.originalUrl,
        caption: img.post.caption,
        likeCount: img.post.likeCount,
        commentCount: img.post.commentCount,
        takenAt: img.post.takenAt,
        isVideo: img.post.isVideo,
        width: img.post.width,
        height: img.post.height,
      })),
      stats: {
        totalPosts: posts.length,
        copiedPosts: postImages.length,
      },
    })
  } catch (err) {
    if (err instanceof InstagramFetchError) {
      try {
        await supabase.from("instagram_scrapes").insert({
          id: scrapeId,
          handle,
          source: "web_profile_info",
          status: "failed",
          error_message: `${err.code}: ${err.message}`,
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
    console.error("unexpected instagram fetch error", err)
    return NextResponse.json({error: message, code: "UNKNOWN"}, {status: 500})
  }
}
