/**
 * products.brand DISTINCT 중 brand_nodes 에 매칭되지 않는 표기를
 * brand_nodes 에 자동 등록 (메타는 비어있는 채). 자율 루프가 후속 채움.
 *
 * Idempotent: brand_name_normalized 가 이미 존재하면 skip.
 *
 * 사용:
 *   npx dotenv -e .env.local -- npx tsx scripts/register_unmatched_brands.ts --dry-run
 *   npx dotenv -e .env.local -- npx tsx scripts/register_unmatched_brands.ts
 */

import {createClient} from "@supabase/supabase-js"
import {normalizeBrand} from "../src/lib/brand-normalize"

const url = process.env.DB_URL!
const key = process.env.DB_TOKEN!
const sb = createClient(url, key)

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")

interface BrandRow {
  raw: string
  norm: string
  productCount: number
  topPlatform?: string
}

async function loadProductBrands(): Promise<Map<string, BrandRow>> {
  const out = new Map<string, BrandRow>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const {data, error} = await sb
      .from("products")
      .select("brand, platform")
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`products load: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) {
      const raw = (row.brand as string | null)?.trim()
      if (!raw) continue
      const existing = out.get(raw)
      if (existing) {
        existing.productCount++
      } else {
        out.set(raw, {
          raw,
          norm: normalizeBrand(raw),
          productCount: 1,
          topPlatform: (row.platform as string | undefined) || undefined,
        })
      }
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

async function loadExistingNorms(): Promise<Set<string>> {
  const norms = new Set<string>()
  const {data, error} = await sb
    .from("brand_nodes")
    .select("brand_name, brand_name_normalized, aliases")
  if (error) throw new Error(`brand_nodes load: ${error.message}`)
  for (const r of data ?? []) {
    const n = (r.brand_name_normalized as string | null) ?? r.brand_name
    norms.add(normalizeBrand(n))
    for (const a of (r.aliases as string[] | null) ?? []) {
      norms.add(normalizeBrand(a))
    }
  }
  return norms
}

async function main() {
  console.log("[1/3] products.brand 로드...")
  const productBrands = await loadProductBrands()
  console.log(`     unique raw: ${productBrands.size}`)

  console.log("[2/3] brand_nodes 기존 정규화 키 로드...")
  const existing = await loadExistingNorms()
  console.log(`     기존 정규화 키 (alias 포함): ${existing.size}`)

  // products 에서 normalized 가 unique 한 것만 (PRADA/Prada 같은 중복 제거 후 첫 등장 raw 사용)
  const candidates = new Map<string, BrandRow>() // norm → row
  for (const row of productBrands.values()) {
    if (!row.norm) continue
    if (existing.has(row.norm)) continue
    const cur = candidates.get(row.norm)
    if (!cur || row.productCount > cur.productCount) {
      candidates.set(row.norm, row)
    } else {
      cur.productCount += row.productCount
    }
  }

  const toRegister = Array.from(candidates.values()).sort(
    (a, b) => b.productCount - a.productCount
  )
  console.log(`[3/3] 신규 등록 후보: ${toRegister.length}`)
  console.log()
  console.log("=== 상위 30개 미리보기 ===")
  for (const c of toRegister.slice(0, 30)) {
    console.log(
      `  ${c.productCount.toString().padStart(5)} × "${c.raw}"  (norm: ${c.norm}, platform: ${c.topPlatform ?? "?"})`
    )
  }

  if (DRY_RUN) {
    console.log()
    console.log("DRY RUN — DB 변경 없음. 실 실행은 --dry-run 빼고 재실행.")
    return
  }

  // 실 INSERT — chunked
  console.log()
  console.log("INSERT 시작...")
  const CHUNK = 100
  let inserted = 0
  let failed = 0
  for (let i = 0; i < toRegister.length; i += CHUNK) {
    const chunk = toRegister.slice(i, i + CHUNK)
    const rows = chunk.map((c) => ({
      brand_name: c.raw,
      brand_name_normalized: c.norm,
      platform: c.topPlatform ?? null,
      source_platforms: c.topPlatform ? [c.topPlatform] : [],
      category_type: null, // 자율 루프가 후속 채움
      // style_node, sensitivity_tags, brand_keywords, attributes 모두 default
    }))
    const {data, error} = await sb
      .from("brand_nodes")
      .upsert(rows, {
        onConflict: "brand_name_normalized",
        ignoreDuplicates: true,
      })
      .select("id")
    if (error) {
      failed += rows.length
      console.error(`  ✗ chunk ${i / CHUNK}: ${error.message}`)
    } else {
      const n = data?.length ?? 0
      inserted += n
      const skipped = rows.length - n
      if (skipped > 0) {
        console.log(`  · chunk ${i / CHUNK}: ${n} inserted, ${skipped} dupe-skipped`)
      }
    }
    if ((i / CHUNK) % 5 === 0) {
      console.log(`  ... ${i + chunk.length}/${toRegister.length} (insert=${inserted} fail=${failed})`)
    }
  }
  console.log()
  console.log(`완료: 등록 ${inserted} / 실패 ${failed}`)
  console.log()

  // 검증 — 매칭률 재측정
  console.log("=== 매칭률 재측정 ===")
  const newExisting = await loadExistingNorms()
  let matched = 0
  for (const row of productBrands.values()) {
    if (newExisting.has(row.norm)) matched++
  }
  console.log(
    `  products → brand_nodes 매칭: ${matched}/${productBrands.size} (${((matched / productBrands.size) * 100).toFixed(1)}%)`
  )
  console.log(`  (등록 전 31.4% → 등록 후)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
