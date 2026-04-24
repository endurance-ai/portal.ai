import {
  InstagramFetchError,
  type InstagramPostDetail,
  type InstagramPostSlide,
  type InstagramTaggedUser,
} from "./types"

// web_profile_info 응답 edge.node 레이아웃 중 post 스크랩에 필요한 필드만.
interface RawCarouselChild {
  display_url?: string
  is_video?: boolean
  dimensions?: {width?: number; height?: number}
  edge_media_to_tagged_user?: {
    edges?: Array<{
      node?: {user?: {username?: string; full_name?: string}}
    }>
  }
}

interface RawEdgeNode {
  __typename?: string
  shortcode?: string
  display_url?: string
  is_video?: boolean
  dimensions?: {width?: number; height?: number}
  taken_at_timestamp?: number
  edge_media_to_caption?: {edges?: Array<{node?: {text?: string}}>}
  edge_liked_by?: {count?: number}
  edge_media_preview_like?: {count?: number}
  edge_media_to_comment?: {count?: number}
  edge_sidecar_to_children?: {edges?: Array<{node?: RawCarouselChild}>}
  edge_media_to_tagged_user?: {
    edges?: Array<{
      node?: {user?: {username?: string; full_name?: string}}
    }>
  }
  owner?: {username?: string; full_name?: string}
}

interface RawResponse {
  data?: {
    user?: {
      edge_owner_to_timeline_media?: {
        edges?: Array<{node?: RawEdgeNode}>
      }
    }
  }
}

export function findEdgeByShortcode(raw: unknown, shortcode: string): RawEdgeNode | null {
  const r = raw as RawResponse
  const edges = r?.data?.user?.edge_owner_to_timeline_media?.edges ?? []
  for (const e of edges) {
    if (e?.node?.shortcode === shortcode) return e.node
  }
  return null
}

export function extractCaptionMentions(caption: string | null): string[] {
  if (!caption) return []
  const re = /@([a-zA-Z0-9._]{1,30})/g
  const out = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(caption))) {
    const handle = m[1].toLowerCase().replace(/\.+$/, "") // trailing dot 정리
    if (handle) out.add(handle)
  }
  return [...out]
}

function parseTaggedFromNode(
  taggedEdges: RawCarouselChild["edge_media_to_tagged_user"],
  slideIndex?: number
): InstagramTaggedUser[] {
  const edges = taggedEdges?.edges ?? []
  return edges
    .map((e) => e.node?.user)
    .filter((u): u is {username?: string; full_name?: string} => !!u?.username)
    .map((u): InstagramTaggedUser => ({
      username: (u.username || "").toLowerCase(),
      fullName: u.full_name ?? null,
      slideIndex,
      source: "tag",
    }))
}

/**
 * web_profile_info edge.node → InstagramPostDetail 변환.
 * 단일 이미지면 slides 1개, 캐러셀이면 children 순서대로 slides[].
 */
export function parsePostFromEdge(
  node: RawEdgeNode,
  ownerHandleFallback: string
): InstagramPostDetail {
  if (!node.shortcode) {
    throw new InstagramFetchError("NOT_FOUND", "Post node missing shortcode")
  }

  const caption =
    node.edge_media_to_caption?.edges?.[0]?.node?.text ?? null

  const ownerHandle = (
    node.owner?.username || ownerHandleFallback
  ).toLowerCase()
  const ownerFullName = node.owner?.full_name ?? null

  const children = node.edge_sidecar_to_children?.edges ?? []
  let slides: InstagramPostSlide[]
  let mediaType: InstagramPostDetail["mediaType"]

  if (children.length > 0) {
    mediaType = "sidecar"
    slides = children
      .map((c) => c.node)
      .filter((n): n is RawCarouselChild => !!n && !!n.display_url)
      .map((n, idx): InstagramPostSlide => ({
        orderIndex: idx,
        imageUrl: n.display_url!,
        width: n.dimensions?.width ?? null,
        height: n.dimensions?.height ?? null,
        isVideo: !!n.is_video,
        taggedUsers: parseTaggedFromNode(n.edge_media_to_tagged_user, idx),
      }))
  } else {
    mediaType = node.is_video ? "video" : "image"
    if (!node.display_url) {
      throw new InstagramFetchError("NOT_FOUND", "Post has no image URL")
    }
    slides = [
      {
        orderIndex: 0,
        imageUrl: node.display_url,
        width: node.dimensions?.width ?? null,
        height: node.dimensions?.height ?? null,
        isVideo: !!node.is_video,
        taggedUsers: parseTaggedFromNode(node.edge_media_to_tagged_user, 0),
      },
    ]
  }

  // 태그된 유저 머지: 슬라이드별 tag + 캡션 @멘션.
  const taggedFlat: InstagramTaggedUser[] = slides.flatMap((s) => s.taggedUsers)
  const captionMentions = extractCaptionMentions(caption).map(
    (username): InstagramTaggedUser => ({
      username,
      fullName: null,
      source: "caption",
    })
  )

  const seen = new Map<string, InstagramTaggedUser>()
  for (const u of [...taggedFlat, ...captionMentions]) {
    if (!seen.has(u.username)) seen.set(u.username, u)
  }
  const mentionedUsers = [...seen.values()]

  return {
    shortcode: node.shortcode,
    ownerHandle,
    ownerFullName,
    mediaType,
    caption,
    likeCount:
      node.edge_liked_by?.count ??
      node.edge_media_preview_like?.count ??
      null,
    commentCount: node.edge_media_to_comment?.count ?? null,
    takenAt: node.taken_at_timestamp
      ? new Date(node.taken_at_timestamp * 1000).toISOString()
      : null,
    slides,
    mentionedUsers,
  }
}
