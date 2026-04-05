/**
 * 한국어 프롬프트에서 가격 조건을 추출한다.
 *
 * 지원 패턴:
 *   "20만원 이하"      → { maxPrice: 200000 }
 *   "10만원 이상"      → { minPrice: 100000 }
 *   "10만원대"         → { minPrice: 100000, maxPrice: 199999 }
 *   "5~10만원"         → { minPrice: 50000, maxPrice: 100000 }
 *   "5만원~10만원"     → { minPrice: 50000, maxPrice: 100000 }
 *   "50만원 미만"      → { maxPrice: 499999 }
 *   "30만원 이내"      → { maxPrice: 300000 }
 *
 * 가격 텍스트를 제거한 클린 프롬프트도 반환한다.
 */

export type PriceFilter = {
  minPrice?: number
  maxPrice?: number
}

export type ParsedPrompt = {
  cleanPrompt: string
  priceFilter: PriceFilter | null
}

function toWon(num: number, unit: string): number {
  if (unit === "만원" || unit === "만") return num * 10000
  if (unit === "천원" || unit === "천") return num * 1000
  if (unit === "원") return num
  return num * 10000 // 기본: 만원
}

export function parsePrice(prompt: string): ParsedPrompt {
  let cleanPrompt = prompt
  let priceFilter: PriceFilter | null = null

  // 범위: "5~10만원", "5만원~10만원", "5-10만원"
  const rangePattern = /(\d+(?:\.\d+)?)\s*(만원|만|천원|천|원)?\s*[~\-]\s*(\d+(?:\.\d+)?)\s*(만원|만|천원|천|원)/g
  const rangeMatch = rangePattern.exec(prompt)
  if (rangeMatch) {
    const minUnit = rangeMatch[2] || rangeMatch[4]
    const maxUnit = rangeMatch[4]
    priceFilter = {
      minPrice: toWon(parseFloat(rangeMatch[1]), minUnit),
      maxPrice: toWon(parseFloat(rangeMatch[3]), maxUnit),
    }
    cleanPrompt = cleanPrompt.replace(rangeMatch[0], "").trim()
    return { cleanPrompt: cleanPrompt.replace(/[,\s]+$/, "").trim(), priceFilter }
  }

  // "N만원대" → 범위
  const bandPattern = /(\d+(?:\.\d+)?)\s*(만원|만|천원|천)대/g
  const bandMatch = bandPattern.exec(prompt)
  if (bandMatch) {
    const base = toWon(parseFloat(bandMatch[1]), bandMatch[2])
    priceFilter = {
      minPrice: base,
      maxPrice: base + toWon(1, bandMatch[2]) - 1, // 10만원대 → 100000~199999
    }
    cleanPrompt = cleanPrompt.replace(bandMatch[0], "").trim()
    return { cleanPrompt: cleanPrompt.replace(/[,\s]+$/, "").trim(), priceFilter }
  }

  // "N만원 이하/이내/미만/이상"
  const boundPattern = /(\d+(?:\.\d+)?)\s*(만원|만|천원|천|원)\s*(이하|이내|미만|이상|까지)/g
  const boundMatch = boundPattern.exec(prompt)
  if (boundMatch) {
    const value = toWon(parseFloat(boundMatch[1]), boundMatch[2])
    const dir = boundMatch[3]

    if (dir === "이하" || dir === "이내" || dir === "까지") {
      priceFilter = { maxPrice: value }
    } else if (dir === "미만") {
      priceFilter = { maxPrice: value - 1 }
    } else if (dir === "이상") {
      priceFilter = { minPrice: value }
    }

    cleanPrompt = cleanPrompt.replace(boundMatch[0], "").trim()
    return { cleanPrompt: cleanPrompt.replace(/[,\s]+$/, "").trim(), priceFilter }
  }

  return { cleanPrompt, priceFilter: null }
}
