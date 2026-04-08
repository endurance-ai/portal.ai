#!/usr/bin/env npx tsx
/**
 * 범용 플랫폼 크롤러 CLI
 *
 * 사용법:
 *   npx tsx scripts/crawl.ts --list                    # 등록된 플랫폼 목록
 *   npx tsx scripts/crawl.ts --site=obscura            # 단일 사이트
 *   npx tsx scripts/crawl.ts --site=obscura,llud       # 복수 사이트
 *   npx tsx scripts/crawl.ts --all                     # 전체 크롤링
 *   npx tsx scripts/crawl.ts --type=cafe24             # 타입별
 *   npx tsx scripts/crawl.ts --probe=obscura           # 사이트 구조 프로빙 (상품 안 긁음)
 *   npx tsx scripts/crawl.ts --dry-run --site=obscura  # 카테고리 탐색만 (상품 안 긁음)
 *
 * 출력: data/{platform-key}-products.json
 */

import {chromium} from "playwright"
import * as fs from "fs"
import * as path from "path"
import {getActivePlatforms, getPlatformsByType, getSiteConfig, PLATFORMS} from "./configs/platforms"
import {crawlCafe24} from "./lib/cafe24-engine"
import {crawlShopify} from "./lib/shopify-engine"
import type {CrawlResult, SiteConfig} from "./lib/types"

// ─── CLI 인자 파싱 ───────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=")
      flags[key] = val ?? true
    }
  }

  return flags
}

// ─── 프로빙 (사이트 구조 확인) ───────────────────────

async function probeSite(config: SiteConfig) {
  console.log(`\n🔍 프로빙: ${config.name} (${config.baseUrl})`)
  console.log(`   타입: ${config.type}`)

  if (config.type === "shopify") {
    try {
      const res = await fetch(`${config.baseUrl}/products.json?limit=1`)
      if (res.ok) {
        const data = await res.json()
        console.log(`   ✅ Shopify /products.json 접근 가능`)
        console.log(`   📦 샘플: ${data.products?.[0]?.title || "없음"}`)
      } else {
        console.log(`   ❌ HTTP ${res.status}`)
      }
    } catch (err) {
      console.log(`   ❌ 접속 실패: ${err}`)
    }
    return
  }

  // Cafe24 프로빙
  const browser = await chromium.launch({headless: true})
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  })
  const page = await context.newPage()

  try {
    // 메인 페이지 접속
    const response = await page.goto(config.baseUrl, {waitUntil: "domcontentloaded", timeout: 30000})
    console.log(`   HTTP: ${response?.status()}`)
    await page.waitForTimeout(2000)

    // 카테고리 링크 수집
    const cateLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="cate_no="]')
      return Array.from(links).slice(0, 20).map((a) => ({
        text: a.textContent?.trim().replace(/\s+/g, " ").slice(0, 30) || "",
        href: a.getAttribute("href") || "",
      }))
    })
    console.log(`   📋 카테고리 링크: ${cateLinks.length}개`)
    for (const l of cateLinks.slice(0, 8)) {
      console.log(`      ${l.text} → ${l.href}`)
    }

    // 상품 리스트 페이지 구조 확인
    if (cateLinks.length > 0) {
      const firstHref = cateLinks[0].href
      const testUrl = firstHref.startsWith("http")
        ? firstHref
        : `${config.baseUrl}${firstHref.startsWith("/") ? "" : "/"}${firstHref}`

      await page.goto(testUrl, {waitUntil: "domcontentloaded", timeout: 30000})
      await page.waitForTimeout(2000)

      const structure = await page.evaluate(() => {
        const selectors = [
          'li[id^="anchorBoxId"]',
          "ul.thumbnail > li",
          "ul.prdList > li",
          ".product-list .item",
          ".grid-list > li",
        ]
        const results: {selector: string; count: number}[] = []
        for (const sel of selectors) {
          const count = document.querySelectorAll(sel).length
          if (count > 0) results.push({selector: sel, count})
        }
        return results
      })

      console.log(`\n   🔧 상품 셀렉터 탐지:`)
      for (const s of structure) {
        console.log(`      ${s.selector} → ${s.count}개`)
      }

      if (structure.length === 0) {
        console.log(`      ⚠️ 기본 셀렉터로 상품을 찾지 못함 — 커스텀 셀렉터 필요`)
        // 페이지 구조 힌트 출력
        const hints = await page.evaluate(() => {
          const allLists = document.querySelectorAll("ul, ol, div.grid, div.list")
          return Array.from(allLists)
            .slice(0, 5)
            .map((el) => ({
              tag: el.tagName,
              className: el.className.slice(0, 60),
              children: el.children.length,
            }))
        })
        console.log(`\n   📐 페이지 구조 힌트:`)
        for (const h of hints) {
          console.log(`      <${h.tag.toLowerCase()} class="${h.className}"> (${h.children} children)`)
        }
      }
    }
  } catch (err) {
    console.log(`   ❌ 프로빙 실패: ${err}`)
  } finally {
    await browser.close()
  }
}

