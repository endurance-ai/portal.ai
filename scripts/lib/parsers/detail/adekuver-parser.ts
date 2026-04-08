import {BaseDetailParser} from "./base-detail-parser"

export class AdekuverDetailParser extends BaseDetailParser {
  protected override descriptionSelectors = [".item.open .content"]
}
