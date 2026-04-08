/**
 * Board-based review parser — Cafe24 표준 보드 페이지 기반
 *
 * 1. 상세 페이지에서 리뷰 보드 링크(/board/product/list.html?...link_product_no=) 탐색
 * 2. 폴백: 탭 텍스트에서 리뷰 수 추출
 * 3. 폴백: WRITE 링크에서 board_no + product_no → 보드 URL 구성
 * 4. 보드 페이지로 이동, 테이블 행에서 author/date/text/detailUrl 파싱
 * 5. 상세 페이지 방문하여 체형 정보 추출
 */

import type {Page} from "playwright"
import type {IReviewParser, Review, ReviewData, ReviewerBody} from "./types"
import {BODY_INFO_PATTERNS} from "../../body-info-extractor"

export class BoardReviewParser implements IReviewParser {
  async parse(page: Page, maxReviews: number): Promise<ReviewData> {
    const result: ReviewData = { reviewCount: 0, reviews: [] }

    try {
      // 1) 리뷰 보드 링크 + 리뷰 수 추출
      const boardInfo = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"))
        let boardUrl: string | null = null
        let count = 0

        for (const link of links) {
          const href = link.getAttribute("href") || ""
          const text = (link.textContent || "").trim()

          // /board/product/list.html?board_no=N&link_product_no=N 패턴
          if (href.includes("/board/product/list.html") && href.includes("link_product_no")) {
            boardUrl = href
            const numMatch = text.match(/(\d+)/)
            if (numMatch) count = parseInt(numMatch[1], 10)
            break
          }
        }

        // 폴백: 탭 텍스트에서 리뷰 수 추출
        if (!count) {
          for (const link of links) {
            const text = (link.textContent || "").trim()
            const match = text.match(/(?:리뷰|후기|review)\s*(\d+)/i)
            if (match) {
              count = parseInt(match[1], 10)
              if (!boardUrl) {
                const href = link.getAttribute("href") || ""
                if (href.includes("board")) boardUrl = href
              }
              break
            }
          }
        }

        // 폴백 2: WRITE 링크에서 board_no + product_no → 보드 URL 구성
        if (!boardUrl) {
          for (const link of links) {
            const href = link.getAttribute("href") || ""
            const m = href.match(/\/board\/product\/write\.html\?board_no=(\d+)&product_no=(\d+)/)
            if (m) {
              boardUrl = "/board/product/list.html?board_no=" + m[1] + "&link_product_no=" + m[2]
              break
            }
          }
        }

        return { boardUrl, count }
      })

      result.reviewCount = boardInfo.count

      if (!boardInfo.boardUrl) return result

      // 2) 보드 페이지로 이동 (URL 검증)
      const boardUrl = boardInfo.boardUrl.startsWith("http")
        ? boardInfo.boardUrl
        : new URL(boardInfo.boardUrl, page.url()).href

      if (!boardUrl.startsWith("https://") && !boardUrl.startsWith("http://")) {
        return result
      }

      await page.goto(boardUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
      await page.waitForTimeout(2000)

      // 3) 테이블 기반 리뷰 파싱 + 상세 페이지에서 체형 정보 수집
      result.reviews = await this.parseBoardReviewsWithDetail(page, boardUrl, maxReviews)

      if (result.reviewCount === 0 && result.reviews.length > 0) {
        result.reviewCount = result.reviews.length
      }
    } catch (err) {
      console.warn(`   ⚠️ Board 리뷰 파싱 실패: ${(err as Error).message}`)
    }

