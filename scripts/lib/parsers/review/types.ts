import type {Page} from "playwright"

export interface ReviewerBody {
  height: string | null
  weight: string | null
  usualSize: string | null
  purchasedSize: string | null
  bodyType: string | null
}

export interface Review {
  text: string
  author: string | null
  date: string | null
  photoUrls: string[]
  body: ReviewerBody | null
}

export interface ReviewData {
  reviewCount: number
  reviews: Review[]
}

export interface IReviewParser {
  parse(page: Page, maxReviews: number): Promise<ReviewData>
}
