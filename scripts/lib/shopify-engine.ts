/**
 * Shopify 크롤 엔진
 *
 * Shopify 사이트의 /products.json 엔드포인트 활용
 * 페이지네이션: ?page=N (기본 250개/페이지, 빈 배열 올 때까지)
 */

import type {CrawlResult, Product, SiteConfig} from "./types"

// 2026-04 기준 고정 환율 (POC — 실시간 환율 API는 후속 작업)
const FX_TO_KRW: Record<string, number> = {
  USD: 1430,
  EUR: 1560,
  GBP: 1750,
  KRW: 1,
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  KRW: "₩",
}

// Shopify Markets localization cookie — currency 기반 국가 코드 매핑
// 미설정 시 스토어가 IP geo로 로컬 통화 반환 (한국 IP → KRW로 리턴 → 통화 혼선)
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: "US",
  GBP: "GB",
  EUR: "DE",
  KRW: "KR",
}

function convertToKrw(price: number, currency: string): number {
  const rate = FX_TO_KRW[currency] ?? 1
  return Math.round(price * rate)
}

interface ShopifyProduct {
  id: number
  title: string
  handle: string
  vendor: string
  product_type: string
  body_html: string
  tags: string[]
  options?: {name: string; position: number; values?: string[]}[]
  variants: {
    id: number
    title: string
    price: string
    available: boolean
    sku: string
    option1?: string | null
    option2?: string | null
    option3?: string | null
  }[]
  images: {
    src: string
  }[]
}

interface ShopifyResponse {
  products: ShopifyProduct[]
}

