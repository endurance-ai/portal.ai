/**
 * Cafe24 상세 페이지 기본 파서 (Strategy Pattern base class)
 *
 * 플랫폼별 파서는 이 클래스를 상속하고 셀렉터를 오버라이드한다.
 */

import type {Page} from "playwright"
import type {DetailData, IDetailParser} from "./types"

export class BaseDetailParser implements IDetailParser {
  // ─── 셀렉터 (서브클래스에서 오버라이드 가능) ─────────

  protected descriptionSelectors: string[] = [
    ".cont_detail",
    "#prdDetail",
    ".product-detail",
    ".xans-product-detaildesign",
    ".detail_cont",
    "#productDetail",
    ".item.open .content",
    ".prd_detail_box",
  ]

  protected colorSelectors: string[] = [
    'select[name*="option1"] option',
    'select[id*="option1"] option',
    ".opt_list li",
    ".product-option li",
  ]

  protected codeSelectors: string[] = [
    ".product_code",
    ".prd_code",
  ]

  protected materialPatternSrc: string =
    String.raw`(?:소재|원단|Material|Fabric|Composition)\s*[:：]?\s*([^\n<]{3,80})`

  protected materialKeywords: string[] = [
    "소재", "원단", "Material", "Fabric", "Composition",
    "cotton", "polyester", "wool", "nylon", "linen",
    "면", "폴리에스터", "울", "나일론", "린넨", "실크", "캐시미어", "레이온", "비스코스",
  ]

  // ─── 메인 파서 ──────────────────────────────────────

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

      const extracted = await page.evaluate((args) => {
        // description
        let description: string | null = null
        for (const sel of args.descSels) {
          try {
            const el = document.querySelector(sel)
            if (!el) continue
            const text = (el as HTMLElement).innerText?.trim()
            if (text && text.length > 10) { description = text.slice(0, 2000); break }
          } catch { /* next */ }
        }

        // color
        let color: string | null = null
        for (const sel of args.colorSels) {
          try {
            const options = document.querySelectorAll(sel)
            if (options.length === 0) continue
            const colors: string[] = []
            options.forEach((opt) => {
              const t = (opt as HTMLElement).innerText?.trim() || ""
              if (t && !t.includes("선택") && !t.includes("Select") && t !== "*") colors.push(t)
            })
            if (colors.length > 0) { color = colors.slice(0, 20).join(", ").slice(0, 500); break }
          } catch { /* next */ }
        }

        // productCode
        let productCode: string | null = null
        for (const sel of args.codeSels) {
          try {
            const el = document.querySelector(sel)
            if (!el) continue
            const text = (el as HTMLElement).innerText?.trim()
            if (text) {
              const m = text.match(/[:：]\s*(.+)/)
              productCode = m ? m[1].trim() : text
              break
            }
          } catch { /* next */ }
        }

        // material (from description text)
        let material: string | null = null
        if (description) {
          const matMatch = description.match(new RegExp(args.matPattern, "i"))
          if (matMatch?.[1]) {
            material = matMatch[1].trim()
          } else {
            const lines = description.split("\n")
            for (const line of lines) {
              const lower = line.toLowerCase()
              if (args.matKeywords.some((kw: string) => lower.includes(kw.toLowerCase()))) {
                const cleaned = line.replace(/^\s*[-·•]\s*/, "").trim()
                if (cleaned.length > 3 && cleaned.length < 200) { material = cleaned; break }
              }
            }
          }
        }

        return { description, color, material, productCode }
      }, {
        descSels: this.descriptionSelectors,
        colorSels: this.colorSelectors,
        codeSels: this.codeSelectors,
        matPattern: this.materialPatternSrc,
        matKeywords: this.materialKeywords,
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
