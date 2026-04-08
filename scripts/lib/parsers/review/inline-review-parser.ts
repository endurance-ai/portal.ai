/**
 * Inline review parser — 상세 페이지에 인라인 리뷰 링크가 있는 경우
 *
 * blankroom 등 /article/review/... 링크를 직접 방문하여
 * text, author, date, photos, body info를 추출한다.
 */

import type {Page} from "playwright"
import type {IReviewParser, Review, ReviewData, ReviewerBody} from "./types"
import {BODY_INFO_PATTERNS} from "../../body-info-extractor"

export class InlineReviewParser implements IReviewParser {
  async parse(page: Page, maxReviews: number): Promise<ReviewData> {
    const result: ReviewData = { reviewCount: 0, reviews: [] }

    try {
      // 인라인 리뷰 링크 수집 (/article/review/...)
      const inlineReviewUrls = await page.evaluate((max) => {
        const links = Array.from(document.querySelectorAll('a[href*="/article/review/"]'))
        const urls: string[] = []
        const seen = new Set<string>()
        for (const link of links) {
          const href = link.getAttribute("href") || ""
          if (seen.has(href)) continue
          seen.add(href)
          urls.push(href)
          if (urls.length >= max) break
        }
        return urls
      }, maxReviews)

      if (inlineReviewUrls.length === 0) return result

      const baseUrl = new URL(page.url()).origin
      result.reviews = await this.parseInlineReviewDetails(page, baseUrl, inlineReviewUrls)
      result.reviewCount = result.reviews.length
    } catch (err) {
      console.warn(`   ⚠️ Inline 리뷰 파싱 실패: ${(err as Error).message}`)
    }

    return result
  }

  /** 인라인 리뷰 링크를 직접 방문하여 리뷰 데이터 추출 */
  private async parseInlineReviewDetails(page: Page, baseUrl: string, urls: string[]): Promise<Review[]> {
    const reviews: Review[] = []
    const patterns = BODY_INFO_PATTERNS

    for (const rawUrl of urls) {
      try {
        const fullUrl = rawUrl.startsWith("http") ? rawUrl : baseUrl + rawUrl
        if (!fullUrl.startsWith("https://") && !fullUrl.startsWith("http://")) continue

        await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
        await page.waitForTimeout(1500)

        const data = await page.evaluate((p) => {
          // 본문 추출
          const contentEl = document.querySelector(".fr-view, .board_content, .view-content, .article-content, .entry-content")
          const content = contentEl ? (contentEl as HTMLElement).innerText?.trim() || "" : ""

          // 체형 정보 — 리뷰 본문(content) 범위에서만 매칭 (BODY_INFO_PATTERNS 사용)
          const heightMatch = content.match(new RegExp(p.height, "i"))
          const weightMatch = content.match(new RegExp(p.weight, "i"))
          const usualSizeMatch = content.match(new RegExp(p.usualSize, "i"))
          const purchasedSizeMatch = content.match(new RegExp(p.purchasedSize, "i"))
          const bodyTypeMatch = content.match(new RegExp(p.bodyType, "i"))

          // 작성자 — .board_view_info 내 .name만 (상품명 오매칭 방지)
          const authorEl = document.querySelector(".board_view_info .name, .article-writer .name, .writer .name")
          const author = authorEl ? (authorEl.textContent || "").trim() : null
          // 날짜 — 리뷰 메타 영역 우선, 없으면 본문에서
          const metaEl = document.querySelector(".board_view_info, .article-info, .view-info")
          const metaText = metaEl ? (metaEl.textContent || "") : content
          const dateMatch = metaText.match(/\d{4}-\d{2}-\d{2}/)
          const date = dateMatch ? dateMatch[0] : null

          // 사진
          const photoUrls: string[] = []
          contentEl?.querySelectorAll("img").forEach((img) => {
            const src = img.getAttribute("src") || ""
            if (src.startsWith("http")) photoUrls.push(src)
          })

          const hasBody = heightMatch || weightMatch || usualSizeMatch || purchasedSizeMatch || bodyTypeMatch

          return {
            text: content.slice(0, 1000),
            author,
            date,
            photoUrls: [...new Set(photoUrls)].slice(0, 5),
            body: hasBody ? {
              height: heightMatch?.[1]?.trim() || null,
              weight: weightMatch?.[1]?.trim() || null,
              usualSize: usualSizeMatch?.[1]?.trim() || null,
              purchasedSize: purchasedSizeMatch?.[1]?.trim() || null,
              bodyType: bodyTypeMatch?.[1]?.trim() || null,
            } : null,
          }
        }, patterns)

        if (data.text.length > 3 || data.author) {
          reviews.push({
            text: data.text,
            author: data.author,
            date: data.date,
            photoUrls: data.photoUrls,
            body: data.body as ReviewerBody | null,
          })
        }
      } catch {
        // 개별 리뷰 접근 실패 시 스킵
      }
    }

    return reviews
  }
}
