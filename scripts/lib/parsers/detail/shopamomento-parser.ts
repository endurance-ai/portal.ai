import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * shopamomento 상세 파서
 *
 * .xans-product-additional 구조:
 *   Product Note → 설명 → Made In → Composition → 소재 → Size Measurement
 *
 * - 설명: "Product Note" ~ "Made In" 사이
 * - 소재: "Composition" 다음 빈 줄 후 텍스트
 * - 옵션: 사이즈만 (색상 없음)
 */
export class ShopamomentoDetailParser implements IDetailParser {
  async parse(page: Page, productUrl: string): Promise<DetailData> {
    const result: DetailData = {
      description: null,
      color: null,
      material: null,
      productCode: null,
    }

    try {
      // domcontentloaded 이벤트가 발생하지 않는 사이트 → commit + waitForSelector
      await page.goto(productUrl, { waitUntil: "commit", timeout: 15000 })
      await page.waitForSelector(".xans-product-additional", { timeout: 10000 }).catch(() => null)
      await page.waitForTimeout(500)

      const additional = await page
        .$eval(".xans-product-additional", (el) => (el as HTMLElement).innerText?.trim() || "")
        .catch(() => "")

      if (additional) {
        // description: "Product Note" ~ "Made In" 사이
        const descMatch = additional.match(/Product Note\s*\n([\s\S]+?)(?:Made In|Composition|Size Measurement|$)/)
        if (descMatch?.[1]) {
          result.description = descMatch[1].trim().slice(0, 2000)
        }

        // material: "Composition" 다음 (빈 줄 포함)
        const matMatch = additional.match(/Composition\s*\n+\s*(.+)/)
        if (matMatch?.[1]) {
          result.material = matMatch[1].trim().slice(0, 500)
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
