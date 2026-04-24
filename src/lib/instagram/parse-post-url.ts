import {InstagramFetchError} from "./types"

const SHORTCODE_RE = /^[a-zA-Z0-9_-]{5,30}$/

// /p/ 만 허용. /reel/ /reels/ /tv/ 는 명시적으로 reject.
const URL_RE = /instagram\.com\/(?:([a-zA-Z0-9._]{1,30})\/)?(p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i

export interface ParsedPostUrl {
  shortcode: string
}

/**
 * Instagram 포스트 URL / shortcode 문자열에서 shortcode 추출.
 * 허용: "https://www.instagram.com/p/<sc>/", "instagram.com/p/<sc>", "<sc>" (bare)
 * 거부: "/reel/", "/reels/", "/tv/" — REEL_NOT_SUPPORTED
 */
export function parsePostUrl(input: string): ParsedPostUrl {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new InstagramFetchError("INVALID_URL", "Empty input")
  }

  if (trimmed.includes("instagram.com")) {
    const match = trimmed.match(URL_RE)
    if (!match) {
      throw new InstagramFetchError("INVALID_URL", "Not a recognizable Instagram post URL")
    }
    const kind = match[2].toLowerCase()
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
    const sc = match[3]
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
