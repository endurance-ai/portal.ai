export type InstagramFetchErrorCode =
  | "INVALID_URL"
  | "REEL_NOT_SUPPORTED"
  | "NOT_FOUND"
  | "POST_NOT_FOUND"      // Apify: 삭제된 포스트 / 빈 응답
  | "PRIVATE"
  | "APIFY_FAILED"        // Apify: 5분 타임아웃, 402 결제 필요, 네트워크 등
  | "TOO_OLD"             // (deprecated, v1 잔재) — v2 Apify 전환 후 throw 안 됨
  | "BLOCKED"
  | "NETWORK"
  | "UNKNOWN"

// ── Post(단일 게시물) 스크랩 타입 — 메인 플로우 ──
// v2: Apify `apify/instagram-post-scraper` 단일 호출로 풀 데이터 fetch
// (구 v1: oEmbed → web_profile_info 체인 — TOO_OLD 한계로 폐기, 2026-04-26)

export interface InstagramTaggedUser {
  username: string
  fullName: string | null
  slideIndex?: number // 캐러셀 슬라이드에 태깅된 경우. 캡션 @멘션은 생략.
  source: "caption" | "tag"
}

export interface InstagramPostSlide {
  orderIndex: number
  imageUrl: string
  width: number | null
  height: number | null
  isVideo: boolean
  taggedUsers: InstagramTaggedUser[]
}

export interface InstagramPostDetail {
  shortcode: string
  ownerHandle: string
  ownerFullName: string | null
  mediaType: "image" | "sidecar" | "video"
  caption: string | null
  likeCount: number | null
  commentCount: number | null
  takenAt: string | null
  slides: InstagramPostSlide[]
  mentionedUsers: InstagramTaggedUser[] // 캡션 @ + 전 슬라이드 태그 머지 (중복 제거)
}

export class InstagramFetchError extends Error {
  code: InstagramFetchErrorCode
  status?: number
  constructor(code: InstagramFetchErrorCode, message: string, status?: number) {
    super(message)
    this.name = "InstagramFetchError"
    this.code = code
    this.status = status
  }
}
