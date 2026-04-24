import "server-only"
import {uploadBufferAtKey} from "@/lib/r2"
import {downloadImage} from "./client"
import type {InstagramPostSlide} from "./types"

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png"
  if (ct.includes("webp")) return "webp"
  if (ct.includes("heic")) return "heic"
  return "jpg"
}

export interface SavedSlide {
  orderIndex: number
  originalUrl: string
  r2Url: string
  contentType: string
  slide: InstagramPostSlide
}

/**
 * 포스트 슬라이드들을 병렬로 R2 복사. 개별 실패는 건너뛰고 성공분만 반환.
 * 경로: instagram-posts/<scrapeId>/<idx>-<shortcode>.<ext>
 */
export async function copyPostSlides(
  scrapeId: string,
  shortcode: string,
  slides: InstagramPostSlide[],
  limit = 10
): Promise<SavedSlide[]> {
  const targets = slides.slice(0, limit)
  const results = await Promise.allSettled(
    targets.map(async (slide): Promise<SavedSlide> => {
      const {buffer, contentType} = await downloadImage(slide.imageUrl)
      const ext = extFromContentType(contentType)
      const key = `instagram-posts/${scrapeId}/${String(slide.orderIndex).padStart(
        2,
        "0"
      )}-${shortcode}.${ext}`
      const r2Url = await uploadBufferAtKey(buffer, key, contentType)
      return {
        orderIndex: slide.orderIndex,
        originalUrl: slide.imageUrl,
        r2Url,
        contentType,
        slide,
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<SavedSlide> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => a.orderIndex - b.orderIndex)
}
