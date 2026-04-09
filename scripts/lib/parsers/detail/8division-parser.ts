import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * 8division 상세 파서
 *
 * 구조 (div.product-addinfo):
 *   브랜드정보 → 브랜드 설명
 *   제품정보 → 상세 설명 + 소재 조성 (e.g., "70% Acrylic, 30% Wool")
 *   매장 이용안내 / 배송 → 무시
 *   상품명 괄호 안 → 색상 (e.g., "Hysteric Logo Bon Cap (Purple)")
 *   option1 = 사이즈
 *   리뷰 없음
 */
export class EightDivisionDetailParser implements IDetailParser {
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
        // ─── description (제품정보 섹션 추출) ───
        const addInfo = document.querySelector("div.product-addinfo")
        const rawText = addInfo ? (addInfo as HTMLElement).innerText?.trim() : null

        let description: string | null = null
        let material: string | null = null

        if (rawText) {
          // "제품정보" ~ "매장 이용안내" 사이 추출
          const prodIdx = rawText.indexOf("제품정보")
          const storeIdx = rawText.indexOf("매장 이용안내")
          const shipIdx = rawText.indexOf("배송 및 교환")

          const endIdx = storeIdx > 0 ? storeIdx : shipIdx > 0 ? shipIdx : rawText.length
          const startIdx = prodIdx >= 0 ? prodIdx + "제품정보".length : 0

          description = rawText.slice(startIdx, endIdx).trim().slice(0, 2000) || null

          // material — 조성 비율 패턴 (e.g., "70% Acrylic, 30% Wool")
          if (description) {
            const lines = description.split("\n")
            for (const line of lines) {
              const t = line.replace(/^-\s*/, "").trim()
              if (/\d+%\s/.test(t) && !t.includes("할인") && !t.includes("배송")) {
                material = t.slice(0, 200)
                break
              }
            }
          }
        }

        // ─── color (상품명 괄호 안) ───
        let color: string | null = null
        const ogTitle = document.querySelector("meta[property=\"og:title\"]")
        if (ogTitle) {
          const title = (ogTitle as HTMLMetaElement).content || ""
          const match = title.match(/\(([^)]+)\)\s*$/)
          if (match) color = match[1].trim()
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
