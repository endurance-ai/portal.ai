import {InstagramFetchError} from "./types"

const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/
const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "explore",
  "stories",
  "accounts",
  "direct",
  "about",
  "developer",
  "legal",
])

/**
 * 다양한 입력 형태에서 Instagram handle만 추출한다.
 * 허용: "username", "@username", "instagram.com/username",
 *       "https://www.instagram.com/username/", "https://instagram.com/username/?hl=ko"
 */
export function parseHandle(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new InstagramFetchError("INVALID_HANDLE", "Empty input")
  }

  let candidate = trimmed

  if (candidate.includes("instagram.com")) {
    const match = candidate.match(/instagram\.com\/([^/?#]+)/i)
    if (!match) {
      throw new InstagramFetchError("INVALID_HANDLE", "Could not parse Instagram URL")
    }
    candidate = match[1]
  }

  if (candidate.startsWith("@")) candidate = candidate.slice(1)
  candidate = candidate.replace(/\/+$/, "").toLowerCase()

  if (RESERVED.has(candidate)) {
    throw new InstagramFetchError("INVALID_HANDLE", "Not a user profile URL")
  }
  if (!HANDLE_RE.test(candidate)) {
    throw new InstagramFetchError("INVALID_HANDLE", "Handle contains invalid characters")
  }

  return candidate
}
