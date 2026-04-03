/**
 * Cafe24 범용 크롤 엔진
 *
 * Cafe24 기반 쇼핑몰의 공통 패턴:
 *   - 카테고리: /product/list.html?cate_no=XXX
 *   - 상품 목록: ul.thumbnail li / ul.prdList li
 *   - 페이지네이션: ?page=N
 *
 * 사이트마다 테마가 달라 셀렉터가 조금씩 다를 수 있음 → 폴백 셀렉터로 대응
 */

import type {Page} from "playwright"
import type {CrawlResult, Product, SiteConfig} from "./types"
import { parseDetailPage } from "./detail-parser"

// ─── 기본 셀렉터 (폴백 체인) ──────────────────────────

const DEFAULT_SELECTORS = {
  // 상품 아이템: 가장 흔한 것부터
  productItem: [
    'li[id^="anchorBoxId"]',
    "ul.thumbnail > li",
    "ul.prdList > li",
    ".xans-product li",           // LLUD 등 minishop 패턴
    ".product-list .item",
    ".product_listnormal_list > li",
    ".grid-list > li",
    "div[class*=product] li",     // 범용 폴백
  ],
  productName: [
    ".name a",
    ".name span",
    ".name",
    ".nm span",           // sculpstore 패턴
    ".nm a",
    ".nm",
    ".prd-name",
    ".product-name",
    ".tit",
    "strong.title a",
  ],
  productPrice: [
    ".price .sale_price",
    ".price",
    ".prd-price",
    ".product-price",
    ".sell-price",
    "span.sale_price",
  ],
  productImage: [
    "img.thumb-img",
    "img.ThumbImage",
    ".thumbnail img",
    ".prd-img img",
    "a > img",
    "img",
  ],
  productLink: [
    'a[href*="/product/"]',
    'a[href*="product_no="]',
    ".thumbnail a",
    ".prd-img a",
    "a",
  ],
}

// ─── 카테고리 자동 탐색 ───────────────────────────────

interface DiscoveredCategory {
  name: string
  cateNo: number
  gender: string[]
  url: string
}

