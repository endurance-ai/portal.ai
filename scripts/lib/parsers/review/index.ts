import type {IReviewParser} from "./types"
import {CompositeReviewParser} from "./composite-review-parser"
import {NoopReviewParser} from "./noop-review-parser"

export type { IReviewParser, ReviewData, Review, ReviewerBody } from "./types"
export { BoardReviewParser } from "./board-review-parser"
export { InlineReviewParser } from "./inline-review-parser"
export { CompositeReviewParser } from "./composite-review-parser"
export { NoopReviewParser } from "./noop-review-parser"

const REVIEW_PARSERS: Record<string, () => IReviewParser> = {
  swallowlounge: () => new NoopReviewParser(),
  sculpstore: () => new NoopReviewParser(),
  adekuver: () => new NoopReviewParser(),
  etcseoul: () => new NoopReviewParser(),
  fr8ight: () => new NoopReviewParser(),
  havati: () => new NoopReviewParser(),
  "8division": () => new NoopReviewParser(),
  slowsteadyclub: () => new NoopReviewParser(),
  takeastreet: () => new NoopReviewParser(),
  triplestore: () => new NoopReviewParser(),
  anotheroffice: () => new NoopReviewParser(),
  eastlogue: () => new NoopReviewParser(),
  chanceclothing: () => new NoopReviewParser(),
  shopamomento: () => new NoopReviewParser(),
  bastong: () => new NoopReviewParser(),
  sienneboutique: () => new NoopReviewParser(),
  mardimercredi: () => new NoopReviewParser(),
}

export function getReviewParser(platformKey: string): IReviewParser {
  const factory = REVIEW_PARSERS[platformKey]
  return factory ? factory() : new CompositeReviewParser()
}
