export interface InstagramProfile {
  handle: string
  fullName: string | null
  biography: string | null
  profilePicUrl: string | null
  followerCount: number | null
  followingCount: number | null
  postCount: number | null
  isPrivate: boolean
  isVerified: boolean
  externalUrl: string | null
  category: string | null
}

export interface InstagramPost {
  shortcode: string
  imageUrl: string
  caption: string | null
  likeCount: number | null
  commentCount: number | null
  takenAt: string | null
  isVideo: boolean
  width: number | null
  height: number | null
}

export interface InstagramScrapeResult {
  profile: InstagramProfile
  posts: InstagramPost[]
  raw: unknown
  usedProxy: boolean
}

export type InstagramFetchErrorCode =
  | "INVALID_HANDLE"
  | "NOT_FOUND"
  | "PRIVATE"
  | "BLOCKED"
  | "NETWORK"
  | "UNKNOWN"

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
