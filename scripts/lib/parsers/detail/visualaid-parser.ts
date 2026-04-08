import {BaseDetailParser} from "./base-detail-parser"

export class VisualalidDetailParser extends BaseDetailParser {
  protected override descriptionSelectors = [".tab_wrap"]
}
