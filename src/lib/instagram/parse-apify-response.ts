import {logger} from "@/lib/logger"
import {
  type ApifyChildPost,
  type ApifyPostItem,
  type ApifyTaggedUser,
} from "./apify-client"
import {
  InstagramFetchError,
  type InstagramPostDetail,
  type InstagramPostSlide,
  type InstagramTaggedUser,
} from "./types"

/**
 * Apify `instagram-post-scraper` 응답 → 우리 InstagramPostDetail 형태로 변환.
 *
 * 주의: Apify는 per-slide taggedUsers 를 보존하지 않음 (post-level 1개로 평탄화).
 * → mentionedUsers 는 post.taggedUsers + caption mentions 머지로 빌드.
 *   slides[].taggedUsers 는 빈 배열로 채움 (스키마 호환용).
 */
export function parseApifyPost(item: ApifyPostItem): InstagramPostDetail {
  const tag = "[parse-apify]"

  if (!item.shortCode) {
    logger.error(`${tag} ❌ Apify item missing shortCode`)
    throw new InstagramFetchError("POST_NOT_FOUND", "Apify item missing shortCode")
  }

  // Reels 차단 — productType=clips 또는 caption에 reel 마커
  if (item.productType === "clips") {
    logger.warn(`${tag} ⚠️ ${item.shortCode} productType=clips → REEL_NOT_SUPPORTED`)
    throw new InstagramFetchError(
      "REEL_NOT_SUPPORTED",
      "Reels aren't supported yet — try a photo post."
    )
  }

  const mediaType: InstagramPostDetail["mediaType"] =
    item.type === "Sidecar"
      ? "sidecar"
      : item.type === "Video"
        ? "video"
        : "image"

  const slides: InstagramPostSlide[] = buildSlides(item)
  if (slides.length === 0) {
    logger.error(
      `${tag} ❌ ${item.shortCode} 사용 가능한 슬라이드 없음 (displayUrl 누락)`
    )
    throw new InstagramFetchError(
      "POST_NOT_FOUND",
      "Apify item has no usable slides (no displayUrl)"
    )
  }

  // post-level taggedUsers + caption @mentions 머지 (중복 제거)
  const mentionedUsers = mergeMentionedUsers(item)

  logger.info(
    {
      tag,
      shortCode: item.shortCode,
      mediaType,
      slidesIn: item.childPosts?.length ?? (item.displayUrl ? 1 : 0),
      slidesOut: slides.length,
      taggedUsers: item.taggedUsers?.length ?? 0,
      captionMentions: item.mentions?.length ?? 0,
      mergedMentions: mentionedUsers.length,
    },
    `${tag} ${item.shortCode} → ${mediaType} | slides=${slides.length} | mentions(merged)=${mentionedUsers.length}`
  )

  return {
    shortcode: item.shortCode,
    ownerHandle: (item.ownerUsername || "").toLowerCase(),
    ownerFullName: item.ownerFullName ?? null,
    mediaType,
    caption: item.caption ?? null,
    likeCount: item.likesCount ?? null,
    commentCount: item.commentsCount ?? null,
    takenAt: item.timestamp ?? null,
    slides,
    mentionedUsers,
  }
}

function buildSlides(item: ApifyPostItem): InstagramPostSlide[] {
  // 캐러셀 — childPosts[] 가 source of truth
  if (item.type === "Sidecar" && Array.isArray(item.childPosts) && item.childPosts.length > 0) {
    return item.childPosts
      .filter((c): c is ApifyChildPost => !!c?.displayUrl)
      .map((c, idx) => ({
        orderIndex: idx,
        imageUrl: c.displayUrl,
        width: c.dimensionsWidth ?? null,
        height: c.dimensionsHeight ?? null,
        isVideo: c.type === "Video",
        // per-slide taggedUsers 가 없으므로 빈 배열 (mentionedUsers 가 post-level 통합)
        taggedUsers: [],
      }))
  }

  // 단일 image / video — displayUrl 만
  if (item.displayUrl) {
    return [
      {
        orderIndex: 0,
        imageUrl: item.displayUrl,
        width: item.dimensionsWidth ?? null,
        height: item.dimensionsHeight ?? null,
        isVideo: item.type === "Video",
        taggedUsers: [],
      },
    ]
  }

  return []
}

function mergeMentionedUsers(item: ApifyPostItem): InstagramTaggedUser[] {
  const seen = new Map<string, InstagramTaggedUser>()

  // 1) post.taggedUsers (실제 IG 태그)
  for (const u of item.taggedUsers ?? []) {
    const username = (u.username || "").toLowerCase()
    if (!username) continue
    if (!seen.has(username)) {
      seen.set(username, toMention(u, "tag"))
    }
  }

  // 2) Apify가 캡션에서 자동 추출한 mentions
  for (const username of item.mentions ?? []) {
    const handle = (username || "").toLowerCase().replace(/\.+$/, "")
    if (!handle) continue
    if (!seen.has(handle)) {
      seen.set(handle, {username: handle, fullName: null, source: "caption"})
    }
  }

  return [...seen.values()]
}

function toMention(u: ApifyTaggedUser, source: "tag" | "caption"): InstagramTaggedUser {
  return {
    username: (u.username || "").toLowerCase(),
    fullName: u.full_name ?? null,
    source,
  }
}
