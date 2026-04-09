import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * slowsteadyclub 상세 파서
 *
 * .xans-product-additional 안에 정형화된 구조:
 *   시즌정보 → 소재(겉감/안감/배색) → 원산지 → 사이즈 → 상세설명
 */
export class SlowsteadyclubDetailParser implements IDetailParser {
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

      const extracted = await page
        .$eval(".xans-product-additional", (el) => {
          const text = el.innerText?.trim() || ""
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)

          // ── material ──
          // "소재" 이후 ~ "원산지" 또는 "사이즈" 이전까지
          const matStart = lines.findIndex((l) => l === "소재")
          let matEnd = lines.findIndex((l, i) => i > matStart && /^(?:원산지|사이즈)/.test(l))
          if (matEnd < 0) matEnd = lines.length
          const matLines = matStart >= 0
            ? lines.slice(matStart + 1, matEnd).filter((l) => l.length > 3)
            : []
          const material = matLines.length > 0 ? matLines.join("\n").slice(0, 500) : null

          // ── description ──
          // "상세설명" 이후 전체
          const descIdx = lines.findIndex((l) => l === "상세설명")
          const description = descIdx >= 0
            ? lines.slice(descIdx + 1).join("\n").slice(0, 2000) || null
            : null

          // ── color ──
          const opts = Array.from(document.querySelectorAll('select[name*="option"] option'))
            .map((el) => (el as HTMLElement).innerText?.trim())
            .filter((t) => t && !t.startsWith("-") && t !== "empty" && !t.includes("선택") && t !== "*")
          const color = opts.length > 0 ? [...new Set(opts)].slice(0, 20).join(", ") : null

          return { description, material, color }
        })
        .catch(() => ({ description: null, material: null, color: null }))

      result.description = extracted.description
      result.material = extracted.material
      result.color = extracted.color
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
