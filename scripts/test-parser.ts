#!/usr/bin/env npx tsx
/**
 * 파서 검증 스크립트 — 3개 상품만 파싱해서 결과 출력
 * Usage: npx tsx scripts/test-parser.ts <platform> [count=3]
 */

import {chromium} from "playwright"
import * as fs from "fs"
import {getDetailParser} from "./lib/parsers/detail"

const platform = process.argv[2]
const count = parseInt(process.argv[3] || "3", 10)

if (!platform) {
  console.error("Usage: npx tsx scripts/test-parser.ts <platform> [count]")
  process.exit(1)
}

const dataPath = `data/${platform}-products.json`
if (!fs.existsSync(dataPath)) {
  console.error(`❌ ${dataPath} not found`)
  process.exit(1)
}
const products = JSON.parse(fs.readFileSync(dataPath, "utf-8"))
const urls = products.slice(0, count).map((p: {productUrl: string}) => p.productUrl)

;(async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.route("**/*.{png,jpg,jpeg,gif,webp,svg}", (r) => r.abort())

    const parser = getDetailParser(platform)
    console.log(`\n🧪 ${platform} 파서 검증 (${urls.length}개)\n`)

    for (const url of urls) {
      const result = await parser.parse(page, url)
      console.log(`── ${url}`)
      console.log(`   desc: ${result.description?.slice(0, 120) ?? "null"}`)
      console.log(`   material: ${result.material ?? "null"}`)
      console.log(`   color: ${result.color ?? "null"}`)
      console.log(`   code: ${result.productCode ?? "null"}`)
      console.log()
    }

    console.log("✅ 완료")
  } finally {
    await browser.close()
  }
})()
