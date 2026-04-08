import {BaseDetailParser} from "./base-detail-parser"

export class BlankroomDetailParser extends BaseDetailParser {
  protected override descriptionSelectors = [".product-description"]
}
