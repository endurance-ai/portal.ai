import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * fr8ight 상세 파서
 *
 * 구조:
 *   .xans-product-additional.description → 브랜드 설명 + 소재 + 제조원
 *   상품명 "/" 뒤 → 색상 (e.g., "PRT1 / WHITE & NAVY")
 *   option1 = 사이즈 (L, XL, XXL)
 *   리뷰 없음
 */
export class Fr8ightDetailParser implements IDetailParser {
  async parse(page: Page, productUrl: string): Promise<DetailData> {
    const result: DetailData = {
      description: null,
      color: null,
      material: null,
      productCode: null,
    }

    try {
      await page.goto(productUrl, {waitUntil: "domcontentloaded", timeout: 15000})
      await page.waitForTimeout(800)

      const extracted = await page.evaluate(() => {
        // ─── description ───
        const descEl = document.querySelector(
          ".xans-product-additional.description, .xans-product-additional.in.description",
        )
        const rawDesc = descEl ? (descEl as HTMLElement).innerText?.trim() : null

        // 제조원/품질보증/A/S 이하 제거
        let description: string | null = null
        if (rawDesc) {
          const cutIdx = rawDesc.search(/제조원\s*[:：]|품질보증\s*[:：]|A\/S\s*문의/i)
          description = (cutIdx > 0 ? rawDesc.slice(0, cutIdx).trim() : rawDesc).slice(0, 2000)
        }

        // ─── color (상품명 "/" 뒤) ───
        let color: string | null = null
        const ogTitle = document.querySelector("meta[property=\"og:title\"]")
        if (ogTitle) {
          const title = (ogTitle as HTMLMetaElement).content || ""
          const slashIdx = title.lastIndexOf("/")
          if (slashIdx > 0) {
            color = title.slice(slashIdx + 1).trim().slice(0, 100) || null
          }
        }

        // ─── material (- 100% Cotton, Outshell 패턴) ───
        let material: string | null = null
        if (rawDesc) {
          const lines = rawDesc.split(/[-\n]/).map((l) => l.trim()).filter((l) => l)
          for (const line of lines) {
            if (/^\d+%\s/i.test(line) || /^Outshell\s/i.test(line)) {
              material = line.slice(0, 200)
              break
            }
            if (/^(?:100%|cotton|polyester|nylon|wool|linen)/i.test(line)) {
              material = line.slice(0, 200)
              break
            }
          }
        }

        return {description, color, material, productCode: null as string | null}
      })

      result.description = extracted.description
      result.color = extracted.color
      result.material = extracted.material
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
