/**
 * Cafe24 상세 페이지 파싱 — description, color, material, images, productCode 추출
 */

import type { Page } from "playwright"
import type { Cafe24DetailSelectors } from "./types"

export interface DetailData {
  description: string | null
  color: string | null
  material: string | null
  images: string[]
  sizeInfo: string | null
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
]

const COLOR_OPTION_SELECTORS = [
  'select[name*="option1"] option',
  'select[id*="option1"] option',
  ".opt_list li",
  ".product-option li",
]

const DETAIL_IMAGE_SELECTORS = [
  ".cont_detail img",
  "#prdDetail img",
  ".product-detail img",
  ".xans-product-detaildesign img",
  ".detail_cont img",
]

const PRODUCT_CODE_SELECTORS = [
  ".product_code",
  ".prd_code",
]

// ─── 소재 패턴 ────────────────────────────────────────

const MATERIAL_KEYWORDS = [
  "소재", "원단", "Material", "Fabric", "Composition",
  "cotton", "polyester", "wool", "nylon", "linen",
  "면", "폴리에스터", "울", "나일론", "린넨", "실크", "캐시미어", "레이온", "비스코스",
]

const MATERIAL_PATTERN = new RegExp(
  `(?:소재|원단|Material|Fabric|Composition)\\s*[:：]?\\s*([^\\n<]{3,80})`,
  "i"
)

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
    sizeInfo: null,
    productCode: null,
  }

  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(1000)

    result.description = await extractDescription(page, selectors?.description)
    result.color = await extractColor(page, selectors?.colorOptions)
    result.material = extractMaterial(result.description)
    result.images = await extractImages(page, selectors?.detailImages)
    result.productCode = await extractProductCode(page, selectors?.productCode)
  } catch (err) {
    console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
  }

  return result
}

// ─── 개별 추출 함수 ────────────────────────────────────

async function extractDescription(page: Page, override?: string): Promise<string | null> {
  const selectorChain = override ? [override, ...DESCRIPTION_SELECTORS] : DESCRIPTION_SELECTORS

  for (const sel of selectorChain) {
    try {
      const el = await page.$(sel)
      if (!el) continue
      const text = await el.innerText()
      const trimmed = text.trim()
      if (trimmed.length > 10) {
        return trimmed.slice(0, 2000)
      }
    } catch { /* next selector */ }
  }
  return null
}

async function extractColor(page: Page, override?: string): Promise<string | null> {
  const selectorChain = override ? [override, ...COLOR_OPTION_SELECTORS] : COLOR_OPTION_SELECTORS

  for (const sel of selectorChain) {
    try {
      const options = await page.$$(sel)
      if (options.length === 0) continue

      const colors: string[] = []
      for (const opt of options) {
        const text = (await opt.innerText()).trim()
        if (text && !text.includes("선택") && !text.includes("Select") && text !== "*") {
          colors.push(text)
        }
      }
      if (colors.length > 0) {
        return colors.join(", ")
      }
    } catch { /* next selector */ }
  }
  return null
}

function extractMaterial(description: string | null): string | null {
  if (!description) return null

  const match = description.match(MATERIAL_PATTERN)
  if (match?.[1]) {
    return match[1].trim()
  }

  const lines = description.split("\n")
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (MATERIAL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
      const cleaned = line.replace(/^\s*[-·•]\s*/, "").trim()
      if (cleaned.length > 3 && cleaned.length < 200) {
        return cleaned
      }
    }
  }
  return null
}

async function extractImages(page: Page, override?: string): Promise<string[]> {
  const selectorChain = override ? [override, ...DETAIL_IMAGE_SELECTORS] : DETAIL_IMAGE_SELECTORS

  for (const sel of selectorChain) {
    try {
      const imgs = await page.$$(sel)
      if (imgs.length === 0) continue

      const urls: string[] = []
      for (const img of imgs) {
        const src = await img.getAttribute("src") || await img.getAttribute("data-src") || await img.getAttribute("ec-data-src")
        if (src && src.startsWith("http") && !src.includes("/icon_") && !src.includes("/logo_")) {
          urls.push(src)
        }
      }
      if (urls.length > 0) {
        return [...new Set(urls)].slice(0, 10)
      }
    } catch { /* next selector */ }
  }
  return []
}

async function extractProductCode(page: Page, override?: string): Promise<string | null> {
  const selectorChain = override ? [override, ...PRODUCT_CODE_SELECTORS] : PRODUCT_CODE_SELECTORS

  for (const sel of selectorChain) {
    try {
      const el = await page.$(sel)
      if (!el) continue
      const text = (await el.innerText()).trim()
      const codeMatch = text.match(/[:：]\s*(.+)/)
      return codeMatch ? codeMatch[1].trim() : text
    } catch { /* next selector */ }
  }
  return null
}