// ─── 크롤 실행 ────────────────────────────────────────

const PARALLEL_LIMIT = 3 // 동시 브라우저 수

async function runCrawl(configs: SiteConfig[], dryRun: boolean) {
  const results: CrawlResult[] = []
  const outDir = path.join(process.cwd(), "data")
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true})

  const cafe24Sites = configs.filter((c) => c.type === "cafe24")
  const shopifySites = configs.filter((c) => c.type === "shopify")

  // Shopify (브라우저 불필요 — 전부 병렬)
  if (shopifySites.length > 0) {
    const shopifyResults = await Promise.all(
      shopifySites.map(async (config) => {
        try {
          const result = await crawlShopify(config)
          saveResult(outDir, result)
          return result
        } catch (err) {
          console.error(`❌ ${config.name} 크롤 실패:`, err)
          return null
        }
      })
    )
    results.push(...shopifyResults.filter((r): r is CrawlResult => r !== null))
  }

  // Cafe24 — 사이트별 병렬 (PARALLEL_LIMIT개씩)
  if (cafe24Sites.length > 0) {
    console.log(`\n⚡ 병렬 크롤링: ${cafe24Sites.length}개 사이트, ${PARALLEL_LIMIT}개 동시\n`)

    for (let i = 0; i < cafe24Sites.length; i += PARALLEL_LIMIT) {
      const batch = cafe24Sites.slice(i, i + PARALLEL_LIMIT)
      const batchNames = batch.map((c) => c.name).join(", ")
      console.log(`\n🔄 배치 ${Math.floor(i / PARALLEL_LIMIT) + 1}: ${batchNames}`)

      const batchResults = await Promise.all(
        batch.map(async (config) => {
          // 사이트마다 독립 브라우저
          const browser = await chromium.launch({headless: true})
          const context = await browser.newContext({
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale: "ko-KR",
          })
          const page = await context.newPage()

          try {
            if (dryRun) {
              await probeSite(config)
              return null
            }
            const result = await crawlCafe24(page, config)
            saveResult(outDir, result)
            return result
          } catch (err) {
            console.error(`❌ ${config.name} 크롤 실패:`, err)
            return null
          } finally {
            await browser.close()
          }
        })
      )

      results.push(...batchResults.filter((r): r is CrawlResult => r !== null))
    }
  }

  if (!dryRun && results.length > 0) {
    printSummary(results)
  }
}

function saveResult(outDir: string, result: CrawlResult) {
  if (result.products.length === 0) return

  const outPath = path.join(outDir, `${result.platform}-products.json`)
  fs.writeFileSync(outPath, JSON.stringify(result.products, null, 2), "utf-8")
  console.log(`   💾 저장: ${outPath}`)
}

function printSummary(results: CrawlResult[]) {
  console.log("\n" + "═".repeat(60))
  console.log("🏁 전체 크롤링 완료")
  console.log("═".repeat(60))

  let totalProducts = 0
  let totalBrands = 0
  let totalErrors = 0

  console.log(`\n${"플랫폼".padEnd(20)} ${"상품".padStart(6)} ${"재고".padStart(6)} ${"브랜드".padStart(6)} ${"시간".padStart(8)}`)
  console.log("─".repeat(50))

  for (const r of results) {
    const config = getSiteConfig(r.platform)
    const name = config?.name || r.platform
    console.log(
      `${name.padEnd(20)} ${String(r.stats.totalProducts).padStart(6)} ${String(r.stats.inStock).padStart(6)} ${String(r.stats.uniqueBrands).padStart(6)} ${(r.stats.duration / 1000).toFixed(1).padStart(7)}s`
    )
    totalProducts += r.stats.totalProducts
    totalBrands += r.stats.uniqueBrands
    totalErrors += r.errors.length
  }

  console.log("─".repeat(50))
  console.log(
    `${"합계".padEnd(20)} ${String(totalProducts).padStart(6)} ${" ".padStart(6)} ${String(totalBrands).padStart(6)}`
  )

  if (totalErrors > 0) {
    console.log(`\n⚠️ 에러 ${totalErrors}건:`)
    for (const r of results) {
      for (const e of r.errors) {
        console.log(`   [${r.platform}] ${e}`)
      }
    }
  }

  console.log("\n" + "═".repeat(60))
}

