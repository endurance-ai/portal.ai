import "server-only"
import {fetch as undiciFetch, ProxyAgent, type Dispatcher} from "undici"
import {fetchWebProfileInfo} from "./client"
import {findEdgeByShortcode, parsePostFromEdge} from "./parse-post-response"
import {InstagramFetchError, type InstagramPostDetail} from "./types"

// 무로그인 상태에서 단일 포스트 full data를 얻을 수 있는 경로가 없어
// oEmbed(author 확인) → web_profile_info(owner 최근 12 중 매칭) 체인을 씀.
// 연구 결과는 docs/plans/26-04-24-find-ig-post-scraping.md.

const OEMBED_URL = "https://www.instagram.com/api/v1/oembed/"
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"

function buildDispatcher(): {dispatcher: Dispatcher | undefined; usedProxy: boolean} {
  const host = process.env.PROXY_HOST
  const port = process.env.PROXY_PORT
  const user = process.env.PROXY_USER
  const pass = process.env.PROXY_PASS
  if (!host || !port) return {dispatcher: undefined, usedProxy: false}
  const auth =
    user && pass
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : ""
  const uri = `http://${auth}${host}:${port}`
  return {dispatcher: new ProxyAgent(uri), usedProxy: true}
}

interface OembedResponse {
  author_name?: string
  thumbnail_url?: string
  title?: string
  provider_name?: string
}

/**
 * oEmbed으로 포스트의 author_name(owner handle) + 캡션(title) 회수.
 * 상세 캐러셀 데이터는 여기서 얻을 수 없음 — owner 프로필 walk이 필요.
 */
async function fetchOembed(
  shortcode: string
): Promise<{authorName: string; caption: string | null; usedProxy: boolean}> {
  const {dispatcher, usedProxy} = buildDispatcher()
  const postUrl = `https://www.instagram.com/p/${shortcode}/`
  const url = `${OEMBED_URL}?url=${encodeURIComponent(postUrl)}`

  let res
  try {
    res = await undiciFetch(url, {
      method: "GET",
      dispatcher,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
      },
    })
  } catch (err) {
    throw new InstagramFetchError(
      "NETWORK",
      `Network error reaching Instagram oEmbed: ${(err as Error).message}`
    )
  }

  if (res.status === 404) {
    throw new InstagramFetchError(
      "NOT_FOUND",
      "No Instagram post found with that URL.",
      404
    )
  }
  if (res.status === 429 || res.status === 403) {
    throw new InstagramFetchError(
      "BLOCKED",
      `Instagram blocked the oEmbed request (${res.status}).`,
      res.status
    )
  }
  if (!res.ok) {
    throw new InstagramFetchError(
      "UNKNOWN",
      `Instagram oEmbed returned ${res.status}`,
      res.status
    )
  }

  let json: OembedResponse
  try {
    json = (await res.json()) as OembedResponse
  } catch {
    throw new InstagramFetchError(
      "BLOCKED",
      "oEmbed returned non-JSON (likely blocked)."
    )
  }

  const authorName = (json.author_name || "").toLowerCase().trim()
  if (!authorName) {
    throw new InstagramFetchError(
      "NOT_FOUND",
      "Could not identify the post's owner."
    )
  }

  return {
    authorName,
    caption: json.title ?? null,
    usedProxy,
  }
}

export interface PostFetchResult {
  post: InstagramPostDetail
  raw: unknown // 매칭된 edge.node (raw_data 저장용)
  usedProxy: boolean
}

/**
 * shortcode → InstagramPostDetail 풀 체인.
 *
 * 1) oEmbed으로 author_name 확보
 * 2) fetchWebProfileInfo(author) → 최근 12 포스트 중 shortcode 매칭
 * 3) 매칭된 노드를 InstagramPostDetail 로 파싱
 *
 * 매칭 실패 → TOO_OLD (owner 최근 12에 없음)
 */
export async function fetchPostByShortcode(
  shortcode: string
): Promise<PostFetchResult> {
  const oembed = await fetchOembed(shortcode)
  const {json: profileJson, usedProxy: profileProxy} = await fetchWebProfileInfo(
    oembed.authorName
  )

  const edge = findEdgeByShortcode(profileJson, shortcode)
  if (!edge) {
    throw new InstagramFetchError(
      "TOO_OLD",
      "We can only fetch the owner's most recent posts right now. Try a newer post."
    )
  }

  const post = parsePostFromEdge(edge, oembed.authorName)

  // oEmbed 캡션으로 보강 (web_profile_info가 잘라 보내는 경우 대비)
  if (!post.caption && oembed.caption) {
    post.caption = oembed.caption
  }

  return {
    post,
    raw: edge,
    usedProxy: oembed.usedProxy || profileProxy,
  }
}
