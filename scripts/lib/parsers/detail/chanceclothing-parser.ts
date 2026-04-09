import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * chanceclothing 상세 파서
 *
 * .xans-product-additional 구조:
 *   사이즈표 → 소재 → 원산지 → 상품 설명 → 브랜드 소개 → 브랜드 품번
 *
 * - 소재: "소재\n" 다음 줄
 * - 설명: "상품 설명" 이후 텍스트
 * - 품번: "브랜드 품번 : {value}"
 * - 옵션: COLOR-SIZE 복합형 → 색상만 unique 추출
 */
export class ChanceclothingDetailParser implements IDetailParser {
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

      // .xans-product-additional 전체 텍스트에서 구조적 추출
      const additional = await page
        .$eval(".xans-product-additional", (el) => (el as HTMLElement).innerText?.trim() || "")
        .catch(() => "")

      if (additional) {
        // material: "소재" 다음 줄
        const matMatch = additional.match(/소재\s*\n\s*(.+)/)
        if (matMatch?.[1]) {
          result.material = matMatch[1].trim().slice(0, 500)
        }

        // description: "상품 설명" 이후 ~ "더보기" 또는 끝
        const descMatch = additional.match(/상품\s*설명\s*\n([\s\S]+?)(?:더보기|$)/)
        if (descMatch?.[1]) {
          result.description = descMatch[1].trim().slice(0, 2000)
        }

        // productCode: "브랜드 품번 : {value}"
        const codeMatch = additional.match(/브랜드\s*품번\s*[:：]\s*(.+)/)
        if (codeMatch?.[1]) {
          result.productCode = codeMatch[1].trim()
        }
      }

      // color: option에서 COLOR-SIZE 분리 → unique 색상
      result.color = await page
        .$$eval('select[name*="option"] option', (els) => {
          const colors = new Set<string>()
          for (const el of els) {
            const t = (el as HTMLElement).innerText?.trim() || ""
            if (!t || t.includes("선택") || t.includes("---") || t === "*") continue
            // "INDIGO-S" → "INDIGO", "BLACK-XL" → "BLACK"
            const color = t.replace(/-(XXS|XS|S|M|L|XL|XXL|2XL|3XL|\d+)$/i, "").trim()
            if (color) colors.add(color)
          }
          return colors.size > 0 ? [...colors].slice(0, 20).join(", ") : null
        })
        .catch(() => null)
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