async function discoverCategories(
  page: Page,
  config: SiteConfig
): Promise<DiscoveredCategory[]> {
  const discoveryUrl = config.category?.discoveryUrl || config.baseUrl
  const selector = config.category?.discoverySelector || 'a[href*="cate_no="]'
  const ignorePatterns = config.category?.ignorePatterns || []

  const defaultIgnore = [
    "home", "new", "sale", "brands", "brand", "journal", "styling",
    "about", "magazine", "lookbook", "event", "notice", "faq",
    "login", "member", "cart", "order", "mypage", "cs",
    "all", "전체", "홈", "로그인", "장바구니",
  ]

  await page.goto(discoveryUrl, {waitUntil: "load", timeout: 30000})
  // Cafe24는 JS 렌더링이 필요한 경우가 많음
  await page.waitForTimeout(2000)

  const categories = await page.evaluate(
    ({sel, baseUrl}: {sel: string; baseUrl: string}) => {
      const links = document.querySelectorAll(sel)
      const catMap = new Map<number, {name: string; cateNo: number; gender: string[]; url: string}>()

      links.forEach((a) => {
        const href = a.getAttribute("href") || ""
        const match = href.match(/cate_no=(\d+)/)
        if (!match) return

        const cateNo = parseInt(match[1], 10)
        const name = a.textContent?.trim().replace(/\s+/g, " ") || ""
        const className = (a.className || "").toLowerCase()
        const parentClass = (a.parentElement?.className || "").toLowerCase()

        // gender 추론
        const allClasses = `${className} ${parentClass}`
        const gender: string[] = []
        if (allClasses.includes("women") || allClasses.includes("female")) gender.push("women")
        if (allClasses.includes("men") || allClasses.includes("male")) gender.push("men")

        const fullUrl = href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`

        if (name.length >= 1 && !catMap.has(cateNo)) {
          catMap.set(cateNo, {name, cateNo, gender, url: fullUrl})
        }
      })

      return Array.from(catMap.values())
    },
    {sel: selector, baseUrl: config.baseUrl}
  )

  // 필터링: 무시 패턴 + 기본 무시 목록
  const allIgnore = [...defaultIgnore, ...ignorePatterns]
  return categories.filter((c) => {
    const lower = c.name.toLowerCase()
    return !allIgnore.some((p) => lower === p.toLowerCase())
  })
}

// ─── 상품 수집 (단일 페이지) ──────────────────────────

async function collectProductsFromPage(
  page: Page,
  config: SiteConfig,
  categoryName: string,
  categoryGender: string[],
  brandOverride?: string
): Promise<Product[]> {
  const selectors = config.selectors || {}

  // 상품 셀렉터가 나타날 때까지 대기 (최대 8초)
  const itemSelectorList = selectors.productItem
    ? [selectors.productItem, ...DEFAULT_SELECTORS.productItem]
    : DEFAULT_SELECTORS.productItem

  for (const sel of itemSelectorList) {
    try {
      await page.waitForSelector(sel, {timeout: 8000})
      break
    } catch {
      // 다음 셀렉터 시도
    }
  }

  // 폴백 셀렉터로 상품 아이템 찾기
  // NOTE: page.evaluate 안에 function/const 선언 금지 — tsx의 __name 변환이 브라우저에서 ReferenceError 유발
  const evalArgs = {
    itemSelectors: selectors.productItem
      ? [selectors.productItem, ...DEFAULT_SELECTORS.productItem]
      : DEFAULT_SELECTORS.productItem,
    nameSelectors: selectors.productName
      ? [selectors.productName, ...DEFAULT_SELECTORS.productName]
      : DEFAULT_SELECTORS.productName,
    priceSelectors: selectors.productPrice
      ? [selectors.productPrice, ...DEFAULT_SELECTORS.productPrice]
      : DEFAULT_SELECTORS.productPrice,
    imageSelectors: selectors.productImage
      ? [selectors.productImage, ...DEFAULT_SELECTORS.productImage]
      : DEFAULT_SELECTORS.productImage,
    linkSelectors: selectors.productLink
      ? [selectors.productLink, ...DEFAULT_SELECTORS.productLink]
      : DEFAULT_SELECTORS.productLink,
    categoryName,
    brandNameOverride: brandOverride || "",
    gender: categoryGender.length > 0 ? categoryGender : (config.defaultGender || []),
    baseUrl: config.baseUrl,
    platformKey: config.key,
    pricePatternStr: config.pricePattern?.source || null,
  }

  // NOTE: page.evaluate 블록 안에서는 var 사용 — tsx의 __name 변환이 let/const 선언을 브라우저에서 ReferenceError로 유발
  // eslint-disable-next-line no-eval
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evalResult: {ok: boolean; products?: any[]; error?: string} = await page.evaluate((args) => {
    /* eslint-disable no-var */
    try {
      let items: NodeListOf<Element> | null = null
      for (let i = 0; i < args.itemSelectors.length; i++) {
        const els = document.querySelectorAll(args.itemSelectors[i])
        if (els.length > 0) { items = els; break }
      }
      if (!items) return {ok: false as const, error: "no items"}

      const priceRegex = args.pricePatternStr ? new RegExp(args.pricePatternStr) : /[\d,]+/
      const products: Array<Record<string, unknown>> = []

      for (let j = 0; j < items.length; j++) {
        const el = items[j]

        // 상품명 추출: displaynone 요소 제외, ":" 같은 쓰레기값 건너뛰기
        var name = ""
        for (let k = 0; k < args.nameSelectors.length; k++) {
          var nameEls = el.querySelectorAll(args.nameSelectors[k])
          for (var ni = 0; ni < nameEls.length; ni++) {
            var ne = nameEls[ni]
            // displaynone 클래스가 있으면 건너뛰기
            if (ne.classList.contains("displaynone")) continue
            var txt = (ne.textContent || "").trim().replace(/\s+/g, " ")
            // ":" 또는 1~2글자 쓰레기값 건너뛰기
            if (txt.length > 2 && txt !== ":") { name = txt; break }
          }
          if (name) break
        }
        if (!name) continue

        let priceEl: Element | null = null
        for (let k = 0; k < args.priceSelectors.length; k++) {
          priceEl = el.querySelector(args.priceSelectors[k])
          if (priceEl) break
        }
        let priceText = priceEl ? (priceEl.textContent || "").trim() : ""

        // 셀렉터 실패 시: 아이템 내 모든 span/p에서 가격 패턴 (₩/KRW + 숫자) 탐색
        if (!priceText) {
          const spans = el.querySelectorAll("span, p, div")
          for (let k = 0; k < spans.length; k++) {
            const t = (spans[k].textContent || "").trim()
            if (t.match(/[₩\uFFE6][\d,]+/) || t.match(/KRW\s*[\d,]+/) || t.match(/^\d{1,3}(,\d{3})+원?$/)) {
              priceText = t
              break
            }
          }
        }

        const priceMatch = priceText.match(priceRegex)
        // 캡처 그룹이 있으면 [1], 없으면 [0]
        const priceStr = priceMatch ? (priceMatch[1] || priceMatch[0]) : null
        const price = priceStr ? parseInt(priceStr.replace(/,/g, ""), 10) : null

        // 이미지: 아이콘/로고가 아닌 실제 상품 이미지 찾기
        var imageUrl = ""
        for (var ik = 0; ik < args.imageSelectors.length; ik++) {
          var imgCandidates = el.querySelectorAll(args.imageSelectors[ik])
          for (var im = 0; im < imgCandidates.length; im++) {
            var imgSrc = (imgCandidates[im].getAttribute("src") || imgCandidates[im].getAttribute("data-original") || imgCandidates[im].getAttribute("data-src") || imgCandidates[im].getAttribute("data-lazy-src") || "")
            // 아이콘/로고/배지 파일 건너뛰기
            if (imgSrc.match(/\/(icon_|logo_|badge_|btn_|blank\.|spacer\.)/i)) continue
            // 너무 작은 이미지 건너뛰기 (width/height 속성 기준)
            var imgW = parseInt(imgCandidates[im].getAttribute("width") || "0", 10)
            var imgH = parseInt(imgCandidates[im].getAttribute("height") || "0", 10)
            if ((imgW > 0 && imgW < 50) || (imgH > 0 && imgH < 50)) continue
            if (imgSrc) { imageUrl = imgSrc; break }
          }
          if (imageUrl) break
        }
        if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl

        let linkEl: Element | null = null
        for (let k = 0; k < args.linkSelectors.length; k++) {
          linkEl = el.querySelector(args.linkSelectors[k])
          if (linkEl) break
        }
        const href = linkEl ? (linkEl.getAttribute("href") || "") : ""
        const productUrl = href.startsWith("http")
          ? href
          : href ? args.baseUrl + (href.startsWith("/") ? "" : "/") + href : ""

        // 재고: soldout 요소가 보이면 품절, 숨겨져 있으면 재고 있음
        var soldoutEl = el.querySelector('[class*="soldout"], .sold, .sold-out, .icon-soldout')
        var inStock = true
        if (soldoutEl) {
          // 방법 1: "displaynone" 클래스 (일부 Cafe24 테마)
          // 방법 2: CSS computed display: none (슬로우스테디클럽 등)
          var hasDisplayNoneClass = soldoutEl.classList.contains("displaynone")
          var isHiddenByCSS = window.getComputedStyle(soldoutEl).display === "none"
          inStock = hasDisplayNoneClass || isHiddenByCSS
        } else {
          // 숨겨진 요소 제외하고 보이는 텍스트만 검사
          var stockText = ""
          var stockEls = el.querySelectorAll("span, div, p")
          for (var si = 0; si < stockEls.length; si++) {
            var se = stockEls[si]
            if (se.classList.contains("displaynone")) continue
            if (window.getComputedStyle(se).display === "none") continue
            stockText += " " + (se.textContent || "")
          }
          stockText = stockText.toLowerCase()
          inStock = !stockText.includes("out of stock") && !stockText.includes("품절") && !stockText.includes("sold out")
        }

        // 브랜드: 상품 텍스트에서 추출 (Cafe24 편집샵은 보통 브랜드명이 상품명 앞에 있음)
        const brandEl = el.querySelector(".brand, [class*=brand], .manufacturer, .mf_name")
        let brand = brandEl ? (brandEl.textContent || "").trim() : ""
        if (!brand && args.brandNameOverride) brand = args.brandNameOverride
        // 일부 사이트는 상품명 전체 텍스트 첫 줄이 브랜드
        if (!brand) {
          const firstText = el.querySelector(".description, .spec, .summary")
          brand = firstText ? (firstText.textContent || "").trim().split("\n")[0].trim() : ""
        }

        // 세일가: price2 div 체크
        const price2El = el.querySelector(".price2, .sale_price, [class*=sale]")
        let originalPrice = price
        let salePrice: number | null = null
        if (price2El && !price2El.classList.contains("displaynone")) {
          const price2Text = (price2El.textContent || "").trim()
          const price2Match = price2Text.match(priceRegex)
          if (price2Match) {
            const p2 = parseInt(price2Match[0].replace(/,/g, ""), 10)
            if (p2 > 0 && p2 < (price || Infinity)) {
              // price2가 더 싸면: price=원가, price2=세일가
              originalPrice = price
              salePrice = p2
            }
          }
        }

        products.push({
          brand, name, category: args.categoryName,
          price: salePrice || price,
          originalPrice, salePrice,
          priceFormatted: price ? "₩" + price.toLocaleString() : "",
          imageUrl, productUrl, inStock,
          gender: args.gender, platform: args.platformKey,
          crawledAt: new Date().toISOString(),
        })
      }
      return {ok: true as const, products}
    } catch (e: unknown) {
      return {ok: false as const, error: (e as Error).message}
    }
    /* eslint-enable no-var */
  }, evalArgs)

  if (!evalResult.ok) {
    console.log(`      [eval-error] ${evalResult.error}`)
    return []
  }

  return evalResult.products || []
}

// ─── 카테고리 크롤 (페이지네이션 포함) ────────────────

async function crawlCategory(
  page: Page,
  config: SiteConfig,
  category: DiscoveredCategory
): Promise<Product[]> {
  const allProducts: Product[] = []
  const maxPages = config.maxPages || 10
  const delay = config.crawlDelay || 2000

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const separator = category.url.includes("?") ? "&" : "?"
    const url = pageNum === 1
      ? category.url
      : `${category.url}${separator}page=${pageNum}`

    try {
      await page.goto(url, {waitUntil: "load", timeout: 30000})
      await page.waitForTimeout(1500) // JS 렌더링 대기

      const products = await collectProductsFromPage(
        page,
        config,
        category.name,
        category.gender
      )

      if (products.length === 0) break // 빈 페이지면 중단

      allProducts.push(...products)

      // 페이지네이션 비활성이면 첫 페이지만
      if (!config.paginate) break

      await new Promise((r) => setTimeout(r, delay))
    } catch {
      break
    }
  }

  return allProducts
}

// ─── 메인 크롤 함수 ──────────────────────────────────

export async function crawlCafe24(
  page: Page,
  config: SiteConfig
): Promise<CrawlResult> {
  const startTime = Date.now()
  const errors: string[] = []
  const allProducts: Product[] = []

  const tag = `[${config.name}]`

  console.log(`\n${"─".repeat(50)}`)
  console.log(`🏪 ${config.name} (${config.baseUrl})`)
  console.log(`${"─".repeat(50)}`)

  // Step 1: 카테고리 탐색
  let categories: DiscoveredCategory[]

  if (config.category?.discovery === "manual" && config.category.categories) {
    categories = config.category.categories.map((c) => ({
      name: c.name,
      cateNo: c.cateNo,
      gender: c.gender || [],
      url: `${config.baseUrl}/product/list.html?cate_no=${c.cateNo}`,
    }))
    console.log(`${tag} 📋 수동 카테고리 ${categories.length}개`)
  } else {
    try {
      categories = await discoverCategories(page, config)
      console.log(`${tag} 📋 자동 탐색: ${categories.length}개 카테고리 발견`)
    } catch (err) {
      const msg = `카테고리 탐색 실패: ${err}`
      console.error(`${tag} ❌ ${msg}`)
      errors.push(msg)
      categories = []
    }
  }

  if (categories.length === 0) {
    console.log(`${tag} ⚠️ 카테고리 없음 — 메인 페이지에서 직접 수집 시도`)
    try {
      await page.goto(`${config.baseUrl}/product/list.html`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      await page.waitForTimeout(1500)
      const products = await collectProductsFromPage(page, config, config.name, config.defaultGender || [])
      allProducts.push(...products)
      console.log(`${tag} 📦 메인: ${products.length}개 상품`)
    } catch (err) {
      errors.push(`메인 페이지 수집 실패: ${err}`)
    }
  }

  // Step 2: 카테고리별 상품 수집
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    const delay = config.crawlDelay || 2000
    const gender = cat.gender.length > 0 ? cat.gender.join("/") : "all"

    try {
      const products = await crawlCategory(page, config, cat)
      allProducts.push(...products)

      const inStockCount = products.filter((p) => p.inStock).length
      console.log(
        `${tag} [${i + 1}/${categories.length}] ${gender} > ${cat.name} — ${products.length}개 (재고 ${inStockCount})`
      )

      for (const p of products) {
        const stock = p.inStock ? "" : " [품절]"
        console.log(
          `${tag}    ${p.priceFormatted || "가격없음"} — ${p.brand || "?"} | ${p.name.slice(0, 50)}${stock}`
        )
      }
    } catch (err) {
      const msg = `${cat.name} 수집 실패: ${err}`
      console.error(`${tag} ❌ ${msg}`)
      errors.push(msg)
    }

    await new Promise((r) => setTimeout(r, delay))
  }

  // 중복 제거 (productUrl 기준)
  const seen = new Set<string>()
  const uniqueProducts = allProducts.filter((p) => {
    if (!p.productUrl || seen.has(p.productUrl)) return false
    seen.add(p.productUrl)
    return true
  })

  // ── Step 3: 상세 페이지 크롤링 (2단계) ──
  if (config.crawlDetails) {
    console.log(`\n${tag} 🔍 상세 크롤링 시작 — ${uniqueProducts.length}개 상품`)
    let detailCount = 0
    const detailDelay = config.crawlDelay || 1500

    for (const product of uniqueProducts) {
      try {
        const detail = await parseDetailPage(page, product.productUrl, config.detailSelectors)

        if (detail.description) product.description = detail.description
        if (detail.color) product.color = detail.color
        if (detail.material) product.material = detail.material
        if (detail.images.length > 0) product.images = detail.images
        if (detail.productCode) product.productCode = detail.productCode

        detailCount++
        if (detailCount % 20 === 0) {
          process.stdout.write(`\r${tag}    📖 ${detailCount}/${uniqueProducts.length}`)
        }
      } catch {
        // 개별 실패는 skip
      }

      await new Promise((r) => setTimeout(r, detailDelay))
    }

    console.log(`\r${tag} ✅ 상세 크롤링 완료 — ${detailCount}/${uniqueProducts.length}`)
  }

  // 통계
  const uniqueBrands = new Set(uniqueProducts.map((p) => p.brand))
  const withPrice = uniqueProducts.filter((p) => p.price !== null)
  const avgPrice =
    withPrice.length > 0
      ? Math.round(withPrice.reduce((s, p) => s + (p.price || 0), 0) / withPrice.length)
      : 0

  const result: CrawlResult = {
    platform: config.key,
    products: uniqueProducts,
    stats: {
      totalProducts: uniqueProducts.length,
      inStock: uniqueProducts.filter((p) => p.inStock).length,
      outOfStock: uniqueProducts.filter((p) => !p.inStock).length,
      uniqueBrands: uniqueBrands.size,
      avgPrice,
      duration: Date.now() - startTime,
    },
    errors,
  }

  console.log(`\n${tag} ✅ 완료: ${result.stats.totalProducts}개 상품 | 재고 ${result.stats.inStock}개 | ${result.stats.uniqueBrands}개 브랜드 | ${(result.stats.duration / 1000).toFixed(1)}s`)

  return result
}
