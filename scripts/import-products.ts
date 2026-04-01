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

  // brand_nodes에서 브랜드 → 노드 매핑 가져오기
  const {data: brandNodes, error: bnError} = await supabase
    .from("brand_nodes")
    .select("brand_name, style_node")

  const nodeMap = new Map<string, string>()
  if (bnError) {
    console.warn("⚠️ brand_nodes 조회 실패:", bnError.message)
  } else if (brandNodes) {
    for (const bn of brandNodes) {
      nodeMap.set(bn.brand_name.toLowerCase(), bn.style_node)
    }
    console.log(`🏷️ brand_nodes에서 ${nodeMap.size}개 매핑 로드\n`)
  }

  let totalInserted = 0
  let totalErrors = 0

  for (const file of files) {
    const filePath = path.join(dataDir, file)
    const platform = file.replace("-products.json", "")

    const raw: CrawledProduct[] = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    console.log(`📄 ${file} — ${raw.length}개 상품`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = raw.map((p: any) => {
      const brand = (p.brand as string) || ""
      const productUrl = (p.productUrl as string) || ""
      // product_no 추출
      const pnoMatch = productUrl.match(/product_no=(\d+)/)
      const productNo = pnoMatch ? parseInt(pnoMatch[1], 10) : null

      return {
        brand,
        name: p.name as string,
        category: (p.category as string) || null,
        price: (p.salePrice as number) || (p.price as number) || null,
        original_price: (p.originalPrice as number) || (p.price as number) || null,
        sale_price: (p.salePrice as number) || null,
        product_no: productNo,
        image_url: p.imageUrl as string,
        product_url: productUrl,
        in_stock: p.inStock as boolean,
        platform: (p.platform as string) || platform,
        gender: p.gender as string[],
        style_node: nodeMap.get(brand.toLowerCase()) || null,
        crawled_at: p.crawledAt as string,
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
  }

  console.log("\n" + "═".repeat(50))
  console.log(`🏁 전체 적재 완료: ${totalInserted}개 성공, ${totalErrors}건 에러`)
  console.log("═".repeat(50))
}

main().catch(console.error)
