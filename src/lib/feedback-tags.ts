export const FEEDBACK_TAGS = [
  { id: "style_mismatch", label: "스타일이 달라요", labelEn: "Style mismatch" },
  { id: "price_high", label: "가격대가 높아요", labelEn: "Price too high" },
  { id: "product_irrelevant", label: "상품이 안 맞아요", labelEn: "Irrelevant products" },
  { id: "few_results", label: "결과가 너무 적어요", labelEn: "Too few results" },
  { id: "category_wrong", label: "카테고리가 틀려요", labelEn: "Wrong category" },
  { id: "color_off", label: "색감이 달라요", labelEn: "Color mismatch" },
  { id: "brand_unfamiliar", label: "브랜드가 낯설어요", labelEn: "Unfamiliar brands" },
  { id: "other", label: "기타", labelEn: "Other" },
] as const

export type FeedbackTagId = (typeof FEEDBACK_TAGS)[number]["id"]

export type FeedbackRating = "up" | "down"

export interface FeedbackPayload {
  sessionId: string
  analysisId: string
  rating: FeedbackRating
  tags?: FeedbackTagId[]
  comment?: string
  email?: string
}
