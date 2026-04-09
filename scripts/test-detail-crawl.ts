#!/usr/bin/env npx tsx
/**
 * 상세 페이지 구조 탐색 스크립트
 * Usage: npx tsx scripts/test-detail-crawl.ts <platform> [count=3]
 */

import {chromium} from "playwright"
import * as fs from "fs"

const platform = process.argv[2]
const count = parseInt(process.argv[3] || "3", 10)

if (!platform) {
  console.error("Usage: npx tsx scripts/test-detail-crawl.ts <platform> [count]")
  process.exit(1)
}

const dataPath = `data/${platform}-products.json`
if (!fs.existsSync(dataPath)) {
  console.error(`❌ ${dataPath} not found`)
  process.exit(1)
}

const products = JSON.parse(fs.readFileSync(dataPath, "utf-8"))
const urls = products.slice(0, count).map((p: {productUrl: string}) => p.productUrl)

async function probe(url: string) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // 이미지 차단으로 속도 향상
  await page.route("**/*.{png,jpg,jpeg,gif,webp,svg}", (route) => route.abort())

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(1500)

    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: Record<string, any> = {}

      // 1. Description 후보 셀렉터
      const descSels = [
        ".cont_detail", "#prdDetail", ".product-detail",
        ".xans-product-detaildesign", ".detail_cont", "#productDetail",
        ".item.open .content", ".prd_detail_box",
        ".ec-base-tab", "li[data-name]",
        ".xans-product-additional",
        ".product_info", ".product-add-info",
        ".detailArea", "#detail", ".detail-info",
      ]
      out.descriptionSelectors = {}
      for (const sel of descSels) {
        const el = document.querySelector(sel)
        if (el) {
          const text = (el as HTMLElement).innerText?.trim() || ""
          out.descriptionSelectors[sel] = text.slice(0, 300) + (text.length > 300 ? "..." : "")
        }
      }

      // 2. Color/Option 셀렉터
      const colorSels = [
        'select[name*="option"] option',
        'select[id*="option"] option',
        ".opt_list li", ".product-option li",
        'ul[option_title] li', ".xans-product-option li",
      ]
      out.colorSelectors = {}
      for (const sel of colorSels) {
        const els = document.querySelectorAll(sel)
        if (els.length > 0) {
          out.colorSelectors[sel] = Array.from(els)
            .map((e) => (e as HTMLElement).innerText?.trim())
            .filter(Boolean)
            .slice(0, 10)
        }
      }

      // 3. Product Code
      const codeSels = [".product_code", ".prd_code", ".product-code"]
      out.codeSelectors = {}
      for (const sel of codeSels) {
        const el = document.querySelector(sel)
        if (el) out.codeSelectors[sel] = (el as HTMLElement).innerText?.trim()
      }

      // 4. body text 키워드 매칭 (소재/Material)
      const bodyText = document.body.innerText || ""
      const matPatterns = [
        /소재\s*[:：]?\s*([^\n]{3,80})/i,
        /원단\s*[:：]?\s*([^\n]{3,80})/i,
        /Material\s*[:：]?\s*([^\n]{3,80})/i,
        /Fabric\s*[:：]?\s*([^\n]{3,80})/i,
        /Composition\s*[:：]?\s*([^\n]{3,80})/i,
        /혼용률\s*[:：]?\s*([^\n]{3,80})/i,
        /OUTSHELL\s*[:：]?\s*([^\n]{3,80})/i,
        /겉감\s*[:：]?\s*([^\n]{3,80})/i,
        /\[MATERIAL\]\s*([^\n]{3,80})/i,
        /COTTON\s*\d+%/i,
        /POLYESTER\s*\d+%/i,
      ]
      out.materialMatches = []
      for (const pat of matPatterns) {
        const m = bodyText.match(pat)
        if (m) out.materialMatches.push({ pattern: pat.source, match: m[0].slice(0, 200) })
      }

      // 5. Review 탐색
      const reviewLinks = document.querySelectorAll('a[href*="board"]')
      out.reviewBoardLinks = reviewLinks.length
      const reviewMatch = bodyText.match(/리뷰\s*\(?\s*(\d+)\s*\)?/)
      out.reviewCount = reviewMatch ? reviewMatch[1] : null

      // 6. 주요 구조 정보
      const tabs = document.querySelectorAll("li[data-name]")
      out.dataTabs = Array.from(tabs).map((t) => ({
        name: t.getAttribute("data-name"),
        text: (t as HTMLElement).innerText?.trim().slice(0, 50),
      }))

      // 7. xans-product-additional 내용
      const additional = document.querySelector(".xans-product-additional")
      if (additional) {
        out.additionalText = (additional as HTMLElement).innerText?.trim().slice(0, 500)
      }

      // 8. 상품간략설명 테이블
      const briefRows = document.querySelectorAll(".xans-product-detaildesign tr")
      out.detailDesignRows = Array.from(briefRows).slice(0, 5).map((tr) => (tr as HTMLElement).innerText?.trim().slice(0, 200))

      return out
    })

    console.log(`\n${"═".repeat(80)}`)
    console.log(`🔍 ${url}`)
    console.log(`${"═".repeat(80)}`)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(`❌ ${url}: ${(err as Error).message}`)
  } finally {
    await browser.close()
  }
}

;(async () => {
  console.log(`\n🧪 ${platform} 상세 페이지 구조 탐색 (${urls.length}개)`)
  for (const url of urls) {
    await probe(url)
  }
  console.log("\n✅ 완료")
})()
