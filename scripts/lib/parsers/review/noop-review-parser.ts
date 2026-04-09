import type {Page} from "playwright"
import type {IReviewParser, ReviewData} from "./types"

/**
 * 리뷰가 없는 플랫폼용 no-op 파서
 *
 * 불필요한 페이지 탐색을 건너뛴다.
 */
export class NoopReviewParser implements IReviewParser {
  async parse(_page: Page, _maxReviews: number): Promise<ReviewData> {
    return { reviewCount: 0, reviews: [] }
  }
}
