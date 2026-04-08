import type {IReviewParser} from "./types"
import {CompositeReviewParser} from "./composite-review-parser"

export type { IReviewParser, ReviewData, Review, ReviewerBody } from "./types"
export { BoardReviewParser } from "./board-review-parser"
export { InlineReviewParser } from "./inline-review-parser"
export { CompositeReviewParser } from "./composite-review-parser"

const REVIEW_PARSERS: Record<string, () => IReviewParser> = {
  // Platform-specific overrides go here
}

export function getReviewParser(platformKey: string): IReviewParser {
  const factory = REVIEW_PARSERS[platformKey]
  return factory ? factory() : new CompositeReviewParser()
}
