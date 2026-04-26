export type InstagramFetchErrorCode =
  | "INVALID_URL"
  | "REEL_NOT_SUPPORTED"
  | "NOT_FOUND"
  | "PRIVATE"
  | "TOO_OLD"
  | "BLOCKED"
  | "NETWORK"
  | "UNKNOWN"

// ── Post(단일 게시물) 스크랩 타입 — /find 플로우 ──
// 파이프라인: oEmbed로 owner 확인 → web_profile_info로 owner 최근 12 포스트 중 shortcode 매칭

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
