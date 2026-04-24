import {InstagramFetchError} from "./types"

const SHORTCODE_RE = /^[a-zA-Z0-9_-]{5,30}$/
const ALLOWED_HOSTS = new Set(["instagram.com", "www.instagram.com"])
const PATH_RE = /^\/(?:([a-zA-Z0-9._]{1,30})\/)?(p|reel|reels|tv)\/([a-zA-Z0-9_-]+)\/?$/i
const MAX_INPUT_LEN = 2048

export interface ParsedPostUrl {
  shortcode: string
}

/**
 * Instagram 포스트 URL / shortcode 문자열에서 shortcode 추출.
 * 허용: "https://www.instagram.com/p/<sc>/", "https://www.instagram.com/<user>/p/<sc>/", "<sc>" (bare)
 * 거부: "/reel/", "/reels/", "/tv/" — REEL_NOT_SUPPORTED
 * 거부: instagram.com 아닌 호스트 — INVALID_URL (evilinstagram.com 같은 부분일치 차단)
 */
export function parsePostUrl(input: string): ParsedPostUrl {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new InstagramFetchError("INVALID_URL", "Empty input")
  }
  if (trimmed.length > MAX_INPUT_LEN) {
    throw new InstagramFetchError("INVALID_URL", "Input too long")
  }

  // URL처럼 보이면 파서로 엄격 검사 (호스트 일치 + 경로 매치)
  const looksLikeUrl =
    /^https?:\/\//i.test(trimmed) || trimmed.startsWith("//") || trimmed.includes("/")
  if (looksLikeUrl) {
    let url: URL
    try {
      url = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`
      )
    } catch {
      throw new InstagramFetchError("INVALID_URL", "Could not parse as URL")
    }

    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
      throw new InstagramFetchError("INVALID_URL", "Not an Instagram URL")
    }

    const pathMatch = url.pathname.match(PATH_RE)
    if (!pathMatch) {
      throw new InstagramFetchError("INVALID_URL", "Not a recognizable Instagram post path")
    }

    const kind = pathMatch[2].toLowerCase()
    if (kind === "reel" || kind === "reels") {
      throw new InstagramFetchError(
        "REEL_NOT_SUPPORTED",
        "Reels aren't supported yet — try a photo post."
      )
    }
    if (kind === "tv") {
      throw new InstagramFetchError(
        "REEL_NOT_SUPPORTED",
        "IGTV posts aren't supported yet — try a photo post."
      )
    }
    const sc = pathMatch[3]
    if (!SHORTCODE_RE.test(sc)) {
      throw new InstagramFetchError("INVALID_URL", "Malformed shortcode in URL")
    }
    return {shortcode: sc}
  }

  // bare shortcode
  if (!SHORTCODE_RE.test(trimmed)) {
    throw new InstagramFetchError("INVALID_URL", "Not a valid Instagram post URL or shortcode")
  }
  return {shortcode: trimmed}
}
