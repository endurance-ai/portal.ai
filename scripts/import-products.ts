/**
 * 크롤링 JSON → Supabase products 테이블 적재
 *
 * 사용법:
 *   npx dotenv -e .env.local -- npx tsx scripts/import-products.ts                  # data/ 내 전체
 *   npx dotenv -e .env.local -- npx tsx scripts/import-products.ts --site=obscura   # 특정 플랫폼만
 */

import * as fs from "fs"
import * as path from "path"
import {createClient} from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요")
  console.error("   .env.local에서 로드하려면: npx dotenv -e .env.local -- npx tsx scripts/import-products.ts")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface CrawledReview {
  text: string
  author: string
  date: string
  photoUrls: string[]
  body: {
    height: string | null
    weight: string | null
    usualSize: string | null
    purchasedSize: string | null
    bodyType: string | null
  } | null
}

interface CrawledProduct {
  brand: string
  name: string
  price: number | null
  priceFormatted: string
  imageUrl: string
  productUrl: string
  inStock: boolean
  gender: string[]
  platform: string
  crawledAt: string
  // 상세 페이지 데이터
  description?: string
  color?: string
  material?: string
  subcategory?: string
  images?: string[]
  sizeInfo?: string
  tags?: string[]
  productCode?: string
  // 리뷰 데이터
  reviewCount?: number
  reviews?: CrawledReview[]
}

// 자사몰: brand가 비어있으면 이 이름으로 채움
const SELF_BRANDED: Record<string, string> = {
  roughside: "Roughside",
  bastong: "Bastong",
  blankroom: "Blankroom",
  havati: "Havati",
  mardimercredi: "Mardi Mercredi",
  sienneboutique: "Sienne",
  eastlogue: "Eastlogue",
  anotheroffice: "Another Office",
  slowsteadyclub: "Slow Steady Club",
  llud: "LLUD",
  pottery: "Pottery",
  beslow: "Beslow",
  steadyeverywear: "Steady Everywear",
  chanceclothing: "Chance Clothing",
}

