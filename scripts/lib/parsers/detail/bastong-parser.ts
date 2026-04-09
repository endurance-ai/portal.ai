import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * bastong 상세 파서
 *
 * - description: #prdDetail 텍스트 (상품 설명 풍부)
 * - material: .xans-product-additional에서 "겉감 :" 또는 "Fabric-" 패턴
 * - color: select[name*="option"] option
 */
export class BastongDetailParser implements IDetailParser {
  async parse(page: Page, productUrl: string): Promise<DetailData> {
    const result: DetailData = {
      description: null,
      color: null,
      material: null,
      productCode: null,
    }

    try {
      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
      await page.waitForTimeout(800)

      // description: #prdDetail
      result.description = await page
        .$eval("#prdDetail", (el) => {
          const text = (el as HTMLElement).innerText?.trim()
          return text && text.length > 10 ? text.slice(0, 2000) : null
        })
        .catch(() => null)

      // material: .xans-product-additional에서 겉감/Fabric 패턴
      const additional = await page
        .$eval(".xans-product-additional", (el) => (el as HTMLElement).innerText?.trim() || "")
        .catch(() => "")

      if (additional) {
        const matMatch = additional.match(/겉감\s*[:：]\s*(.+)/) ||
          additional.match(/Fabric\s*[-:：]\s*(.+)/)
        if (matMatch?.[1]) {
          result.material = matMatch[1].trim().slice(0, 500)
        }
      }

      // color: option 셀렉터
      result.color = await page
        .$$eval('select[name*="option"] option', (els) => {
          const colors = els
            .map((el) => (el as HTMLElement).innerText?.trim())
            .filter((t) => t && !t.includes("선택") && !t.includes("---") && t !== "*")
          return colors.length > 0 ? [...new Set(colors)].slice(0, 20).join(", ") : null
        })
        .catch(() => null)
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
