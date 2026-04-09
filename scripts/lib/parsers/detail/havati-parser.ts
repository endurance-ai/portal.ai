import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * havati 상세 파서
 *
 * .xans-product-additional 이후 body text 순서:
 *   1) 브랜드 설명 + 상품 설명 (긴 텍스트)
 *   2) 디테일 키워드 (YKK SNAPS 등)
 *   3) OUTSHELL : 소재
 *   4) 핏 정보 (RELAXED FIT 등)
 *   5) SIZE (CM) + 사이즈 차트
 */
export class HavatiDetailParser implements IDetailParser {
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
        // Instagram 줄 이후 ~ OUTSHELL/SIZE 이전까지가 설명 영역
        let description: string | null = null
        const startIdx = lines.findIndex((l) => /^Instagram\s*:?/.test(l))
        const endIdx = lines.findIndex((l) => /^(?:OUTSHELL|SHELL|LINING)\s*:/.test(l))
        if (startIdx >= 0 && endIdx > startIdx) {
          const descLines = lines.slice(startIdx + 1, endIdx).filter((l) => l.length > 10)
          if (descLines.length > 0) description = descLines.join("\n").slice(0, 2000)
        }

        // ── material ──
        // OUTSHELL : ..., TRIM : ..., LINING : ... 등 수집
        const matLines: string[] = []
        for (const line of lines) {
          if (/^(?:OUTSHELL|SHELL|TRIM|LINING|FILLING)\s*:/.test(line)) {
            matLines.push(line)
          }
        }
        const material = matLines.length > 0 ? matLines.join("\n").slice(0, 500) : null

        // ── color ──
        const opts = Array.from(document.querySelectorAll('select[name*="option"] option'))
          .map((el) => (el as HTMLElement).innerText?.trim())
          .filter((t) => t && !t.startsWith("-") && t !== "empty" && !t.includes("선택") && t !== "*")
        const color = opts.length > 0 ? opts.slice(0, 20).join(", ") : null

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
