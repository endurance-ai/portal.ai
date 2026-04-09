import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * takeastreet 상세 파서
 *
 * 구조 (div.detail_left):
 *   상품 설명 텍스트
 *   컬러 : {색상}  또는 상품명 끝에 색상
 *   소재 : {소재}  또는 - MATERIALS - 섹션
 *   option1 = 사이즈
 *   리뷰 시스템 있으나 대부분 0건
 */
export class TakeastreetDetailParser implements IDetailParser {
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
        const descEl = document.querySelector("div.detail_left")
        const rawDesc = descEl ? (descEl as HTMLElement).innerText?.trim() : null

        let description: string | null = null
        let color: string | null = null
        let material: string | null = null

        if (rawDesc) {
          // MODEL SIZE / 측정 기준 / cm 이하 제거
          const cutIdx = rawDesc.search(/MODEL SIZE|측정 기준|^\s*cm\s/m)
          description = (cutIdx > 0 ? rawDesc.slice(0, cutIdx).trim() : rawDesc).slice(0, 2000)

          const lines = rawDesc.split("\n")
          for (const line of lines) {
            const t = line.trim()

            // 컬러 : 블랙
            if (!color && /^컬러\s*[:：]/.test(t)) {
              color = t.replace(/^컬러\s*[:：]\s*/, "").trim() || null
            }

            // 소재 : 겉감 - 나일론 100% / 안감 - ...
            if (!material && /^소재\s*[:：]/.test(t)) {
              material = t.replace(/^소재\s*[:：]\s*/, "").trim().slice(0, 200) || null
            }

            // Shell : 100% Cotton (MATERIALS 섹션 패턴)
            if (!material && /^Shell\s*[:：]/i.test(t)) {
              material = t.slice(0, 200)
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
