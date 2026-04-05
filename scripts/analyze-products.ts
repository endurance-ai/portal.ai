#!/usr/bin/env npx tsx
/**
 * 상품 이미지 배치 분석 CLI
 *
 * 사용법:
 *   npx tsx scripts/analyze-products.ts --version v1
 *   npx tsx scripts/analyze-products.ts --version v1 --brand "AURALEE"
 *   npx tsx scripts/analyze-products.ts --version v1 --category "Outer"
 *   npx tsx scripts/analyze-products.ts --version v1 --limit 50
 *   npx tsx scripts/analyze-products.ts --version v1 --dry-run
 *   npx tsx scripts/analyze-products.ts --version v1 --retry-failed
 */

import {createClient} from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"
import {
  initAnalyzer, analyzeProductImage, getModelId, getPromptHash,
  type AnalysisOutput,
} from "./lib/product-analyzer"

// ─── 환경변수 ────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL
const LITELLM_API_KEY = process.env.LITELLM_API_KEY
const LITELLM_MODEL = process.env.LITELLM_MODEL || "nova-lite"

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요")
  process.exit(1)
}
if (!LITELLM_BASE_URL || !LITELLM_API_KEY) {
  console.error("❌ LITELLM_BASE_URL / LITELLM_API_KEY 필요")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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

// ─── 동시성 제한 유틸 ────────────────────────────────

async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0
  let completed = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
      completed++
      onProgress?.(completed, tasks.length)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

// ─── 재시도 래퍼 ─────────────────────────────────────

async function analyzeWithRetry(
  productId: string,
  imageUrl: string,
  maxRetries: number,
): Promise<AnalysisOutput> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await analyzeProductImage(productId, imageUrl)

    if (result.success) return result

    if (result.error === "rate_limited") {
      console.log(`   ⏳ Rate limit — 30초 대기 (attempt ${attempt}/${maxRetries})`)
      await sleep(30_000)
      continue
    }

    if (result.error?.includes("404") || result.error === "image_not_found") {
      return result
    }

    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000
      console.log(`   ⚠️ 실패 (attempt ${attempt}) — ${delay / 1000}s 후 재시도: ${result.error}`)
      await sleep(delay)
    }
  }

  return { productId, success: false, result: null, raw: null, error: "max_retries_exceeded" }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── 메인 ────────────────────────────────────────────

