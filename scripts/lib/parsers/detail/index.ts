export type { DetailData, IDetailParser } from "./types"
export { BaseDetailParser } from "./base-detail-parser"
export { BlankroomDetailParser } from "./blankroom-parser"
export { VisualalidDetailParser } from "./visualaid-parser"
export { AdekuverDetailParser } from "./adekuver-parser"

import type {IDetailParser} from "./types"
import {BaseDetailParser} from "./base-detail-parser"
import {BlankroomDetailParser} from "./blankroom-parser"
import {VisualalidDetailParser} from "./visualaid-parser"
import {AdekuverDetailParser} from "./adekuver-parser"

const DETAIL_PARSERS: Record<string, () => IDetailParser> = {
  blankroom: () => new BlankroomDetailParser(),
  visualaid: () => new VisualalidDetailParser(),
  adekuver: () => new AdekuverDetailParser(),
}

export function getDetailParser(platformKey: string): IDetailParser {
  const factory = DETAIL_PARSERS[platformKey]
  return factory ? factory() : new BaseDetailParser()
}
