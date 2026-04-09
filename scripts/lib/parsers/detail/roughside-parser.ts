import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * roughside 상세 파서
 *
 * 구조:
 *   ul.prd-detail-desc-list → 설명 + 소재 (Shell/Lining 패턴)
 *   div.title-wrapper("상품 색상") 형제 → 색상
 *   option1 = 사이즈 (1,2,3,4)
 */
export class RoughsideDetailParser implements IDetailParser {
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
        const descEl = document.querySelector("ul.prd-detail-desc-list")
        const rawDesc = descEl ? (descEl as HTMLElement).innerText?.trim() : null

        // 설명에서 제조사/제조년월/Made in 이하 제거
        let description: string | null = null
        if (rawDesc) {
          const cutIdx = rawDesc.search(/제조사\s*[:：]|제조년월|Made in /i)
          description = (cutIdx > 0 ? rawDesc.slice(0, cutIdx).trim() : rawDesc).slice(0, 2000)
        }

        // ─── color (상품 색상 라벨의 형제 요소) ───
        let color: string | null = null
        const titleWrappers = document.querySelectorAll("div.title-wrapper")
        for (const tw of titleWrappers) {
          if ((tw as HTMLElement).innerText?.includes("상품 색상")) {
            const next = tw.nextElementSibling
            if (next) {
              color = (next as HTMLElement).innerText?.trim().slice(0, 100) || null
            }
            break
          }
        }

        // ─── material (Shell/Lining 패턴 또는 소재 키워드) ───
        let material: string | null = null
        if (rawDesc) {
          const lines = rawDesc.split("\n")
          const matLines: string[] = []
          for (const line of lines) {
            const t = line.trim()
            if (/^(Shell|Lining|겉감|안감|소재|원단)\s*[:：]/i.test(t)) {
              matLines.push(t)
            }
          }
          if (matLines.length) material = matLines.join(" / ").slice(0, 200)
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
