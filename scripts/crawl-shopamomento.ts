/**
 * 샵아모멘토 상품 크롤러
 *
 * 2단계 크롤링:
 *   1) 브랜드 목록 페이지에서 브랜드명 + cate_no 수집
 *   2) 각 브랜드 페이지에서 실제 상품 수집
 *
 * 실행: npx tsx scripts/crawl-shopamomento.ts
 * 출력: data/shopamomento-products.json
 */

import {chromium, type Page} from "playwright"
import * as fs from "fs"
import * as path from "path"

const BASE_URL = "https://shopamomento.com"
const CRAWL_DELAY_MS = 3000

// ─── 타입 ──────────────────────────────────────────────

interface Brand {
  name: string
  cateNo: number
  gender: string[] // ["women", "men", "life"] — CSS 클래스에서 추출
}

interface Product {
  brand: string
  name: string
  price: number | null
  priceFormatted: string
  imageUrl: string
  productUrl: string
  inStock: boolean
  gender: string[]
  crawledAt: string
}

// ─── Step 1: 브랜드 목록 수집 ──────────────────────────

async function collectBrands(page: Page): Promise<Brand[]> {
  console.log("📋 Step 1: 브랜드 목록 수집 중...\n")

  await page.goto(`${BASE_URL}`, { waitUntil: "networkidle", timeout: 30000 })

  const brands = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="cate_no="]')
    const brandMap = new Map<number, { name: string; cateNo: number; gender: string[] }>()

    links.forEach((a) => {
      const href = a.getAttribute("href") || ""
      const match = href.match(/cate_no=(\d+)/)
      if (!match) return

      const cateNo = parseInt(match[1], 10)
      const name = a.textContent?.trim() || ""
      const className = a.className || ""

      // gender 클래스 추출 (women, men, life)
      const gender: string[] = []
      if (className.includes("women")) gender.push("women")
      if (className.includes("men")) gender.push("men")
      if (className.includes("life")) gender.push("life")

      // 브랜드명이 있고, 너무 짧지 않은 것만 (메뉴 항목 제외)
      if (name.length >= 2 && !["Women", "Men", "Life", "New", "Sale", "Brands", "Journal", "Styling"].includes(name)) {
        brandMap.set(cateNo, { name, cateNo, gender })
      }
    })

    return Array.from(brandMap.values())
  })

  console.log(`   ✅ ${brands.length}개 브랜드 발견\n`)
  for (const b of brands.slice(0, 5)) {
    console.log(`      🏷️ ${b.name} (cate_no=${b.cateNo}) [${b.gender.join(", ") || "?"}]`)
  }
  if (brands.length > 5) console.log(`      ... 외 ${brands.length - 5}개`)

  return brands
}

// ─── Step 2: 브랜드별 상품 수집 ────────────────────────

async function collectProducts(page: Page, brand: Brand): Promise<Product[]> {
  const url = `${BASE_URL}/product/list.html?cate_no=${brand.cateNo}`

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(2000) // JS 렌더링 대기

    const products = await page.evaluate(
      ({ brandName, brandGender, baseUrl }: { brandName: string; brandGender: string[]; baseUrl: string }) => {
        const items = document.querySelectorAll('ul.thumbnail li[id^="anchorBoxId"]')

        return Array.from(items).map((el) => {
          const img = el.querySelector("img.thumb-img") || el.querySelector("img")
          const link = el.querySelector('a[href*="product"]')
          const nameEl = el.querySelector(".name")
          const priceEl = el.querySelector(".price")
          const allText = el.textContent?.replace(/\s+/g, " ").trim() || ""

          // 가격 파싱 — "KRW 395,000" 형태
          const priceText = priceEl?.textContent?.trim() || ""
          const priceMatch = priceText.match(/KRW\s*([\d,]+)/)
          const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : null

          // 재고 확인 — .product-soldout에 displaynone 클래스가 있으면 재고 있음
          const soldoutEl = el.querySelector(".product-soldout")
          const inStock = !soldoutEl || soldoutEl.classList.contains("displaynone")

          // URL
          const href = link?.getAttribute("href") || ""
          const productUrl = href.startsWith("http") ? href : `${baseUrl}${href}`

          // 이미지
          let imageUrl = img?.getAttribute("src") || img?.getAttribute("data-original") || ""
          if (imageUrl.startsWith("//")) imageUrl = `https:${imageUrl}`

          return {
            brand: brandName,
            name: nameEl?.textContent?.trim() || "",
            price,
            priceFormatted: priceMatch ? `₩${priceMatch[1]}` : "",
            imageUrl,
            productUrl,
            inStock,
            gender: brandGender,
            crawledAt: new Date().toISOString(),
          }
        })
      },
      { brandName: brand.name, brandGender: brand.gender, baseUrl: BASE_URL }
    )

    return products.filter((p) => p.name) // 이름 없는 항목 제외
  } catch (err) {
    console.error(`   ❌ ${brand.name} 로딩 실패:`, err)
    return []
  }
}

// ─── 메인 ──────────────────────────────────────────────

async function main() {
  console.log("🚀 샵아모멘토 크롤링 시작\n")
  console.log("═".repeat(50))

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  })

  const page = await context.newPage()

  // Step 1: 브랜드 목록
  const brands = await collectBrands(page)

  // Step 2: 각 브랜드별 상품 수집
  console.log("\n📦 Step 2: 브랜드별 상품 수집\n")
  console.log("═".repeat(50))

  const allProducts: Product[] = []
  let brandIdx = 0

  for (const brand of brands) {
    brandIdx++
    process.stdout.write(
      `\r   [${brandIdx}/${brands.length}] 🏷️ ${brand.name}...`
    )

    const products = await collectProducts(page, brand)
    allProducts.push(...products)

    const inStockCount = products.filter((p) => p.inStock).length
    console.log(
      `\r   [${brandIdx}/${brands.length}] 🏷️ ${brand.name} — ${products.length}개 (재고 ${inStockCount}개)`
    )

    if (products.length > 0) {
      const sample = products[0]
      console.log(
        `      💰 ${sample.priceFormatted || "가격없음"} — ${sample.name}${sample.inStock ? "" : " [품절]"}`
      )
    }

    // 딜레이
    await new Promise((r) => setTimeout(r, CRAWL_DELAY_MS))
  }

  await browser.close()

  // ─── 저장 ────────────────────────────────────────────
  const outDir = path.join(process.cwd(), "data")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const outPath = path.join(outDir, "shopamomento-products.json")
  fs.writeFileSync(outPath, JSON.stringify(allProducts, null, 2), "utf-8")

  // 통계
  const uniqueBrands = new Set(allProducts.map((p) => p.brand))
  const inStock = allProducts.filter((p) => p.inStock)
  const withPrice = allProducts.filter((p) => p.price !== null)
  const avgPrice = withPrice.length > 0
    ? Math.round(withPrice.reduce((s, p) => s + (p.price || 0), 0) / withPrice.length)
    : 0

  console.log("\n" + "═".repeat(50))
  console.log("🏁 크롤링 완료")
  console.log(`   📦 총 상품: ${allProducts.length}개`)
  console.log(`   ✅ 재고 있음: ${inStock.length}개`)
  console.log(`   🚫 품절: ${allProducts.length - inStock.length}개`)
  console.log(`   🏷️ 브랜드: ${uniqueBrands.size}개`)
  console.log(`   💰 평균 가격: ₩${avgPrice.toLocaleString()}`)
  console.log(`   📁 저장: ${outPath}`)
  console.log("═".repeat(50))
}

main().catch(console.error)