async function main() {
  const dataDir = path.join(process.cwd(), "data")

  if (!fs.existsSync(dataDir)) {
    console.error(`❌ data/ 디렉토리 없음. 먼저 크롤러 실행: npx tsx scripts/crawl.ts --help`)
    process.exit(1)
  }

  // --site 플래그 파싱
  const siteArg = process.argv.find((a) => a.startsWith("--site="))
  const targetSites = siteArg ? siteArg.split("=")[1].split(",") : null

  // data/ 내 *-products.json 파일 찾기
  const files = fs.readdirSync(dataDir)
    .filter((f) => f.endsWith("-products.json"))
    .filter((f) => {
      if (!targetSites) return true
      const platform = f.replace("-products.json", "")
      return targetSites.includes(platform)
    })

  if (files.length === 0) {
    console.error("❌ 적재할 파일 없음")
    process.exit(1)
  }

  console.log(`📦 ${files.length}개 파일 적재 시작\n`)

  // brand_nodes에서 브랜드 → 노드 매핑 가져오기 (normalized + raw 양쪽으로 조회)
  const {data: brandNodes, error: bnError} = await supabase
    .from("brand_nodes")
    .select("brand_name, brand_name_normalized, style_node")

  const nodeMap = new Map<string, string>()
  if (bnError) {
    console.warn("⚠️ brand_nodes 조회 실패:", bnError.message)
  } else if (brandNodes) {
    for (const bn of brandNodes) {
      // normalized name으로 매핑 (우선)
      if (bn.brand_name_normalized) {
        nodeMap.set(bn.brand_name_normalized.toLowerCase(), bn.style_node)
      }
      // raw name으로도 매핑 (호환)
      nodeMap.set(bn.brand_name.toLowerCase(), bn.style_node)
    }
    console.log(`🏷️ brand_nodes에서 ${nodeMap.size}개 매핑 로드\n`)
  }

  let totalInserted = 0
  let totalErrors = 0
  let totalReviews = 0

  for (const file of files) {
    const filePath = path.join(dataDir, file)
    const platform = file.replace("-products.json", "")

    let raw: CrawledProduct[]
    try {
      raw = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    } catch (parseErr) {
      console.error(`   ❌ ${file} JSON 파싱 실패:`, (parseErr as Error).message)
      totalErrors++
      continue
    }
    console.log(`📄 ${file} — ${raw.length}개 상품`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = raw.map((p: any) => {
      const brand = (p.brand as string) || SELF_BRANDED[platform] || ""
      const productUrl = (p.productUrl as string) || ""
      // product_no 추출
      const pnoMatch = productUrl.match(/product_no=(\d+)/)
      const productNo = pnoMatch ? parseInt(pnoMatch[1], 10) : null

      // 가격 정합성: integer 범위(2^31) 초과 or 비현실적 값 제거
      const MAX_PRICE = 100_000_000 // 1억원
      const sanitizePrice = (v: unknown): number | null => {
        const n = typeof v === "number" ? v : null
        return n && n > 0 && n <= MAX_PRICE ? n : null
      }

      return {
        brand,
        name: p.name as string,
        category: (p.category as string) || null,
        price: sanitizePrice(p.salePrice) ?? sanitizePrice(p.price),
        original_price: sanitizePrice(p.originalPrice) ?? sanitizePrice(p.price),
        sale_price: sanitizePrice(p.salePrice),
        product_no: productNo,
        image_url: p.imageUrl as string,
        product_url: productUrl,
        in_stock: p.inStock as boolean,
        platform: (p.platform as string) || platform,
        gender: p.gender as string[],
        style_node: nodeMap.get(brand.toLowerCase()) || null,
        crawled_at: p.crawledAt as string,
        description: p.description?.slice(0, 2000) || null,
        color: p.color?.slice(0, 500) || null,
        material: p.material?.slice(0, 200) || null,
        subcategory: p.subcategory || null,
        images: p.images?.slice(0, 10) || null,
        size_info: p.sizeInfo?.slice(0, 2000) || null,
        tags: p.tags?.slice(0, 50) || null,
        product_code: p.productCode?.slice(0, 100) || null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })

    // 50개씩 배치 upsert
    const BATCH = 50
    let inserted = 0
    let errors = 0

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const {error} = await supabase.from("products").upsert(batch, {
        onConflict: "product_url",
        ignoreDuplicates: false,
      })

      if (error) {
        console.error(`   ❌ 배치 ${i}-${i + batch.length} 실패:`, error.message)
        errors++
      } else {
        inserted += batch.length
        process.stdout.write(`\r   💾 ${inserted}/${rows.length}`)
      }
    }

    console.log(`\r   ✅ ${inserted}/${rows.length} 적재 (에러 ${errors}건)`)
    totalInserted += inserted
    totalErrors += errors

    // === 리뷰 import ===
    const productsWithReviews = raw.filter(
      (p) => p.reviews && p.reviews.length > 0
    )
    if (productsWithReviews.length > 0) {
      console.log(`   📝 리뷰 있는 상품 ${productsWithReviews.length}개 처리 중...`)

      // product_url → product_id 매핑 조회 (30개씩 배치 — URL 길이 제한 방지)
      const urls = productsWithReviews.map((p) => p.productUrl)
      const URL_BATCH = 30
      const urlToId = new Map<string, string>()
      let lookupFailed = false

      for (let i = 0; i < urls.length; i += URL_BATCH) {
        const batch = urls.slice(i, i + URL_BATCH)
        const {data, error: lookupErr} = await supabase
          .from("products")
          .select("id, product_url")
          .in("product_url", batch)

        if (lookupErr) {
          console.error(`   ❌ product_id 조회 실패 (${i}-${i + batch.length}):`, lookupErr.message)
          lookupFailed = true
          break
        }
        if (data) {
          for (const p of data) urlToId.set(p.product_url, p.id)
        }
      }

      if (!lookupFailed && urlToId.size > 0) {

        // 리뷰 행 구성
        const reviewRows: Array<{
          product_id: string
          text: string | null
          author: string | null
          review_date: string | null
          photo_urls: string[]
          body_info: Record<string, unknown> | null
        }> = []

        for (const p of productsWithReviews) {
          const productId = urlToId.get(p.productUrl)
          if (!productId || !p.reviews) continue

          for (const r of p.reviews) {
            reviewRows.push({
              product_id: productId,
              text: r.text?.slice(0, 5000) || null,
              author: r.author?.slice(0, 100) || null,
              review_date: r.date || null,
              photo_urls: r.photoUrls || [],
              body_info: r.body || null,
            })
          }
        }

        // 기존 리뷰 삭제 후 재삽입 (중복 방지)
        const productIds = [...new Set(reviewRows.map((r) => r.product_id))]
        if (productIds.length > 0) {
          await supabase
            .from("product_reviews")
            .delete()
            .in("product_id", productIds)
        }

        // 50개씩 배치 insert
        let reviewInserted = 0
        for (let i = 0; i < reviewRows.length; i += BATCH) {
          const batch = reviewRows.slice(i, i + BATCH)
          const {error: revErr} = await supabase
            .from("product_reviews")
            .insert(batch)

          if (revErr) {
            console.error(`   ❌ 리뷰 배치 ${i}-${i + batch.length} 실패:`, revErr.message)
          } else {
            reviewInserted += batch.length
          }
        }
        console.log(`   📝 리뷰 ${reviewInserted}/${reviewRows.length}건 적재`)
        totalReviews += reviewInserted

        // products 테이블에 review_count 업데이트
        for (const p of productsWithReviews) {
          const productId = urlToId.get(p.productUrl)
          if (!productId) continue

          await supabase
            .from("products")
            .update({ review_count: (p.reviews || []).length })
            .eq("id", productId)
        }
      }
    }
  }

  console.log("\n" + "═".repeat(50))
  console.log(`🏁 전체 적재 완료: ${totalInserted}개 성공, ${totalErrors}건 에러`)
  if (totalReviews > 0) {
    console.log(`📝 리뷰 적재: ${totalReviews}건`)
  }
  console.log("═".repeat(50))
}

main().catch(console.error)
