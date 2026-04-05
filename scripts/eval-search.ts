/**
 * 검색 평가 스크립트 — 골든셋 기반 자동 eval
 *
 * 사용법:
 *   npx dotenv -e .env.local -- npx tsx scripts/eval-search.ts --version=v1
 */

import {createClient} from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요")
  console.error("   실행: npx dotenv -e .env.local -- npx tsx scripts/eval-search.ts --version=v1")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:3400"

// ─── CLI args ─────────────────────────────────────────────

const args = process.argv.slice(2)
const versionFlag = args.find((a) => a.startsWith("--version="))
const version = versionFlag?.split("=")[1] || "v1"

// ─── 타입 ─────────────────────────────────────────────────

type GoldenSetRow = {
  id: string
  image_url: string
  expected_node_primary: string | null
  expected_node_secondary: string | null
  expected_items: {
    id: string
    category: string
    subcategory?: string
    searchQuery: string
    searchQueryKo?: string
    fit?: string
    fabric?: string
    colorFamily?: string
  }[] | null
  expected_products: {brand: string; category: string; subcategory?: string}[] | null
  expected_color_family: string | null
  expected_fit: string | null
  expected_fabric: string | null
  test_type: string
  notes: string | null
}

type EvalResult = {
  goldenId: string
  testType: string
  hitRate: number       // -1 if no expected_products
  categoryAccuracy: number
  emptyCount: number
  totalItems: number
  details: string[]
}

type SearchResultItem = {
  id: string
  products: {brand: string; title: string; price: string; platform: string; imageUrl: string; link: string}[]
}

// ─── 검색 API 호출 ────────────────────────────────────────

async function callSearchApi(gs: GoldenSetRow): Promise<SearchResultItem[]> {
  const searchBody = {
    queries: gs.expected_items!.map((item) => ({
      id: item.id,
      category: item.category,
      subcategory: item.subcategory,
      fit: item.fit || gs.expected_fit,
      fabric: item.fabric || gs.expected_fabric,
      colorFamily: item.colorFamily || gs.expected_color_family,
      searchQuery: item.searchQuery,
      searchQueryKo: item.searchQueryKo,
    })),
    gender: "male",
    styleNode: gs.expected_node_primary
      ? {
          primary: gs.expected_node_primary,
          secondary: gs.expected_node_secondary || undefined,
        }
      : undefined,
    moodTags: [],
  }

  const res = await fetch(`${BASE_URL}/api/search-products`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(searchBody),
  })

  if (!res.ok) {
    throw new Error(`API 호출 실패: ${res.status} ${res.statusText}`)
  }

  const json = (await res.json()) as {results: SearchResultItem[]}
  return json.results ?? []
}

// ─── 단일 골든셋 평가 ─────────────────────────────────────

