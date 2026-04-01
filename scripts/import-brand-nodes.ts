/**
 * Fashion Genome 엑셀 Brand_DB → Supabase brand_nodes 적재
 *
 * 실행: pnpm exec dotenv -e .env.local -- npx tsx scripts/import-brand-nodes.ts
 */

import * as fs from "fs"
import * as XLSX from "xlsx"
import * as path from "path"
import {createClient} from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// 엑셀 파일 경로
const EXCEL_PATH = path.resolve(
  process.argv[2] || path.join(process.cwd(), "data", "Fashion_genome_root.xlsx")
)

if (!fs.existsSync(EXCEL_PATH)) {
  console.error(`❌ 엑셀 파일 없음: ${EXCEL_PATH}`)
  console.error("   사용법: npx tsx scripts/import-brand-nodes.ts [엑셀 경로]")
  console.error("   또는 data/Fashion_genome_root.xlsx에 파일 배치")
  process.exit(1)
}

async function main() {
  console.log(`📄 엑셀 로드: ${EXCEL_PATH}\n`)

  const wb = XLSX.readFile(EXCEL_PATH)
  const ws = wb.Sheets["Brand_DB"]
  if (!ws) {
    console.error("❌ Brand_DB 시트를 찾을 수 없음")
    process.exit(1)
  }

  const rows = XLSX.utils.sheet_to_json<{
    brand_name: string
    platform: string
    sensitivity_tags: string
    price_band: string
    final_node_name: string
    ssense_gender_scope: string
  }>(ws)

  console.log(`📦 Brand_DB: ${rows.length}개 행\n`)

  const brandNodes = rows
    .filter((r) => r.brand_name && r.final_node_name && r.final_node_name !== "보류")
    .map((r) => {
      // "C 미니멀_컨템퍼러리" → "C"
      const nodeId = r.final_node_name.split(" ")[0]

      // "미니멀, 하이엔드" → ["미니멀", "하이엔드"]
      const tags = r.sensitivity_tags
        ? r.sensitivity_tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : []

      // "men" → ["men"], "women" → ["women"], null → []
      const gender = r.ssense_gender_scope
        ? r.ssense_gender_scope.split(",").map((g: string) => g.trim()).filter(Boolean)
        : []

      // platform: "샵아모멘토, ssense" → 첫 번째 값
      const platform = r.platform
        ? r.platform.split(",")[0].trim()
        : null

      return {
        brand_name: r.brand_name.trim(),
        platform,
        style_node: nodeId,
        sensitivity_tags: tags,
        gender_scope: gender,
        price_band: r.price_band || null,
        updated_at: new Date().toISOString(),
      }
    })

  console.log(`🏷️ 유효 브랜드: ${brandNodes.length}개 (보류 제외)\n`)

  // 노드 분포 출력
  const nodeDist: Record<string, number> = {}
  for (const bn of brandNodes) {
    nodeDist[bn.style_node] = (nodeDist[bn.style_node] || 0) + 1
  }
  console.log("📊 노드 분포:")
  for (const [node, count] of Object.entries(nodeDist).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${node}: ${count}개`)
  }

  // 배치 upsert
  const BATCH = 50
  let inserted = 0
  let errors = 0

  for (let i = 0; i < brandNodes.length; i += BATCH) {
    const batch = brandNodes.slice(i, i + BATCH)
    const { error } = await supabase.from("brand_nodes").upsert(batch, {
      onConflict: "brand_name,platform",
      ignoreDuplicates: false,
    })

    if (error) {
      console.error(`\n   ❌ 배치 ${i}-${i + batch.length} 실패:`, error.message)
      errors++
    } else {
      inserted += batch.length
      process.stdout.write(`\r   💾 ${inserted}/${brandNodes.length} 적재`)
    }
  }

  console.log("\n\n" + "═".repeat(50))
  console.log(`🏁 brand_nodes 적재 완료: ${inserted}개 성공, ${errors}건 에러`)
  console.log("═".repeat(50))

  // products 테이블의 style_node도 업데이트
  console.log("\n🔄 products.style_node 업데이트 중...")

  let updated = 0
  for (const bn of brandNodes) {
    const { error } = await supabase
      .from("products")
      .update({ style_node: bn.style_node })
      .eq("brand", bn.brand_name)
      .is("style_node", null)

    if (!error) updated++
  }

  console.log(`✅ products ${updated}개 상품에 style_node 매핑 완료`)
}

main().catch(console.error)