async function main() {
  const flags = parseArgs()

  const version = flags.version as string
  if (!version) {
    console.error("❌ --version 필수 (예: --version=v1)")
    process.exit(1)
  }

  const brand = flags.brand as string | undefined
  const category = flags.category as string | undefined
  const limit = flags.limit ? parseInt(flags.limit as string, 10) : undefined
  const dryRun = flags["dry-run"] === true
  const retryFailed = flags["retry-failed"] === true
  const concurrency = flags.concurrency ? parseInt(flags.concurrency as string, 10) : 10

  console.log(`\n🚀 상품 이미지 배치 분석`)
  console.log(`   버전: ${version} | 모델: ${LITELLM_MODEL} | 동시성: ${concurrency}`)
  if (brand) console.log(`   브랜드 필터: ${brand}`)
  if (category) console.log(`   카테고리 필터: ${category}`)
  if (limit) console.log(`   제한: ${limit}개`)
  if (dryRun) console.log(`   🔍 DRY RUN — API 호출 없음`)

  initAnalyzer({
    baseUrl: LITELLM_BASE_URL!,
    apiKey: LITELLM_API_KEY!,
    model: LITELLM_MODEL,
  })

  // ── 대상 상품 조회 ────────────────────────────────

  let query = supabase
    .from("products")
    .select("id, brand, name, category, image_url")
    .eq("in_stock", true)
    .like("image_url", "http%")
    .not("image_url", "like", "%/icon_%")
    .not("image_url", "like", "%/logo_%")
    .not("image_url", "like", "%/badge_%")

  if (brand) query = query.ilike("brand", brand)
  if (category) query = query.eq("category", category)

  // Fetch ALL existing analyses (paginated — same 1000-row limit)
  const analyzedIds = new Set<string>()
  const failedIds = new Set<string>()
  let aiOffset = 0
  let aiDone = false

  while (!aiDone) {
    const { data: batch } = await supabase
      .from("product_ai_analysis")
      .select("product_id, error")
      .eq("version", version)
      .range(aiOffset, aiOffset + 999)

    if (!batch?.length) {
      aiDone = true
    } else {
      for (const a of batch) {
        if (a.error) {
          failedIds.add(a.product_id)
        } else {
          analyzedIds.add(a.product_id)
        }
      }
      aiOffset += 1000
      if (batch.length < 1000) aiDone = true
    }
  }

  // Supabase REST API returns max 1000 rows per request — paginate to get all
  const FETCH_PAGE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allProducts: any[] = []
  let fetchOffset = 0
  let fetchDone = false

  while (!fetchDone) {
    const { data: batch, error: fetchError } = await query.range(fetchOffset, fetchOffset + FETCH_PAGE - 1)
    if (fetchError) {
      console.error("❌ 상품 조회 실패:", fetchError.message)
      process.exit(1)
    }
    if (!batch?.length) {
      fetchDone = true
    } else {
      allProducts.push(...batch)
      fetchOffset += FETCH_PAGE
      if (batch.length < FETCH_PAGE) fetchDone = true
      if (limit && allProducts.length >= limit) fetchDone = true
    }
  }

  const products = allProducts

  if (!products.length) {
    console.log("ℹ️ 대상 상품 없음")
    return
  }

  let targets = products.filter((p) => {
    if (retryFailed) return failedIds.has(p.id)
    return !analyzedIds.has(p.id) && !failedIds.has(p.id)
  })

  if (limit && targets.length > limit) targets = targets.slice(0, limit)

  console.log(`\n📦 대상: ${targets.length}개 (전체 ${products.length}개 중)`)
  console.log(`   이미 분석: ${analyzedIds.size}개 | 실패: ${failedIds.size}개`)

  if (dryRun) {
    console.log("\n🔍 DRY RUN 완료")
    const brandCounts: Record<string, number> = {}
    for (const p of targets) {
      brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1
    }
    const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)
    console.log("\n📊 브랜드별 분포 (상위 20):")
    for (const [b, c] of sorted) console.log(`   ${b}: ${c}개`)
    return
  }

  // ── 배치 분석 실행 ────────────────────────────────

  const startTime = Date.now()
  let successCount = 0
  let failCount = 0
  const failures: { productId: string; brand: string; error: string }[] = []

  const tasks = targets.map((product) => async () => {
    const output = await analyzeWithRetry(product.id, product.image_url, 3)

    if (output.success && output.result) {
      if (retryFailed) {
        await supabase
          .from("product_ai_analysis")
          .delete()
          .eq("product_id", product.id)
          .eq("version", version)
      }

      const { error: insertError } = await supabase
        .from("product_ai_analysis")
        .insert({
          product_id: product.id,
          version,
          model_id: getModelId(),
          prompt_hash: getPromptHash(),
          ...output.result,
          raw_response: output.raw,
        })

      if (insertError) {
        failCount++
        failures.push({ productId: product.id, brand: product.brand, error: `db_insert: ${insertError.message}` })
      } else {
        successCount++
      }
    } else {
      if (retryFailed) {
        await supabase
          .from("product_ai_analysis")
          .delete()
          .eq("product_id", product.id)
          .eq("version", version)
      }

      const { error: insertError } = await supabase
        .from("product_ai_analysis")
        .insert({
          product_id: product.id,
          version,
          model_id: getModelId(),
          prompt_hash: getPromptHash(),
          category: "Accessories",
          error: output.error,
          raw_response: output.raw,
        })

      if (insertError) {
        console.error(`   ❌ DB 에러 기록 실패: ${insertError.message}`)
      }

      failCount++
      failures.push({ productId: product.id, brand: product.brand, error: output.error || "unknown" })
    }

    return output
  })

  let lastLog = 0
  await pLimit(tasks, concurrency, (completed, total) => {
    if (completed - lastLog >= 100 || completed === total) {
      const pct = ((completed / total) * 100).toFixed(1)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      console.log(
        `   [${completed}/${total}] ${pct}% — 성공 ${successCount} / 실패 ${failCount} — ${elapsed}s`
      )
      lastLog = completed
    }
  })

  // ── 결과 요약 ─────────────────────────────────────

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n🏁 완료 — ${totalDuration}s`)
  console.log(`   ✅ 성공: ${successCount}개`)
  console.log(`   ❌ 실패: ${failCount}개`)

  if (failures.length > 0) {
    const outputDir = path.join(__dirname, "output")
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    const filename = `failed-${version}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    const outputPath = path.join(outputDir, filename)
    fs.writeFileSync(outputPath, JSON.stringify(failures, null, 2))
    console.log(`   📄 실패 목록: ${outputPath}`)
  }
}

main().catch((err) => {
  console.error("💥 예외:", err)
  process.exit(1)
})
