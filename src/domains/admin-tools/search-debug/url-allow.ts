import "server-only"

// 디버거 — 이미지 / 소셜 포스트 URL 화이트리스트.
// 어드민 입력이 ai/ 서버로 forward 되기 전에 검증해 SSRF 표면 차단 (P0-2 / P1-5).

// 소셜 포스트 호스트 (resolve-url 입력)
const SOCIAL_POST_SUFFIXES = ["instagram.com", "pinterest.com", "pin.it"]

// 이미지 CDN 호스트 (직접 임베딩 대상 이미지)
const IMAGE_CDN_SUFFIXES = [
  "cdninstagram.com",
  "fbcdn.net",
  "pinimg.com",
  "ytimg.com",
  "shopifycdn.com",
  "shopify.com",
  "cafe24.com",
  "cafe24img.com",
]

function hostMatches(host: string, suffixes: readonly string[]): boolean {
  const h = host.toLowerCase()
  return suffixes.some((s) => h === s || h.endsWith(`.${s}`))
}

export function isAllowedSocialPostUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (!["http:", "https:"].includes(u.protocol)) return false
    return hostMatches(u.hostname, SOCIAL_POST_SUFFIXES)
  } catch {
    return false
  }
}

export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (!["http:", "https:"].includes(u.protocol)) return false
    return hostMatches(u.hostname, IMAGE_CDN_SUFFIXES)
  } catch {
    return false
  }
}
