import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

/**
 * anotheroffice 상세 파서
 *
 * ec-base-tab 두 번째 탭 안:
 *   - "상품결제정보" 이후 ~ "배송정보" 이전 = description
 *   - "교환 및 반품정보" 줄에서 제조국 뒤 소재 조성 = material
 */
export class AnotherofficeDetailParser implements IDetailParser {
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

      const extracted = await page.$$eval(".ec-base-tab", (els) => {
        if (els.length < 2) return { description: null, material: null }
        const text = els[1].innerText?.trim() || ""

        // ── description ──
        // "상품결제정보" 이후 ~ "배송정보" 이전
        let description: string | null = null
        const descStart = text.indexOf("상품결제정보")
        const descEnd = text.indexOf("배송정보")
        if (descStart >= 0 && descEnd > descStart) {
          description = text.slice(descStart + "상품결제정보".length, descEnd).trim().slice(0, 2000) || null
        }

        // ── material ──
        // "교환 및 반품정보" 줄에서 "제조국 : ..." 다음 소재 조성
        let material: string | null = null
        const refundIdx = text.indexOf("교환 및 반품정보")
        if (refundIdx >= 0) {
          const refundText = text.slice(refundIdx, refundIdx + 500)
          // "제조국 : 대한민국Cotton 95%..." 또는 "제조국 : 대한민국겉감 Cotton 45%..."
          const matMatch = refundText.match(/제조국\s*:\s*[^\n]*?(?:겉감\s*)?([A-Za-z][\w\s,%.'·()]+)/)
          if (matMatch) {
            // 세탁 안내 전까지
            let mat = matMatch[1].trim()
            const careIdx = mat.search(/[-\-](?:본|이)\s*제품|드라이|세탁|물세탁/)
            if (careIdx > 0) mat = mat.slice(0, careIdx).trim()
            if (mat.length > 3) material = mat
          }
        }

        return { description, material }
      })

      result.description = extracted.description
      result.material = extracted.material

      // color/options
      result.color = await page
        .$$eval('select[name*="option"] option', (els) =>
          els
            .map((el) => el.innerText?.trim())
            .filter((t) => t && !t.startsWith("-") && t !== "empty" && !t.includes("선택") && t !== "*")
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
