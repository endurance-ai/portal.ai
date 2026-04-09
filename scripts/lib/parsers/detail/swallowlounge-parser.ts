import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * swallowlounge 상세 파서
 *
 * data-name 속성 기반 탭 구조:
 *   li[data-name="details"] → 설명
 *   li[data-name="material"] → 소재
 *   li[data-name="size"] → 사이즈
 */
export class SwallowloungeDetailParser implements IDetailParser {
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

      result.description = await page
        .$eval('li[data-name="details"] > div', (el) => el.innerText?.trim().slice(0, 2000) || null)
        .catch(() => null)

      result.material = await page
        .$eval('li[data-name="material"] > div', (el) => el.innerText?.trim().slice(0, 500) || null)
        .catch(() => null)

      result.color = await page
        .$$eval('select[name*="option"] option', (els) =>
          els
            .map((el) => el.innerText?.trim())
            .filter((t) => t && t !== "empty" && !t.includes("선택") && !t.includes("Select") && t !== "*")
            .slice(0, 20)
            .join(", ") || null,
        )
        .catch(() => null)
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
