/**
 * Cafe24 리뷰 파서 — 상품 상세 페이지에서 리뷰 데이터 추출
 *
 * Cafe24 리뷰 보드는 사이트마다 구조가 다를 수 있으므로
 * 셀렉터 폴백 체인으로 대응한다.
 */

import type {Page} from "playwright"

// ─── 타입 ─────────────────────────────────────────────

export interface ReviewerBody {
  height: string | null       // 키 (e.g., "170cm")
  weight: string | null       // 몸무게 (e.g., "65kg")
  usualSize: string | null    // 평소 사이즈 (e.g., "M")
  purchasedSize: string | null // 구매 사이즈
  bodyType: string | null     // 체형 (e.g., "보통")
}

export interface Review {
  rating: number | null       // 1-5 별점
  text: string                // 리뷰 본문
  author: string | null       // 작성자
  date: string | null         // 작성일
  photoUrls: string[]         // 사진 리뷰 이미지
  body: ReviewerBody | null   // 리뷰어 체형 정보 (숍에서 제공할 때만)
}

export interface ReviewData {
  reviewCount: number
  averageRating: number | null
  reviews: Review[]
}

// ─── 메인 파서 ─────────────────────────────────────────

/**
 * 상품 상세 페이지에서 리뷰 보드 링크를 찾아 리뷰를 추출한다.
 *
 * Cafe24 리뷰는 대부분 별도 보드 페이지(/board/product/list.html)에 있으므로:
 * 1. 상세 페이지에서 리뷰 보드 링크 + 리뷰 수 추출
 * 2. 보드 페이지로 이동하여 테이블 기반 리뷰 파싱
 */
export async function parseReviews(
  page: Page,
  maxReviews: number = 10,
): Promise<ReviewData> {
  const result: ReviewData = {
    reviewCount: 0,
    averageRating: null,
    reviews: [],
  }

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

      return { boardUrl, count }
    })

    result.reviewCount = boardInfo.count

    if (boardInfo.count === 0 || !boardInfo.boardUrl) {
      return result
    }

    // 2) 보드 페이지로 이동 (URL 검증)
    const boardUrl = boardInfo.boardUrl.startsWith("http")
      ? boardInfo.boardUrl
      : new URL(boardInfo.boardUrl, page.url()).href

    if (!boardUrl.startsWith("https://") && !boardUrl.startsWith("http://")) {
      return result
    }

    await page.goto(boardUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(2000)

    // 3) 테이블 기반 리뷰 파싱 (Cafe24 표준 보드)
    //    리뷰 상세 페이지 링크도 함께 추출하여 체형 정보 수집
    result.reviews = await parseBoardReviewsWithDetail(page, boardUrl, maxReviews)

    // 4) 평균 별점 계산
    const rated = result.reviews.filter((r) => r.rating !== null)
    if (rated.length > 0) {
      result.averageRating = Math.round(
        (rated.reduce((sum, r) => sum + (r.rating || 0), 0) / rated.length) * 10
      ) / 10
    }

    if (result.reviewCount === 0 && result.reviews.length > 0) {
      result.reviewCount = result.reviews.length
    }
  } catch (err) {
    console.warn(`   ⚠️ 리뷰 파싱 실패: ${(err as Error).message}`)
  }

  return result
}

/** 보드 페이지에서 리뷰 기본 정보 + 상세 링크 추출 후, 상세 페이지에서 체형 정보 수집 */
async function parseBoardReviewsWithDetail(page: Page, boardUrl: string, max: number): Promise<Review[]> {
  // Step 1: 보드 목록에서 기본 정보 + 상세 링크 추출
  const rawReviews = await page.evaluate((maxReviews) => {
    const rows = document.querySelectorAll("table tr")
    const results: Array<{
      author: string | null; date: string | null; rating: number | null;
      text: string; photoUrls: string[]; detailUrl: string | null;
    }> = []

    for (let i = 0; i < rows.length && results.length < maxReviews; i++) {
      const tds = rows[i].querySelectorAll("td")
      if (tds.length < 3) continue

      let author: string | null = null
      let date: string | null = null
      let rating: number | null = null

      for (let j = 0; j < tds.length; j++) {
        const td = tds[j]
        const cls = td.className || ""
        if (cls.includes("writer")) {
          const nameEl = td.querySelector(".name")
          if (nameEl) author = (nameEl.textContent || "").trim()
          const dateMatch = (td.textContent || "").match(/\d{4}-\d{2}-\d{2}/)
          if (dateMatch) date = dateMatch[0]
          const pointEl = td.querySelector('[class*="point"]')
          if (pointEl) {
            const inner = pointEl.querySelector("span, em, i")
            const style = inner?.getAttribute("style") || pointEl.getAttribute("style") || ""
            const widthMatch = style.match(/width:\s*(\d+)%/)
            if (widthMatch) {
              rating = Math.round(parseInt(widthMatch[1], 10) / 20)
            }
          }
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
        results.push({ author, date, rating, text: text.slice(0, 1000), photoUrls: [...new Set(photoUrls)].slice(0, 5), detailUrl })
      }
    }
    return results
  }, max)

  // Step 2: 상세 페이지 방문하여 체형 정보 + 전체 본문 수집 (최대 max개)
  const baseUrl = new URL(boardUrl).origin
  const reviews: Review[] = []

  for (const raw of rawReviews) {
    let body: ReviewerBody | null = null
    let fullText = raw.text

    if (raw.detailUrl) {
      try {
        const detailUrl = raw.detailUrl.startsWith("http") ? raw.detailUrl : baseUrl + raw.detailUrl
        if (!detailUrl.startsWith("https://") && !detailUrl.startsWith("http://")) continue
        await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
        await page.waitForTimeout(1500)

        const detail = await page.evaluate(() => {
          const text = (document.body.textContent || "")

          // 체형 정보 추출 (Cafe24 추가항목 패턴)
          const heightMatch = text.match(/(?:키|신장|Height)\s*[:：]?\s*(\d{2,3}\s*(?:cm|CM)?)/i)
          const weightMatch = text.match(/(?:몸무게|체중|Weight)\s*[:：]?\s*(\d{2,3}\s*(?:kg|KG)?)/i)
          const usualSizeMatch = text.match(/(?:평소\s*사이즈|보통\s*사이즈|Usual\s*Size)\s*[:：]?\s*([A-Z0-9]{1,5})/i)
          const purchasedSizeMatch = text.match(/(?:구매\s*사이즈|선택\s*사이즈|Purchased\s*Size|주문\s*사이즈)\s*[:：]?\s*([A-Z0-9]{1,5})/i)
          const bodyTypeMatch = text.match(/(?:체형|Body\s*Type)\s*[:：]?\s*([^\n,]{1,20})/i)

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
        })

        if (detail.body) body = detail.body as ReviewerBody
        if (detail.content && detail.content.length > raw.text.length) {
          fullText = detail.content
        }
      } catch {
        // 상세 페이지 접근 실패 시 기본 정보만 사용
      }
    }

    reviews.push({
      rating: raw.rating,
      text: fullText,
      author: raw.author,
      date: raw.date,
      photoUrls: raw.photoUrls,
      body,
    })
  }

  return reviews
}

