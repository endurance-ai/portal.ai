import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * etcseoul 상세 파서
 *
 * 두 가지 패턴:
 *   A) [MATERIAL] → 소재줄 / [SIZE]cm → 사이즈 차트
 *   B) 브랜드 설명 + [SIZE AND FIT] + [PRODUCT DETAILS]
 * 공통: 하단 구조화 정보 (소재 -, 색상 -, 브랜드 - 등)
 */
export class EtcseoulDetailParser implements IDetailParser {
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

      const extracted = await page.evaluate(() => {
        const body = document.body.innerText || ""
        const lines = body.split("\n").map((l) => l.trim()).filter(Boolean)

        // ── description ──
        // 패턴B: 네비게이션 이후 ~ 첫 [섹션] 이전 텍스트
        let description: string | null = null
        const navKeywords = /^(NEW ARRIVALS|검색|SEARCH|ACCOUNT|SHOPPING)/
        const sectionMarker = /^\[(?:MATERIAL|SIZE|PRODUCT|COLOR)\b/
        const descLines: string[] = []
        let pastNav = false
        for (const line of lines) {
          if (!pastNav) {
            if (navKeywords.test(line)) continue
            pastNav = true
          }
          if (sectionMarker.test(line)) break
          if (line.startsWith("BRAND\t") || line.startsWith("PRODUCT\t")) break
          if (line.length > 10) descLines.push(line)
        }
        if (descLines.length > 0) description = descLines.join("\n").slice(0, 2000)

        // ── material ──
        // 1차: [MATERIAL] 다음 줄
        let material: string | null = null
        const matIdx = lines.findIndex((l) => l === "[MATERIAL]")
        if (matIdx >= 0 && lines[matIdx + 1]) {
          material = lines[matIdx + 1]
        }
        // 2차: 하단 "소재 - ..." 패턴
        if (!material) {
          const matLine = lines.find((l) => /^소재\s*[-–]\s*.+/.test(l))
          if (matLine) material = matLine.replace(/^소재\s*[-–]\s*/, "").trim()
        }

        // ── color ──
        const colorLine = lines.find((l) => /^색상\s*[-–]\s*.+/.test(l))
        const color = colorLine ? colorLine.replace(/^색상\s*[-–]\s*/, "").trim() : null

        return { description, material, color }
      })

      result.description = extracted.description
      result.material = extracted.material
      result.color = extracted.color
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
