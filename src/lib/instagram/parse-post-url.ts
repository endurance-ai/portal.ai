import {InstagramFetchError} from "./types"

const SHORTCODE_RE = /^[a-zA-Z0-9_-]{5,30}$/
const ALLOWED_HOSTS = new Set(["instagram.com", "www.instagram.com"])
const PATH_RE = /^\/(?:([a-zA-Z0-9._]{1,30})\/)?(p|reel|reels|tv)\/([a-zA-Z0-9_-]+)\/?$/i
const MAX_INPUT_LEN = 2048

export interface ParsedPostUrl {
  shortcode: string
  /** IG 캐러셀 슬라이드 인덱스. URL `?img_index=N` (1-indexed) → N. 없으면 null. */
  imgIndex: number | null
}

/**
 * Instagram 포스트 URL / shortcode 문자열에서 shortcode + img_index 추출.
 * 허용: "https://www.instagram.com/p/<sc>/", "https://www.instagram.com/<user>/p/<sc>/", "<sc>" (bare)
 * 캐러셀 슬라이드 직링크: "https://www.instagram.com/p/<sc>/?img_index=N" (N=1~10)
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

    // ?img_index=N (1-indexed). 비정상 값은 null로 fallback (URL 파싱 자체는 성공시킴).
    const imgIndexRaw = url.searchParams.get("img_index")
    let imgIndex: number | null = null
    if (imgIndexRaw) {
      const n = Number(imgIndexRaw)
      if (Number.isInteger(n) && n >= 1 && n <= 50) {
        imgIndex = n
      }
    }

    return {shortcode: sc, imgIndex}
  }

  // bare shortcode
  if (!SHORTCODE_RE.test(trimmed)) {
    throw new InstagramFetchError("INVALID_URL", "Not a valid Instagram post URL or shortcode")
  }
  return {shortcode: trimmed, imgIndex: null}
}