    return result
  }

  /** 보드 페이지에서 리뷰 기본 정보 + 상세 링크 추출 후, 상세 페이지에서 체형 정보 수집 */
  private async parseBoardReviewsWithDetail(page: Page, boardUrl: string, max: number): Promise<Review[]> {
    // Step 1: 보드 목록에서 기본 정보 + 상세 링크 추출
    const rawReviews = await page.evaluate((maxReviews) => {
      const rows = document.querySelectorAll("table tr")
      const results: Array<{
        author: string | null; date: string | null;
        text: string; photoUrls: string[]; detailUrl: string | null;
      }> = []

      for (let i = 0; i < rows.length && results.length < maxReviews; i++) {
        const tds = rows[i].querySelectorAll("td")
        if (tds.length < 3) continue

        let author: string | null = null
        let date: string | null = null

        for (let j = 0; j < tds.length; j++) {
          const td = tds[j]
          const cls = td.className || ""
          if (cls.includes("writer")) {
            const nameEl = td.querySelector(".name")
            if (nameEl) author = (nameEl.textContent || "").trim()
            const dateMatch = (td.textContent || "").match(/\d{4}-\d{2}-\d{2}/)
            if (dateMatch) date = dateMatch[0]
          }
        }

        // 리뷰 제목 + 상세 링크
        let text = ""
        let detailUrl: string | null = null
        const commentEl = rows[i].querySelector(".comment")
        if (commentEl) {
          const link = commentEl.querySelector("a[href*='/article/']")
          if (link) {
            text = (link.textContent || "").trim()
            detailUrl = link.getAttribute("href")
          } else {
            text = (commentEl.textContent || "").trim().replace(/\s+/g, " ")
          }
        }
        if (!text && tds.length >= 3) {
          text = (tds[2].textContent || "").trim().replace(/\s+/g, " ")
        }

        const photoUrls: string[] = []
        rows[i].querySelectorAll('img[src*="review"], img[src*="board"]').forEach((img) => {
          const src = img.getAttribute("src") || ""
          if (src.startsWith("http")) photoUrls.push(src)
        })

        if (author || text.length > 5) {
          results.push({ author, date, text: text.slice(0, 1000), photoUrls: [...new Set(photoUrls)].slice(0, 5), detailUrl })
        }
      }
      return results
    }, max)

    // Step 2: 상세 페이지 방문하여 체형 정보 + 전체 본문 수집
    const baseUrl = new URL(boardUrl).origin
    const reviews: Review[] = []
    const patterns = BODY_INFO_PATTERNS

    for (const raw of rawReviews) {
      let body: ReviewerBody | null = null
      let fullText = raw.text

      if (raw.detailUrl) {
        try {
          const detailUrl = raw.detailUrl.startsWith("http") ? raw.detailUrl : baseUrl + raw.detailUrl
          if (!detailUrl.startsWith("https://") && !detailUrl.startsWith("http://")) continue
          await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
          await page.waitForTimeout(1500)

          const detail = await page.evaluate((p) => {
            const text = (document.body.textContent || "")

            // 체형 정보 추출 (BODY_INFO_PATTERNS 사용)
            const heightMatch = text.match(new RegExp(p.height, "i"))
            const weightMatch = text.match(new RegExp(p.weight, "i"))
            const usualSizeMatch = text.match(new RegExp(p.usualSize, "i"))
            const purchasedSizeMatch = text.match(new RegExp(p.purchasedSize, "i"))
            const bodyTypeMatch = text.match(new RegExp(p.bodyType, "i"))

            const hasBody = heightMatch || weightMatch || usualSizeMatch || purchasedSizeMatch || bodyTypeMatch

            // 본문 추출 (게시판 상세 영역)
            const contentEl = document.querySelector(".board_content, .view-content, .article-content, .entry-content, #bo_content")
            const content = contentEl ? (contentEl.textContent || "").trim() : ""

            return {
              body: hasBody ? {
                height: heightMatch?.[1]?.trim() || null,
                weight: weightMatch?.[1]?.trim() || null,
                usualSize: usualSizeMatch?.[1]?.trim() || null,
                purchasedSize: purchasedSizeMatch?.[1]?.trim() || null,
                bodyType: bodyTypeMatch?.[1]?.trim() || null,
              } : null,
              content: content.slice(0, 1000),
            }
          }, patterns)

          if (detail.body) body = detail.body as ReviewerBody
          if (detail.content && detail.content.length > raw.text.length) {
            fullText = detail.content
          }
        } catch {
          // 상세 페이지 접근 실패 시 기본 정보만 사용
        }
      }

      reviews.push({
        text: fullText,
        author: raw.author,
        date: raw.date,
        photoUrls: raw.photoUrls,
        body,
      })
    }

    return reviews
  }
}
