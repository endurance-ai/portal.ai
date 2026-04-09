import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * sculpstore 상세 파서
 *
 * 이미지 기반 상세페이지 — 텍스트는 최소한:
 *   - description: 상품간략설명 테이블 행 ("배송 안내" 이전까지)
 *   - material: body text "혼용률:" 패턴
 *   - productCode: body text "CODE" 다음 줄
 */
export class SculpstoreDetailParser implements IDetailParser {
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

      // description: 상품간략설명 row → "배송 안내" 이전까지
      result.description = await page
        .$eval(".xans-product-detaildesign", (el) => {
          const rows = el.querySelectorAll("tr")
          for (const row of Array.from(rows)) {
            const th = row.querySelector("th")
            if (th && th.innerText.includes("상품간략설명")) {
              const td = row.querySelector("td")
              if (!td) return null
              let text = td.innerText?.trim() || ""
              const cutoff = text.indexOf("배송 안내")
              if (cutoff > 0) text = text.slice(0, cutoff).trim()
              text = text.replace(/^브랜드\s*설명\s*/, "").trim()
              return text.slice(0, 2000) || null
            }
          }
          return null
        })
        .catch(() => null)

      // material + productCode: body text 패턴
      const extracted = await page.evaluate(() => {
        const text = document.body.innerText || ""
        const matMatch = text.match(/혼용률\s*[:：]?\s*([^\n]{3,100})/)
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
        const codeIdx = lines.findIndex((l) => /^CODE$/i.test(l))
        return {
          material: matMatch ? matMatch[1].trim() : null,
          productCode: codeIdx >= 0 && lines[codeIdx + 1] ? lines[codeIdx + 1].trim() : null,
        }
      })

      result.material = extracted.material
      result.productCode = extracted.productCode

      // color/options
      result.color = await page
        .$$eval('select[name*="option"] option', (els) =>
          els
            .map((el) => (el as HTMLElement).innerText?.trim())
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
