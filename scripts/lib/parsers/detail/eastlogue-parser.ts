import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * eastlogue 상세 파서
 *
 * 구조 (.xans-product-additional):
 *   Description
 *   - Outshell_1 : 100% Cotton
 *   - Outshell_2 : 70% Cotton / 30% Poly
 *   - 디테일 설명들...
 *   제품설명 / 상세설명
 *   상품명 "/" 뒤 → 색상 (e.g., "PIGMENT CHARCOAL")
 *   option1 = 사이즈
 *   리뷰 없음
 */
export class EastlogueDetailParser implements IDetailParser {
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
        const descEl = document.querySelector(".xans-product-additional")
        const rawDesc = descEl ? (descEl as HTMLElement).innerText?.trim() : null

        let description: string | null = null
        if (rawDesc) {
          // 제조원/품질보증/A/S 이하 제거
          const cutIdx = rawDesc.search(/제조원\s*[:：]|품질보증\s*[:：]|A\/S\s*문의/i)
          description = (cutIdx > 0 ? rawDesc.slice(0, cutIdx).trim() : rawDesc).slice(0, 2000)
        }

        // ─── material (Outshell 패턴) ───
        let material: string | null = null
        if (rawDesc) {
          const matLines: string[] = []
          const lines = rawDesc.split(/[-\n]/).map((l) => l.trim()).filter((l) => l)
          for (const line of lines) {
            if (/^Outshell/i.test(line) || /^Lining/i.test(line) || /^Shell/i.test(line)) {
              matLines.push(line)
            }
          }
          if (matLines.length) {
            material = matLines.join(" / ").slice(0, 200)
          } else {
            // fallback: "100% Cotton" 패턴
            for (const line of lines) {
              if (/^\d+%\s/i.test(line)) {
                material = line.slice(0, 200)
                break
              }
            }
          }
        }

        // ─── color (상품명 "/" 뒤) ───
        let color: string | null = null
        const ogTitle = document.querySelector("meta[property=\"og:title\"]")
        if (ogTitle) {
          const title = (ogTitle as HTMLMetaElement).content || ""
          const cleaned = title.replace(/\s*-\s*EASTLOGUE\s*$/i, "")
          const slashIdx = cleaned.lastIndexOf("/")
          if (slashIdx > 0) {
            color = cleaned.slice(slashIdx + 1).trim().slice(0, 100) || null
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
