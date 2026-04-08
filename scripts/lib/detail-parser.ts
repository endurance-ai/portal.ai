/**
 * Cafe24 상세 페이지 파싱 — description, color, material, productCode 추출
 * 이미지는 리스트 크롤 시 썸네일 1장으로 충분하므로 상세에서 수집하지 않음.
 */

import type { Page } from "playwright"
import type { Cafe24DetailSelectors } from "./types"

export interface DetailData {
  description: string | null
  color: string | null
  material: string | null
  images: string[]
  productCode: string | null
}

// ─── 셀렉터 폴백 체인 ─────────────────────────────────

const DESCRIPTION_SELECTORS = [
  ".cont_detail",
  "#prdDetail",
  ".product-detail",
  ".xans-product-detaildesign",
  ".detail_cont",
  "#productDetail",
  ".item.open .content",      // adekuver 등 아코디언 패턴
  ".prd_detail_box",
]

const COLOR_OPTION_SELECTORS = [
  'select[name*="option1"] option',
  'select[id*="option1"] option',
  ".opt_list li",
  ".product-option li",
]

const PRODUCT_CODE_SELECTORS = [
  ".product_code",
  ".prd_code",
]

// ─── 소재 regex ──────────────────────────────────────

const MATERIAL_PATTERN_SRC = String.raw`(?:소재|원단|Material|Fabric|Composition)\s*[:：]?\s*([^\n<]{3,80})`

const MATERIAL_KEYWORD_LIST = [
  "소재", "원단", "Material", "Fabric", "Composition",
  "cotton", "polyester", "wool", "nylon", "linen",
  "면", "폴리에스터", "울", "나일론", "린넨", "실크", "캐시미어", "레이온", "비스코스",
]

// ─── 메인 파서 ─────────────────────────────────────────

export async function parseDetailPage(
  page: Page,
  productUrl: string,
  selectors?: Cafe24DetailSelectors
): Promise<DetailData> {
  const result: DetailData = {
    description: null,
    color: null,
    material: null,
    images: [],
    productCode: null,
  }

  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(800)

    // 단일 evaluate로 description + color + productCode 한 번에 추출 (IPC 왕복 최소화)
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
      descSels: selectors?.description ? [selectors.description, ...DESCRIPTION_SELECTORS] : DESCRIPTION_SELECTORS,
      colorSels: selectors?.colorOptions ? [selectors.colorOptions, ...COLOR_OPTION_SELECTORS] : COLOR_OPTION_SELECTORS,
      codeSels: selectors?.productCode ? [selectors.productCode, ...PRODUCT_CODE_SELECTORS] : PRODUCT_CODE_SELECTORS,
      matPattern: MATERIAL_PATTERN_SRC,
      matKeywords: MATERIAL_KEYWORD_LIST,
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
