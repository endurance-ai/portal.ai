/**
 * Shopify 크롤 엔진
 *
 * Shopify 사이트의 /products.json 엔드포인트 활용
 * 페이지네이션: ?page=N (기본 250개/페이지, 빈 배열 올 때까지)
 */

import type {CrawlResult, Product, SiteConfig} from "./types"

interface ShopifyProduct {
  id: number
  title: string
  handle: string
  vendor: string
  product_type: string
  tags: string[]
  variants: {
    id: number
    title: string
    price: string
    available: boolean
    sku: string
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
        },
      })

      if (!res.ok) {
        errors.push(`HTTP ${res.status} on page ${page}`)
        break
      }

      const data: ShopifyResponse = await res.json()

      if (!data.products || data.products.length === 0) break

      for (const sp of data.products) {
        const firstVariant = sp.variants[0]
        const price = firstVariant ? parseFloat(firstVariant.price) : null
        const inStock = sp.variants.some((v) => v.available)
        const imageUrl = sp.images[0]?.src || ""

        // gender 추론 (태그에서)
        const gender: string[] = config.defaultGender || []
        const tagsLower = sp.tags.map((t) => t.toLowerCase())
        if (tagsLower.some((t) => t.includes("women") || t.includes("female"))) {
          if (!gender.includes("women")) gender.push("women")
        }
        if (tagsLower.some((t) => t.includes("men") || t.includes("male"))) {
          if (!gender.includes("men")) gender.push("men")
        }

        allProducts.push({
          brand: sp.vendor || config.name,
          name: sp.title,
          category: sp.product_type || "",
          price: price ? Math.round(price) : null,
          originalPrice: price ? Math.round(price) : null,
          salePrice: null,
          priceFormatted: price ? `€${price.toFixed(0)}` : "",
          imageUrl,
          productUrl: `${config.baseUrl}/products/${sp.handle}`,
          inStock,
          gender,
          platform: config.key,
          crawledAt: new Date().toISOString(),
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
