/**
 * Composite review parser — Board → Inline 폴백 체인
 *
 * Board 파서를 먼저 시도하고, 리뷰가 없으면 원래 URL로 돌아가서 Inline을 시도한다.
 */

import type {Page} from "playwright"
import type {IReviewParser, ReviewData} from "./types"
import {BoardReviewParser} from "./board-review-parser"
import {InlineReviewParser} from "./inline-review-parser"

export class CompositeReviewParser implements IReviewParser {
  private strategies: IReviewParser[]

  constructor(strategies?: IReviewParser[]) {
    this.strategies = strategies || [
      new BoardReviewParser(),
      new InlineReviewParser(),
    ]
  }

  async parse(page: Page, maxReviews: number): Promise<ReviewData> {
    const currentUrl = page.url()

    for (const strategy of this.strategies) {
      if (page.url() !== currentUrl) {
        await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
        await page.waitForTimeout(1000)
      }

      const result = await strategy.parse(page, maxReviews)
      if (result.reviews.length > 0) return result
    }

    return { reviewCount: 0, reviews: [] }
  }
}
