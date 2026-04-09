import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * adekuver 상세 파서
 *
 * 구조 (.item.open .content):
 *   - {컬러} 컬러
 *   - {소재} {아이템}
 *   - {디테일}...
 *   - {조성} (100% CO, 96% CO 4% EA)
 *   - MADE IN {국가}
 *   {상품코드1}
 *   {상품코드2}
 *
 * option1 = 사이즈 (S, M 등)
 */
export class AdekuverDetailParser implements IDetailParser {
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
        const descEl = document.querySelector(".item.open .content")
        const description = descEl
          ? (descEl as HTMLElement).innerText?.trim().slice(0, 2000)
          : null

        let color: string | null = null
        let material: string | null = null
        const codes: string[] = []

        if (description) {
          const lines = description.split("\n").map((l) => l.trim()).filter((l) => l)

          for (const line of lines) {
            const clean = line.replace(/^-\s*/, "").trim()

            // color — "핑크 컬러", "블루 컬러" 등
            if (!color && /컬러\s*$/.test(clean)) {
              color = clean.replace(/\s*컬러\s*$/, "").trim() || null
            }

            // material — "100% CO", "96% CO 4% EA" 등
            if (!material && /^\d+%\s/.test(clean)) {
              material = clean.slice(0, 200)
            }

            // productCode — 영숫자 6자 이상 코드 (설명 끝부분)
            if (/^[A-Z0-9]{6,}$/.test(clean)) {
              codes.push(clean)
            }
          }
        }

        return {
          description,
          color,
          material,
          productCode: codes.length ? codes.join(", ") : null,
        }
      })

      result.description = extracted.description
      result.color = extracted.color
      result.material = extracted.material
      result.productCode = extracted.productCode
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
