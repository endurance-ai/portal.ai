import {InstagramFetchError, type InstagramPost, type InstagramProfile} from "./types"

interface RawEdgeNode {
  shortcode?: string
  display_url?: string
  thumbnail_src?: string
  is_video?: boolean
  dimensions?: {width?: number; height?: number}
  taken_at_timestamp?: number
  edge_media_to_caption?: {edges?: Array<{node?: {text?: string}}>}
  edge_liked_by?: {count?: number}
  edge_media_preview_like?: {count?: number}
  edge_media_to_comment?: {count?: number}
}

interface RawUser {
  username?: string
  full_name?: string
  biography?: string
  profile_pic_url_hd?: string
  profile_pic_url?: string
  edge_followed_by?: {count?: number}
  edge_follow?: {count?: number}
  edge_owner_to_timeline_media?: {count?: number; edges?: Array<{node?: RawEdgeNode}>}
  is_private?: boolean
  is_verified?: boolean
  external_url?: string
  category_name?: string
  business_category_name?: string
}

interface RawResponse {
  data?: {user?: RawUser | null}
}

export function parseWebProfileInfo(raw: unknown): {
  profile: InstagramProfile
  posts: InstagramPost[]
} {
  const r = raw as RawResponse
  const user = r?.data?.user
  if (!user) {
    throw new InstagramFetchError("NOT_FOUND", "Instagram returned no user data")
  }

  const profile: InstagramProfile = {
    handle: (user.username || "").toLowerCase(),
    fullName: user.full_name ?? null,
    biography: user.biography ?? null,
    profilePicUrl: user.profile_pic_url_hd ?? user.profile_pic_url ?? null,
    followerCount: user.edge_followed_by?.count ?? null,
    followingCount: user.edge_follow?.count ?? null,
    postCount: user.edge_owner_to_timeline_media?.count ?? null,
    isPrivate: !!user.is_private,
    isVerified: !!user.is_verified,
    externalUrl: user.external_url ?? null,
    category: user.category_name ?? user.business_category_name ?? null,
  }

  if (profile.isPrivate) {
    throw new InstagramFetchError("PRIVATE", "This account is private")
  }

  const edges = user.edge_owner_to_timeline_media?.edges ?? []
  const posts: InstagramPost[] = edges
    .map((edge) => edge.node)
    .filter((n): n is RawEdgeNode => !!n && !!n.display_url)
    .map((n): InstagramPost => ({
      shortcode: n.shortcode || "",
      imageUrl: n.display_url!,
      caption: n.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
      likeCount: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? null,
      commentCount: n.edge_media_to_comment?.count ?? null,
      takenAt: n.taken_at_timestamp
        ? new Date(n.taken_at_timestamp * 1000).toISOString()
        : null,
      isVideo: !!n.is_video,
      width: n.dimensions?.width ?? null,
      height: n.dimensions?.height ?? null,
    }))

  return {profile, posts}
}
