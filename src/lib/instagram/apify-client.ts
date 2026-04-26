import "server-only"
import {logger} from "@/lib/logger"
import {InstagramFetchError} from "./types"

const ACTOR_ID = "apify~instagram-post-scraper"
const RUN_SYNC_TIMEOUT_SEC = 120 // Apify 측 타임아웃 — 5분 한도 내, 단일 post는 5~10s 평균
const FETCH_TIMEOUT_MS = 130_000 // 우리 측 fetch abort 보호 (Apify timeout + α)

// Apify 응답 단일 post 페이로드 — dry-run 실측 (2026-04-26).
// 자세한 필드 매핑은 docs/plans/26-04-26-main-flow-v2.md "Apify 응답 스키마" 참조.
export interface ApifyTaggedUser {
  id: string
  username: string
  full_name?: string
  is_verified?: boolean
  profile_pic_url?: string
}

export interface ApifyChildPost {
  id: string
  shortCode: string
  url: string
  type: "Image" | "Video"
  displayUrl: string
  alt: string | null
  dimensionsHeight: number | null
  dimensionsWidth: number | null
}

export interface ApifyPostItem {
  id: string
  shortCode: string
  url: string
  type: "Image" | "Video" | "Sidecar"
  productType?: "feed" | "clips" | "igtv" | string
  caption: string | null
  hashtags: string[]
  mentions: string[]
  taggedUsers: ApifyTaggedUser[]
  displayUrl: string | null
  childPosts: ApifyChildPost[]
  dimensionsHeight: number | null
  dimensionsWidth: number | null
  videoUrl?: string | null
  videoDuration?: number | null
  audioUrl?: string | null
  ownerUsername: string
  ownerFullName: string | null
  ownerId: string | null
  timestamp: string | null
  alt: string | null
  inputUrl: string
  commentsCount?: number
  likesCount?: number
}

interface ApifyErrorBody {
  error?: {type?: string; message?: string}
}

function extractShortcodeFromUrl(url: string): string | null {
  const m = url.match(/\/p\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

/**
 * Apify `apify/instagram-post-scraper` actor 를 단일 post URL 로 동기 호출.
 * 5분 안에 응답 못 받으면 408 — 그 경우 APIFY_FAILED 로 분류.
 *
 * @returns dataset items 배열 (단일 post 입력이라 길이 1 기대)
 */
export async function fetchPostViaApify(
  postUrl: string
): Promise<ApifyPostItem[]> {
  const tag = "[apify]"
  const token = process.env.APIFY_TOKEN
  if (!token) {
    logger.error(`${tag} ❌ APIFY_TOKEN env 누락`)
    throw new InstagramFetchError("APIFY_FAILED", "APIFY_TOKEN not configured")
  }

  // 토큰을 query string 대신 Authorization header 로 보내 액세스 로그 누출 방지.
  const url =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?timeout=${RUN_SYNC_TIMEOUT_SEC}`

  const body = JSON.stringify({
    username: [postUrl],
    addParentData: false,
  })

  // PII/식별 정보 최소화 — 전체 URL 대신 shortcode만 로깅.
  const shortcodeForLog = extractShortcodeFromUrl(postUrl) ?? "(unknown)"
  logger.info(
    {tag, actor: ACTOR_ID, shortcode: shortcodeForLog, syncTimeoutSec: RUN_SYNC_TIMEOUT_SEC},
    `${tag} 호출 시작 — actor=${ACTOR_ID} shortcode=${shortcodeForLog}`
  )

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  const t0 = Date.now()

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body,
      signal: ctrl.signal,
    })
  } catch (err) {
    const elapsed = Date.now() - t0
    const errName = (err as Error).name
    const msg = (err as Error).message
    if (errName === "AbortError") {
      logger.error(
        {tag, elapsed, errName},
        `${tag} ❌ fetch abort (${FETCH_TIMEOUT_MS}ms 초과)`
      )
      throw new InstagramFetchError("APIFY_FAILED", "Apify request aborted (timeout)")
    }
    logger.error(
      {tag, elapsed, errName, msg: msg.slice(0, 200)},
      `${tag} ❌ network error: ${msg.slice(0, 200)}`
    )
    throw new InstagramFetchError("NETWORK", `Apify network error: ${msg}`)
  } finally {
    clearTimeout(timer)
  }

  const elapsed = Date.now() - t0
  logger.info(
    {tag, elapsed, status: res.status},
    `${tag} 응답 수신 — ${elapsed}ms HTTP ${res.status}`
  )

  // 408 = sync timeout (5분 초과). 402 = payment required (free credit 소진 등).
  if (res.status === 408) {
    logger.error(`${tag} ❌ 408 — Apify sync timeout (5분 초과)`)
    throw new InstagramFetchError(
      "APIFY_FAILED",
      "Apify run did not finish within timeout"
    )
  }
  if (res.status === 402) {
    logger.error(`${tag} ❌ 402 — payment required (free $5 credit 소진?)`)
    throw new InstagramFetchError(
      "APIFY_FAILED",
      "Apify payment required (free credit exhausted?)"
    )
  }
  if (res.status === 401 || res.status === 403) {
    logger.error(`${tag} ❌ ${res.status} — auth failed (APIFY_TOKEN 확인)`)
    throw new InstagramFetchError(
      "APIFY_FAILED",
      `Apify auth failed (${res.status}) — check APIFY_TOKEN`
    )
  }
  if (!res.ok) {
    let msg = `Apify HTTP ${res.status}`
    try {
      const j = (await res.json()) as ApifyErrorBody
      if (j.error?.message) msg = `${msg}: ${j.error.message}`
    } catch {
      // ignore json parse failure
    }
    logger.error({tag, status: res.status}, `${tag} ❌ ${msg}`)
    throw new InstagramFetchError("APIFY_FAILED", msg, res.status)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    logger.error(`${tag} ❌ JSON 파싱 실패 (Apify가 비-JSON 반환)`)
    throw new InstagramFetchError("APIFY_FAILED", "Apify returned non-JSON")
  }

  if (!Array.isArray(data)) {
    logger.error({tag, dataType: typeof data}, `${tag} ❌ response not array`)
    throw new InstagramFetchError("APIFY_FAILED", "Apify response not an array")
  }

  const items = data as ApifyPostItem[]

  // 핵심 메타 — 응답 구조를 한눈에
  if (items.length > 0) {
    const item = items[0]
    logger.info(
      {
        tag,
        itemsCount: items.length,
        type: item.type,
        productType: item.productType,
        shortCode: item.shortCode,
        owner: item.ownerUsername,
        slides: item.childPosts?.length ?? 0,
        taggedUsers: item.taggedUsers?.length ?? 0,
        mentions: item.mentions?.length ?? 0,
        caption: item.caption?.slice(0, 60),
      },
      `${tag} 파싱 OK — ${item.type} | shortCode=${item.shortCode} | slides=${item.childPosts?.length ?? 0} | tagged=${item.taggedUsers?.length ?? 0} | owner=@${item.ownerUsername}`
    )
  } else {
    logger.warn(`${tag} ⚠️ 응답 빈 배열 (post 삭제 / 비공개 / 지역제한 가능)`)
  }

  return items
}
