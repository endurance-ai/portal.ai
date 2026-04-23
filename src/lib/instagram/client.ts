import "server-only"
import {fetch as undiciFetch, ProxyAgent, type Dispatcher} from "undici"
import {InstagramFetchError} from "./types"

const WEB_PROFILE_INFO_URL =
  "https://www.instagram.com/api/v1/users/web_profile_info/"

const IG_APP_ID = "936619743392459"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"

function buildDispatcher(): {dispatcher: Dispatcher | undefined; usedProxy: boolean} {
  const host = process.env.PROXY_HOST
  const port = process.env.PROXY_PORT
  const user = process.env.PROXY_USER
  const pass = process.env.PROXY_PASS

  if (!host || !port) {
    return {dispatcher: undefined, usedProxy: false}
  }

  const auth = user && pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : ""
  const uri = `http://${auth}${host}:${port}`
  return {dispatcher: new ProxyAgent(uri), usedProxy: true}
}

export interface FetchWebProfileResult {
  json: unknown
  usedProxy: boolean
}

export async function fetchWebProfileInfo(handle: string): Promise<FetchWebProfileResult> {
  const {dispatcher, usedProxy} = buildDispatcher()
  const url = `${WEB_PROFILE_INFO_URL}?username=${encodeURIComponent(handle)}`

  let res
  try {
    res = await undiciFetch(url, {
      method: "GET",
      dispatcher,
      headers: {
        "x-ig-app-id": IG_APP_ID,
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,ko;q=0.8",
        "accept": "*/*",
        "user-agent": USER_AGENT,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "referer": `https://www.instagram.com/${handle}/`,
      },
    })
  } catch (err) {
    throw new InstagramFetchError(
      "NETWORK",
      `Network error reaching Instagram: ${(err as Error).message}`
    )
  }

  if (res.status === 404) {
    throw new InstagramFetchError("NOT_FOUND", "Instagram account not found", 404)
  }
  if (res.status === 429 || res.status === 403) {
    throw new InstagramFetchError(
      "BLOCKED",
      `Instagram blocked the request (${res.status}). Try again later or enable proxy.`,
      res.status
    )
  }
  if (!res.ok) {
    throw new InstagramFetchError(
      "UNKNOWN",
      `Instagram returned ${res.status}`,
      res.status
    )
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new InstagramFetchError(
      "BLOCKED",
      "Instagram returned non-JSON (likely login wall). Try again later or enable proxy."
    )
  }

  return {json, usedProxy}
}

// Instagram CDN 허용 호스트 — 응답으로 받은 이미지 URL을 그대로 fetch하기 전
// SSRF 방어용 allowlist. cdninstagram.com / fbcdn.net 계열만 허용.
const ALLOWED_IMAGE_HOST = /^https:\/\/(?:[a-z0-9-]+\.)?(?:cdninstagram\.com|fbcdn\.net)\//i
const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // 15MB 상한

/**
 * 프록시(또는 직접)로 이미지 바이너리 다운로드.
 * - host allowlist로 SSRF 차단 (응답 URL을 신뢰하지 않음)
 * - content-length 헤더로 15MB 이상은 조기 차단
 * - 바디 스트림 읽는 중에도 누적 사이즈 체크
 */
export async function downloadImage(url: string): Promise<{buffer: Buffer; contentType: string}> {
  if (!ALLOWED_IMAGE_HOST.test(url)) {
    throw new InstagramFetchError("NETWORK", "Image URL host not allowed")
  }

  const {dispatcher} = buildDispatcher()
  const res = await undiciFetch(url, {
    method: "GET",
    dispatcher,
    headers: {"user-agent": USER_AGENT},
  })
  if (!res.ok) {
    throw new InstagramFetchError(
      "NETWORK",
      `Failed to download image (${res.status})`,
      res.status
    )
  }

  const lenHeader = res.headers.get("content-length")
  if (lenHeader) {
    const len = Number(lenHeader)
    if (Number.isFinite(len) && len > MAX_IMAGE_BYTES) {
      throw new InstagramFetchError("NETWORK", "Image exceeds size limit")
    }
  }

  const ab = await res.arrayBuffer()
  if (ab.byteLength > MAX_IMAGE_BYTES) {
    throw new InstagramFetchError("NETWORK", "Image exceeds size limit")
  }
  const contentType = res.headers.get("content-type") || "image/jpeg"
  return {buffer: Buffer.from(ab), contentType}
}