async function evalGoldenSet(gs: GoldenSetRow): Promise<EvalResult> {
  const details: string[] = []

  const idShort = gs.id.slice(0, 8)
  details.push(`── [${idShort}] ${gs.image_url.split("/").pop() ?? gs.image_url} ──`)

  if (!gs.expected_items || gs.expected_items.length === 0) {
    details.push("  ⚠️  expected_items 없음 — 스킵")
    return {
      goldenId: gs.id,
      testType: gs.test_type,
      hitRate: -1,
      categoryAccuracy: 0,
      emptyCount: 0,
      totalItems: 0,
      details,
    }
  }

  let results: SearchResultItem[] = []
  try {
    results = await callSearchApi(gs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    details.push(`  ❌ API 오류: ${msg}`)
    return {
      goldenId: gs.id,
      testType: gs.test_type,
      hitRate: -1,
      categoryAccuracy: 0,
      emptyCount: gs.expected_items.length,
      totalItems: gs.expected_items.length,
      details,
    }
  }

  const totalItems = gs.expected_items.length
  let itemsWithProducts = 0
  let emptyCount = 0

  // 기대 브랜드 목록 (hit rate 계산용)
  const expectedBrands = (gs.expected_products ?? []).map((p) => p.brand.toLowerCase())
  const hitBrands = new Set<string>()

  for (const item of gs.expected_items) {
    const resultItem = results.find((r) => r.id === item.id)
    const products = resultItem?.products ?? []

    if (products.length > 0) {
      itemsWithProducts++
      details.push(`  ✅ [${item.category}] ${products.length}개 반환`)
      for (const p of products.slice(0, 3)) {
        const titleShort = p.title.length > 45 ? p.title.slice(0, 45) + "..." : p.title
        details.push(`     • ${p.brand} — ${titleShort}`)

        // hit rate 확인
        if (expectedBrands.includes(p.brand.toLowerCase())) {
          hitBrands.add(p.brand.toLowerCase())
        }
      }
    } else {
      emptyCount++
      details.push(`  ❌ [${item.category}] 결과 0개`)
    }
  }

  const categoryAccuracy = totalItems > 0 ? (itemsWithProducts / totalItems) * 100 : 0

  // hit rate: 기대 브랜드 중 실제 등장한 비율
  const hitRate =
    expectedBrands.length > 0
      ? (hitBrands.size / expectedBrands.length) * 100
      : -1

  const hitRateStr = hitRate >= 0 ? `${hitRate.toFixed(0)}%` : "N/A"
  details.push(
    `   📊 Category: ${categoryAccuracy.toFixed(0)}% | Empty: ${emptyCount}/${totalItems} | Hit: ${hitRateStr}`
  )

  return {
    goldenId: gs.id,
    testType: gs.test_type,
    hitRate,
    categoryAccuracy,
    emptyCount,
    totalItems,
    details,
  }
}

// ─── 메인 ─────────────────────────────────────────────────

async function main() {
  console.log(`검색 평가 시작 — version: ${version}`)
  console.log(`BASE_URL: ${BASE_URL}`)
  console.log()

  // 골든셋 로드
  const {data: goldenSet, error} = await supabase
    .from("eval_golden_set")
    .select("*")
    .order("created_at", {ascending: true})

  if (error) {
    console.error("❌ 골든셋 로드 실패:", error.message)
    process.exit(1)
  }

  if (!goldenSet || goldenSet.length === 0) {
    console.error("❌ 골든셋이 비어 있음")
    process.exit(1)
  }

  console.log(`📋 골든셋 ${goldenSet.length}개 로드 완료`)
  console.log()

  const evalResults: EvalResult[] = []

  for (const gs of goldenSet as GoldenSetRow[]) {
    // expected_items 없으면 스킵
    if (!gs.expected_items || gs.expected_items.length === 0) {
      console.log(`⚠️  [${gs.id.slice(0, 8)}] expected_items 없음 — 스킵`)
      continue
    }

    const result = await evalGoldenSet(gs)
    evalResults.push(result)

    // 결과 출력
    for (const line of result.details) {
      console.log(line)
    }
    console.log()
  }

  if (evalResults.length === 0) {
    console.log("⚠️  평가 가능한 항목 없음")
    return
  }

  // ─── 요약 ────────────────────────────────────────────────

  const totalEntries = evalResults.length
  const avgCategoryAccuracy =
    evalResults.reduce((sum, r) => sum + r.categoryAccuracy, 0) / totalEntries

  const totalItems = evalResults.reduce((sum, r) => sum + r.totalItems, 0)
  const totalEmpty = evalResults.reduce((sum, r) => sum + r.emptyCount, 0)
  const emptyRate = totalItems > 0 ? (totalEmpty / totalItems) * 100 : 0

  // Hit rate: expected_products 있는 항목만
  const hitRateEntries = evalResults.filter((r) => r.hitRate >= 0)
  const avgHitRate =
    hitRateEntries.length > 0
      ? hitRateEntries.reduce((sum, r) => sum + r.hitRate, 0) / hitRateEntries.length
      : null

  console.log("════════════════════════════════════════════════════════════")
  console.log("📊 평가 요약")
  console.log()
  console.log(`  골든셋: ${totalEntries}개`)
  console.log(`  Category Accuracy: ${avgCategoryAccuracy.toFixed(1)}%`)
  console.log(`  Empty Rate: ${emptyRate.toFixed(1)}%`)
  console.log(`  Hit Rate: ${avgHitRate !== null ? avgHitRate.toFixed(1) + "%" : "N/A (expected_products 없음)"}`)
  console.log()
  console.log("════════════════════════════════════════════════════════════")
}

main().catch((err) => {
  console.error("💥 예외 발생:", err)
  process.exit(1)
})
