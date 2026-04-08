import type {Page} from "playwright"

export interface DetailData {
  description: string | null
  color: string | null
  material: string | null
  productCode: string | null
}

export interface IDetailParser {
  parse(page: Page, productUrl: string): Promise<DetailData>
}
