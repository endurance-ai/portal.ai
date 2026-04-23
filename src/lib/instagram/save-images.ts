import "server-only"
import {uploadBufferAtKey} from "@/lib/r2"
import {downloadImage} from "./client"
import type {InstagramPost} from "./types"

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png"
  if (ct.includes("webp")) return "webp"
  if (ct.includes("heic")) return "heic"
  return "jpg"
}

export interface SavedImage {
  originalUrl: string
  r2Url: string
  contentType: string
}

/**
 * 프로필 사진을 R2에 복사.
 */
export async function copyProfilePic(
  scrapeId: string,
  originalUrl: string | null
): Promise<SavedImage | null> {
  if (!originalUrl) return null
  try {
    const {buffer, contentType} = await downloadImage(originalUrl)
    const ext = extFromContentType(contentType)
    const key = `instagram/${scrapeId}/profile.${ext}`
    const r2Url = await uploadBufferAtKey(buffer, key, contentType)
    return {originalUrl, r2Url, contentType}
  } catch {
    return null
  }
}

export interface SavedPostImage extends SavedImage {
  post: InstagramPost
  orderIndex: number
}

/**
 * 포스트 이미지들을 병렬로 R2 복사. 개별 실패는 무시하고 성공분만 반환.
 */
export async function copyPostImages(
  scrapeId: string,
  posts: InstagramPost[],
  limit = 9
): Promise<SavedPostImage[]> {
  const targets = posts.slice(0, limit)
  const results = await Promise.allSettled(
    targets.map(async (post, idx): Promise<SavedPostImage> => {
      const {buffer, contentType} = await downloadImage(post.imageUrl)
      const ext = extFromContentType(contentType)
      const slug = post.shortcode || `idx${idx}`
      const key = `instagram/${scrapeId}/${String(idx).padStart(2, "0")}-${slug}.${ext}`
      const r2Url = await uploadBufferAtKey(buffer, key, contentType)
      return {
        originalUrl: post.imageUrl,
        r2Url,
        contentType,
        post,
        orderIndex: idx,
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<SavedPostImage> => r.status === "fulfilled")
    .map((r) => r.value)
}
