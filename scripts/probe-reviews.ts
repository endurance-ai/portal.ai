#!/usr/bin/env npx tsx
/**
 * 리뷰 파서 프로브 — DB에서 상품 URL을 가져와 리뷰 추출 테스트
 *
 * 사용법:
 *   npx dotenv -e .env.local -- npx tsx scripts/probe-reviews.ts --site=adekuver --count=3
 *   npx dotenv -e .env.local -- npx tsx scripts/probe-reviews.ts --url="https://..."
 */

import {chromium} from "playwright"
import {createClient} from "@supabase/supabase-js"
import {parseReviews} from "./lib/review-parser"
import {parseDetailPage} from "./lib/detail-parser"

// ─── 환경 ────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function parseArgs() {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=", 2)
      if (eqIdx === -1) {
        flags[arg.slice(2)] = true
      } else {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1)
      }
    }
  }
  return flags
}

// ─── 메인 ────────────────────────────────────────────

async function main() {
  const flags = parseArgs()
  const directUrl = flags.url as string | undefined
  const site = (flags.site as string) || "adekuver"
  const count = flags.count ? parseInt(flags.count as string, 10) : 3

  console.log(`\n🔍 리뷰 파서 프로브`)
  console.log(`${"─".repeat(50)}`)

  let productUrls: string[]

  if (directUrl) {
    productUrls = [directUrl]
  } else {
    // DB에서 해당 플랫폼의 상품 URL 가져오기
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (dotenv -e .env.local 사용)")
      process.exit(1)
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data, error } = await supabase
      .from("products")
      .select("product_url, brand, name")
      .eq("platform", site)
      .eq("in_stock", true)
      .not("product_url", "is", null)
      .limit(count)

    if (error || !data?.length) {
      console.error(`❌ ${site}에서 상품을 찾을 수 없음:`, error?.message || "데이터 없음")
      process.exit(1)
    }

    productUrls = data.map((p) => p.product_url)
    console.log(`   사이트: ${site}`)
    console.log(`   📦 DB에서 ${data.length}개 상품 URL 가져옴`)
    for (const p of data) {
      console.log(`      - ${p.brand} | ${p.name?.slice(0, 40)}`)
    }
    console.log()
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "ko-KR",
  })
  const page = await context.newPage()

  for (let i = 0; i < productUrls.length; i++) {
    const url = productUrls[i]
    console.log(`${"─".repeat(50)}`)
    console.log(`[${i + 1}/${productUrls.length}] ${url}`)
    console.log()

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
      await page.waitForTimeout(2000)

      // 상세 데이터 추출
      const detail = await parseDetailPage(page, url)
      console.log(`   📖 상세 데이터:`)
      console.log(`      설명: ${detail.description ? detail.description.slice(0, 100) + "..." : "없음"}`)
      console.log(`      색상: ${detail.color || "없음"}`)
      console.log(`      소재: ${detail.material || "없음"}`)
      console.log(`      이미지: ${detail.images.length}장`)
      console.log(`      상품코드: ${detail.productCode || "없음"}`)

      // 페이지 리뷰 영역 디버깅
      const debugInfo = await page.evaluate(() => {
        const body = document.body.innerHTML
        const hasReviewKeyword = body.includes("review") || body.includes("리뷰") || body.includes("후기")
        const reviewEls = document.querySelectorAll('[class*="review"], [id*="review"], [class*="후기"]')
        const boardEls = document.querySelectorAll('.board_list, .board_content')
        const tabEls = Array.from(document.querySelectorAll("a")).filter(a => {
          const t = (a.textContent || "").toLowerCase()
          return t.includes("review") || t.includes("리뷰") || t.includes("후기")
        }).map(a => ({ text: (a.textContent || "").trim().slice(0, 50), href: a.getAttribute("href") }))

        return {
          hasReviewKeyword,
          reviewElCount: reviewEls.length,
          boardElCount: boardEls.length,
          tabs: tabEls.slice(0, 5),
          bodyLen: body.length,
        }
      })
      console.log(`\n   🔍 디버그:`)
      console.log(`      페이지 크기: ${debugInfo.bodyLen} chars`)
      console.log(`      리뷰 키워드 존재: ${debugInfo.hasReviewKeyword}`)
      console.log(`      리뷰 관련 요소: ${debugInfo.reviewElCount}개`)
      console.log(`      게시판 요소: ${debugInfo.boardElCount}개`)
      console.log(`      리뷰 탭: ${JSON.stringify(debugInfo.tabs)}`)

      // 리뷰 추출
      const reviewData = await parseReviews(page, 5)
      console.log(`\n   💬 리뷰 데이터:`)
      console.log(`      총 리뷰 수: ${reviewData.reviewCount}`)
      console.log(`      평균 별점: ${reviewData.averageRating ?? "없음"}`)
      console.log(`      추출된 리뷰: ${reviewData.reviews.length}개`)

      for (const [j, review] of reviewData.reviews.entries()) {
        console.log(`\n      [리뷰 ${j + 1}]`)
        console.log(`         별점: ${review.rating ?? "없음"}`)
        console.log(`         작성자: ${review.author ?? "없음"}`)
        console.log(`         날짜: ${review.date ?? "없음"}`)
        console.log(`         사진: ${review.photoUrls.length}장`)
        console.log(`         본문: ${review.text.slice(0, 150)}${review.text.length > 150 ? "..." : ""}`)
        if (review.body) {
          console.log(`         체형: 키=${review.body.height || "-"} 몸무게=${review.body.weight || "-"} 평소사이즈=${review.body.usualSize || "-"} 구매사이즈=${review.body.purchasedSize || "-"} 체형=${review.body.bodyType || "-"}`);
        }
      }
    } catch (err) {
      console.error(`   ❌ 실패: ${(err as Error).message}`)
    }

    console.log()
    await new Promise((r) => setTimeout(r, 2000))
  }

  await browser.close()
  console.log(`${"─".repeat(50)}`)
  console.log("✅ 프로브 완료")
}

main().catch((err) => {
  console.error("💥 예외:", err)
  process.exit(1)
})
