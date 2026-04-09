import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * sienneboutique 상세 파서
 *
 * 탭 구조 (.tabs-content):
 *   [0] Description — 상품 설명
 *   [1] Fabric & Care — 소재 조성
 *   [2] Size & Fit
 *   [3] Shipping
 *
 * - 설명: .product-tabs-detail
 * - 소재: 두 번째 .tabs-content에서 FABRIC* 이후 추출
 * - 옵션: 사이즈만 (FREE) → color null
 */
export class SienneboutiqueDetailParser implements IDetailParser {
  async parse(page: Page, productUrl: string): Promise<DetailData> {
    const result: DetailData = {
      description: null,
      color: null,
      material: null,
      productCode: null,
    }

    try {
      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
      await page.waitForSelector(".product-tabs-detail", { timeout: 8000 }).catch(() => null)

      // description: .product-tabs-detail (Description 탭)
      result.description = await page
        .$eval(".product-tabs-detail", (el) => {
          const text = el.innerText?.trim()
          return text && text.length > 10 ? text.slice(0, 2000) : null
        })
        .catch(() => null)

      // material: 두 번째 .tabs-content (Fabric & Care 탭)
      result.material = await page
        .$$eval(".tabs-content", (els) => {
          if (els.length < 2) return null
          const text = (els[1] as HTMLElement).innerText?.trim() || ""
          // "FABRIC* SHELL1 : Polyester 92%..." 패턴
          const matMatch = text.match(/FABRIC\s*\*?\s*([\s\S]+?)(?:Care Guide|$)/i)
          if (matMatch?.[1]) return matMatch[1].trim().slice(0, 500)
          // 폴백: 전체 텍스트에서 Care Guide 이전까지
          const careIdx = text.indexOf("Care Guide")
          if (careIdx > 0) return text.slice(0, careIdx).trim().slice(0, 500)
          return text.length > 3 ? text.slice(0, 500) : null
        })
        .catch(() => null)
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
