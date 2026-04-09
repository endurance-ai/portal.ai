export type { DetailData, IDetailParser } from "./types"
export { BaseDetailParser } from "./base-detail-parser"
export { BlankroomDetailParser } from "./blankroom-parser"
export { VisualalidDetailParser } from "./visualaid-parser"
export { AdekuverDetailParser } from "./adekuver-parser"
export { SwallowloungeDetailParser } from "./swallowlounge-parser"
export { RoughsideDetailParser } from "./roughside-parser"
export { SculpstoreDetailParser } from "./sculpstore-parser"
export { Fr8ightDetailParser } from "./fr8ight-parser"
export { EtcseoulDetailParser } from "./etcseoul-parser"
export { HavatiDetailParser } from "./havati-parser"
export { EightDivisionDetailParser } from "./8division-parser"
export { SlowsteadyclubDetailParser } from "./slowsteadyclub-parser"
export { TakeastreetDetailParser } from "./takeastreet-parser"
export { TriplestoreDetailParser } from "./triplestore-parser"
export { AnotherofficeDetailParser } from "./anotheroffice-parser"
export { EastlogueDetailParser } from "./eastlogue-parser"
export { ChanceclothingDetailParser } from "./chanceclothing-parser"
export { ShopamomentoDetailParser } from "./shopamomento-parser"
export { BastongDetailParser } from "./bastong-parser"
export { SienneboutiqueDetailParser } from "./sienneboutique-parser"

import type {IDetailParser} from "./types"
import {BaseDetailParser} from "./base-detail-parser"
import {BlankroomDetailParser} from "./blankroom-parser"
import {VisualalidDetailParser} from "./visualaid-parser"
import {AdekuverDetailParser} from "./adekuver-parser"
import {SwallowloungeDetailParser} from "./swallowlounge-parser"
import {RoughsideDetailParser} from "./roughside-parser"
import {SculpstoreDetailParser} from "./sculpstore-parser"
import {Fr8ightDetailParser} from "./fr8ight-parser"
import {EtcseoulDetailParser} from "./etcseoul-parser"
import {HavatiDetailParser} from "./havati-parser"
import {EightDivisionDetailParser} from "./8division-parser"
import {SlowsteadyclubDetailParser} from "./slowsteadyclub-parser"
import {TakeastreetDetailParser} from "./takeastreet-parser"
import {TriplestoreDetailParser} from "./triplestore-parser"
import {AnotherofficeDetailParser} from "./anotheroffice-parser"
import {EastlogueDetailParser} from "./eastlogue-parser"
import {ChanceclothingDetailParser} from "./chanceclothing-parser"
import {ShopamomentoDetailParser} from "./shopamomento-parser"
import {BastongDetailParser} from "./bastong-parser"
import {SienneboutiqueDetailParser} from "./sienneboutique-parser"

const DETAIL_PARSERS: Record<string, () => IDetailParser> = {
  blankroom: () => new BlankroomDetailParser(),
  visualaid: () => new VisualalidDetailParser(),
  adekuver: () => new AdekuverDetailParser(),
  swallowlounge: () => new SwallowloungeDetailParser(),
  roughside: () => new RoughsideDetailParser(),
  sculpstore: () => new SculpstoreDetailParser(),
  fr8ight: () => new Fr8ightDetailParser(),
  etcseoul: () => new EtcseoulDetailParser(),
  havati: () => new HavatiDetailParser(),
  "8division": () => new EightDivisionDetailParser(),
  slowsteadyclub: () => new SlowsteadyclubDetailParser(),
  takeastreet: () => new TakeastreetDetailParser(),
  triplestore: () => new TriplestoreDetailParser(),
  anotheroffice: () => new AnotherofficeDetailParser(),
  eastlogue: () => new EastlogueDetailParser(),
  chanceclothing: () => new ChanceclothingDetailParser(),
  shopamomento: () => new ShopamomentoDetailParser(),
  bastong: () => new BastongDetailParser(),
  sienneboutique: () => new SienneboutiqueDetailParser(),
}

export function getDetailParser(platformKey: string): IDetailParser {
  const factory = DETAIL_PARSERS[platformKey]
  return factory ? factory() : new BaseDetailParser()
}