// ─── 엔트리 ──────────────────────────────────────────

async function main() {
  const flags = parseArgs()
  const detailFlag = !!flags.detail
  const reviewFlag = !!flags.reviews

  // --list: 플랫폼 목록 출력
  if (flags.list) {
    console.log("\n📋 등록된 플랫폼:")
    console.log(`\n${"키".padEnd(20)} ${"이름".padEnd(16)} ${"타입".padEnd(10)} ${"상태".padEnd(6)}`)
    console.log("─".repeat(55))
    for (const p of PLATFORMS) {
      console.log(
        `${p.key.padEnd(20)} ${p.name.padEnd(16)} ${p.type.padEnd(10)} ${p.disabled ? "비활성" : "활성"}`
      )
    }
    console.log(`\n총 ${PLATFORMS.length}개 (활성 ${getActivePlatforms().length}개)`)
    return
  }

  // --probe: 사이트 구조 프로빙
  if (typeof flags.probe === "string") {
    const keys = flags.probe.split(",")
    for (const key of keys) {
      const config = getSiteConfig(key.trim())
      if (!config) {
        console.error(`❌ 알 수 없는 플랫폼: ${key}`)
        continue
      }
      await probeSite(config)
    }
    return
  }

  // 크롤 대상 결정
  let targets: SiteConfig[] = []
  const dryRun = !!flags["dry-run"]

  if (flags.all) {
    targets = getActivePlatforms()
  } else if (typeof flags.type === "string") {
    targets = getPlatformsByType(flags.type as SiteConfig["type"])
  } else if (typeof flags.site === "string") {
    const keys = flags.site.split(",")
    for (const key of keys) {
      const config = getSiteConfig(key.trim())
      if (config) {
        targets.push(config)
      } else {
        console.error(`❌ 알 수 없는 플랫폼: ${key} (--list로 확인)`)
      }
    }
  } else {
    console.log(`
🕷️ 범용 플랫폼 크롤러

사용법:
  npx tsx scripts/crawl.ts --list                     등록된 플랫폼 목록
  npx tsx scripts/crawl.ts --site=obscura             단일 사이트 크롤
  npx tsx scripts/crawl.ts --site=obscura,llud        복수 사이트
  npx tsx scripts/crawl.ts --all                      전체 크롤링
  npx tsx scripts/crawl.ts --type=cafe24              타입별 크롤링
  npx tsx scripts/crawl.ts --probe=obscura            사이트 구조 프로빙
  npx tsx scripts/crawl.ts --dry-run --site=obscura   카테고리만 탐색

옵션:
  --list        등록된 플랫폼 목록
  --site=KEY    크롤링 대상 (콤마 구분)
  --all         전체 활성 플랫폼
  --type=TYPE   cafe24 / shopify
  --probe=KEY   사이트 구조 확인
  --dry-run     카테고리 탐색만 (상품 안 긁음)
  --detail      상세 페이지 크롤링 (description, color, material 수집)
  --reviews     리뷰 크롤링 (--detail 없이도 가능, 리뷰 보드 페이지 기반)
`)
    return
  }

  if (targets.length === 0) {
    console.error("❌ 크롤링 대상이 없습니다")
    return
  }

  if (detailFlag) {
    for (const config of targets) {
      config.crawlDetails = true
    }
    console.log("📖 상세 페이지 크롤링 활성화")
  }

  if (reviewFlag) {
    for (const config of targets) {
      config.crawlReviews = true
    }
    console.log("💬 리뷰 크롤링 활성화")
  }

  console.log(`\n🚀 크롤링 시작: ${targets.map((t) => t.name).join(", ")}`)
  if (dryRun) console.log("   (dry-run 모드 — 카테고리 탐색만)")

  await runCrawl(targets, dryRun)
}

main().catch(console.error)
