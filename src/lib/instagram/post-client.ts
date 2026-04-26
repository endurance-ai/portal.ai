import "server-only"
import {logger} from "@/lib/logger"
import {fetchPostViaApify, type ApifyPostItem} from "./apify-client"
import {parseApifyPost} from "./parse-apify-response"
import {InstagramFetchError, type InstagramPostDetail} from "./types"

// v2 (2026-04-26): Apify `apify/instagram-post-scraper` 단일 호출로 풀 데이터 fetch.
// (구 v1: oEmbed → web_profile_info 체인 — owner 최근 12 한계로 폐기)
//
// 입력은 항상 IG post URL (Apify는 username 필드에 post URL도 받음 — misleading naming).
// 응답은 단일 dataset item; 빈 배열이면 POST_NOT_FOUND 로 reject.

export interface PostFetchResult {
  post: InstagramPostDetail
  raw: ApifyPostItem // raw_data 저장용 (DB jsonb 컬럼)
}

export async function fetchPostByShortcode(shortcode: string): Promise<PostFetchResult> {
  const tag = `[post-client:${shortcode}]`
  const postUrl = `https://www.instagram.com/p/${shortcode}/`

  logger.info(`${tag} Apify fetch 시작`)
  const t0 = Date.now()
  const items = await fetchPostViaApify(postUrl)
  logger.info(`${tag} Apify fetch 완료 — ${Date.now() - t0}ms | items=${items.length}`)

  if (!items || items.length === 0) {
    logger.warn(`${tag} ⚠️ POST_NOT_FOUND — Apify 빈 응답`)
    throw new InstagramFetchError(
      "POST_NOT_FOUND",
      "Apify returned no results for this post (deleted, private, or region-blocked?)"
    )
  }

  const item = items[0]
  if (item.shortCode && item.shortCode !== shortcode) {
    logger.warn(
      `${tag} ⚠️ shortcode mismatch — expected=${shortcode} got=${item.shortCode}`
    )
    throw new InstagramFetchError(
      "POST_NOT_FOUND",
      `Apify returned mismatched shortcode (expected ${shortcode}, got ${item.shortCode})`
    )
  }

  const post = parseApifyPost(item)

  return {post, raw: item}
}