export async function crawlShopify(config: SiteConfig): Promise<CrawlResult> {
  const startTime = Date.now()
  const errors: string[] = []
  const allProducts: Product[] = []
  const maxPages = config.maxPages || 20
  const delay = config.crawlDelay || 1000
  const currency = config.sourceCurrency || "KRW"
  const symbol = CURRENCY_SYMBOL[currency]
  const country = CURRENCY_TO_COUNTRY[currency]
  const localizationCookie = `localization=${country}`

  // options.name에서 색상/사이즈 포지션 식별 (Shopify는 옵션명이 store마다 다름)
  const COLOR_NAMES = ["color", "colour", "colorway", "shade"]
  const SIZE_NAMES = ["size", "length", "shoe size", "us size", "eu size", "uk size"]

  console.log(`\n${"─".repeat(50)}`)
  console.log(`🏪 ${config.name} (${config.baseUrl}) [Shopify]`)
  console.log(`${"─".repeat(50)}`)

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `${config.baseUrl}/products.json?page=${page}&limit=250`
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
          Cookie: localizationCookie,
        },
      })

      if (!res.ok) {
        errors.push(`HTTP ${res.status} on page ${page}`)
        break
      }

      const data: ShopifyResponse = await res.json()

      if (!data.products || data.products.length === 0) break

      // 옵션 포지션 식별 (페이지별 1회)
      const optionPositions: {color?: number; size?: number} = {}
      const firstWithOptions = data.products.find((p) => p.options && p.options.length > 0)
      if (firstWithOptions?.options) {
        for (const opt of firstWithOptions.options) {
          const n = opt.name.toLowerCase()
          if (COLOR_NAMES.some((c) => n.includes(c))) optionPositions.color = opt.position
          else if (SIZE_NAMES.some((s) => n.includes(s))) optionPositions.size = opt.position
        }
      }

      const pickOption = (v: ShopifyProduct["variants"][0], pos?: number): string | null => {
        if (!pos) return null
        if (pos === 1) return v.option1 ?? null
        if (pos === 2) return v.option2 ?? null
        if (pos === 3) return v.option3 ?? null
        return null
      }

      for (const sp of data.products) {
        // 룩북/기프트카드/통합 상품 제외 (실상품 아님, sentinel 가격값 들어감)
        const titleLower = sp.title.toLowerCase()
        const typeLower = (sp.product_type || "").toLowerCase()
        if (
          titleLower.startsWith("lookbook") ||
          typeLower === "lookbook" ||
          typeLower === "gift card" ||
          typeLower === "gift-card" ||
          sp.vendor === "Rise.ai"
        ) {
          continue
        }

        const firstVariant = sp.variants[0]
        const srcPrice = firstVariant ? parseFloat(firstVariant.price) : null
        const priceKrw = srcPrice !== null ? convertToKrw(srcPrice, currency) : null
        const inStock = sp.variants.some((v) => v.available)
        const imageUrl = sp.images[0]?.src || ""

        // gender 추론 (태그에서)
        const gender: string[] = [...(config.defaultGender || [])]
        const tagsLower = sp.tags.map((t) => t.toLowerCase())
        if (tagsLower.some((t) => t.includes("women") || t.includes("female"))) {
          if (!gender.includes("women")) gender.push("women")
        }
        if (tagsLower.some((t) => t.includes("men") || t.includes("male"))) {
          if (!gender.includes("men")) gender.push("men")
        }

        // description
        const bodyHtml = sp.body_html || ""
        const description = bodyHtml
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&#?\w+;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 2000) || undefined

        // color: options 메타데이터로 정확한 포지션 사용
        let color: string | undefined
        if (optionPositions.color) {
          const colors = [...new Set(
            sp.variants.map((v) => pickOption(v, optionPositions.color)).filter((x): x is string => !!x && x !== "Default Title")
          )]
          if (colors.length > 0) color = colors.join(", ").slice(0, 500)
        }

        // sizeInfo: options 메타데이터로 정확한 포지션 사용
        let sizeInfo: string | undefined
        if (optionPositions.size) {
          const sizes = [...new Set(
            sp.variants.map((v) => pickOption(v, optionPositions.size)).filter((x): x is string => !!x && x !== "Default Title")
          )]
          if (sizes.length > 0) sizeInfo = sizes.join(", ").slice(0, 200)
        }

        // 다중 이미지
        const images = sp.images
          .map((img) => img.src)
          .filter(Boolean)
          .slice(0, 10)

        const tags = sp.tags.length > 0 ? sp.tags.slice(0, 50).map((t) => t.slice(0, 100)) : undefined

        allProducts.push({
          brand: sp.vendor || config.name,
          name: sp.title,
          category: sp.product_type || "",
          price: priceKrw,
          originalPrice: priceKrw,
          salePrice: null,
          priceFormatted: srcPrice !== null ? `${symbol}${srcPrice.toFixed(0)}` : "",
          imageUrl,
          productUrl: `${config.baseUrl}/products/${sp.handle}`,
          inStock,
          gender,
          platform: config.key,
          crawledAt: new Date().toISOString(),
          description,
          color,
          sizeInfo,
          images: images.length > 0 ? images : undefined,
          tags,
          sourceCurrency: currency,
          sourcePrice: srcPrice !== null ? srcPrice : undefined,
        })
      }

      console.log(`   페이지 ${page}: ${data.products.length}개 상품`)

      if (data.products.length < 250) break // 마지막 페이지

      await new Promise((r) => setTimeout(r, delay))
    } catch (err) {
      errors.push(`페이지 ${page} 실패: ${err}`)
      break
    }
  }

  // 통계
  const uniqueBrands = new Set(allProducts.map((p) => p.brand))
  const withPrice = allProducts.filter((p) => p.price !== null)
  const avgPrice =
    withPrice.length > 0
      ? Math.round(withPrice.reduce((s, p) => s + (p.price || 0), 0) / withPrice.length)
      : 0

  const result: CrawlResult = {
    platform: config.key,
    products: allProducts,
    stats: {
      totalProducts: allProducts.length,
      inStock: allProducts.filter((p) => p.inStock).length,
      outOfStock: allProducts.filter((p) => !p.inStock).length,
      uniqueBrands: uniqueBrands.size,
      avgPrice,
      duration: Date.now() - startTime,
    },
    errors,
  }

  console.log(`\n   ✅ ${config.name} 완료: ${result.stats.totalProducts}개 상품, ${result.stats.uniqueBrands}개 브랜드 (${(result.stats.duration / 1000).toFixed(1)}s)`)

  return result
}
