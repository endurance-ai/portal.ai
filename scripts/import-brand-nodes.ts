/**
 * Fashion Genome v2 엑셀 Brand_DB → Supabase brand_nodes 적재
 *
 * v2 변경사항:
 *   - brand_name_raw + brand_name_normalized (정규화)
 *   - source_platforms (멀티 플랫폼)
 *   - brand_keywords (검색 키워드)
 *   - category_type (의류/주얼리/제외)
 *   - gender_scope (범용 — SSENSE 한정 아님)
 *
 * 실행: pnpm exec dotenv -e .env.local -- npx tsx scripts/import-brand-nodes.ts [엑셀 경로]
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

const EXCEL_PATH = path.resolve(
  process.argv[2] || path.join(process.cwd(), "data", "Fashion_genome_root_source_platforms_final.xlsx")
)

if (!fs.existsSync(EXCEL_PATH)) {
  console.error(`❌ 엑셀 파일 없음: ${EXCEL_PATH}`)
  console.error("   사용법: npx tsx scripts/import-brand-nodes.ts [엑셀 경로]")
  console.error("   또는 data/Fashion_genome_root_source_platforms_final.xlsx에 파일 배치")
  process.exit(1)
}

/** 콤마 구분 문자열 → 정리된 배열 */
function parseCSV(value: string | undefined | null): string[] {
  if (!value) return []
  return value.split(",").map((s) => s.trim()).filter(Boolean)
}

async function main() {
  console.log(`📄 엑셀 로드: ${EXCEL_PATH}\n`)

  const wb = XLSX.readFile(EXCEL_PATH)
  const ws = wb.Sheets["Brand_DB"]
  if (!ws) {
    console.error("❌ Brand_DB 시트를 찾을 수 없음")
    process.exit(1)
  }

  // v2 헤더에 맞춰 파싱
  const rows = XLSX.utils.sheet_to_json<{
    brand_name_raw: string
    brand_name_normalized: string
    final_node_name: string
    category_type: string
    price_band: string
    sensitivity_tags: string
    brand_keywords: string
    gender_scope: string
    source_platforms: string
    source_url: string
    review_status: string
    memo: string
  }>(ws)

  console.log(`📦 Brand_DB: ${rows.length}개 행\n`)

  const brandNodes = rows
    .filter((r) => r.brand_name_normalized && r.final_node_name && r.final_node_name !== "보류")
    .map((r) => {
      // "C 미니멀_컨템퍼러리" → "C"
      const nodeId = r.final_node_name.split(" ")[0]

      return {
        brand_name: r.brand_name_raw?.trim() || r.brand_name_normalized.trim(),
        brand_name_normalized: r.brand_name_normalized.trim(),
        style_node: nodeId,
        sensitivity_tags: parseCSV(r.sensitivity_tags),
        brand_keywords: parseCSV(r.brand_keywords),
        gender_scope: parseCSV(r.gender_scope),
        price_band: r.price_band || null,
        category_type: r.category_type || null,
        source_platforms: parseCSV(r.source_platforms),
        platform: parseCSV(r.source_platforms)[0] || null, // 호환용: 첫 번째 플랫폼
        updated_at: new Date().toISOString(),
      }
    })

  // category_type = "제외" 통계
  const excluded = rows.filter((r) => r.category_type === "제외").length
  console.log(`🏷️ 유효 브랜드: ${brandNodes.length}개 (보류 제외)`)
  console.log(`🚫 제외 브랜드 (향/라이프스타일): ${excluded}개 (적재는 하되 검색에서 필터링)\n`)

  // 노드 분포 출력
  const nodeDist: Record<string, number> = {}
  for (const bn of brandNodes) {
    nodeDist[bn.style_node] = (nodeDist[bn.style_node] || 0) + 1
  }
  console.log("📊 노드 분포:")
  for (const [node, count] of Object.entries(nodeDist).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${node}: ${count}개`)
  }

  // 카테고리 분포
  const catDist: Record<string, number> = {}
  for (const bn of brandNodes) {
    const cat = bn.category_type || "미분류"
    catDist[cat] = (catDist[cat] || 0) + 1
  }
  console.log("\n📊 카테고리 분포:")
  for (const [cat, count] of Object.entries(catDist).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count}개`)
  }

  // 성별 분포
  const genderDist: Record<string, number> = {men: 0, women: 0, unisex: 0, unknown: 0}
  for (const bn of brandNodes) {
    if (bn.gender_scope.length === 0) genderDist["unknown"]++
    else for (const g of bn.gender_scope) genderDist[g] = (genderDist[g] || 0) + 1
  }
  console.log("\n📊 성별 분포:")
  for (const [g, count] of Object.entries(genderDist)) {
    console.log(`   ${g}: ${count}개`)
  }

  // 배치 upsert (brand_name_normalized 기준)
  const BATCH = 50
  let inserted = 0
  let errors = 0

  for (let i = 0; i < brandNodes.length; i += BATCH) {
    const batch = brandNodes.slice(i, i + BATCH)
    const {error} = await supabase.from("brand_nodes").upsert(batch, {
      onConflict: "brand_name_normalized",
      ignoreDuplicates: false,
    })

    if (error) {
      console.error(`\n   ❌ 배치 ${i}-${i + batch.length} 실패:`, error.message)
      errors++
    } else {
      inserted += batch.length
      process.stdout.write(`\r\n   💾 ${inserted}/${brandNodes.length} 적재`)
    }
  }

  console.log("\n\n" + "═".repeat(50))
  console.log(`🏁 brand_nodes 적재 완료: ${inserted}개 성공, ${errors}건 에러`)
  console.log("═".repeat(50))

  // products 테이블의 style_node도 업데이트 (normalized name 기준)
  console.log("\n🔄 products.style_node 업데이트 중...")

  let updated = 0
  for (const bn of brandNodes) {
    // brand_name_normalized로 매칭 시도
    const {error: err1, count: c1} = await supabase
      .from("products")
      .update({style_node: bn.style_node})
      .ilike("brand", bn.brand_name_normalized)
      .is("style_node", null)

    if (!err1 && c1 && c1 > 0) { updated += c1; continue }

    // fallback: brand_name(raw)으로 매칭
    if (bn.brand_name !== bn.brand_name_normalized) {
      const {error: err2, count: c2} = await supabase
        .from("products")
        .update({style_node: bn.style_node})
        .ilike("brand", bn.brand_name)
        .is("style_node", null)

      if (!err2 && c2 && c2 > 0) updated += c2
    }
  }

  console.log(`✅ products ${updated}개 상품에 style_node 매핑 완료`)
}

main().catch(console.error)
