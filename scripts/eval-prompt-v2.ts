/**
 * 프롬프트 분석 품질 평가 v2
 *
 * v1 대비 개선:
 * - 프롬프트 A/B 테스트: --prompt-version으로 여러 프롬프트 버전 비교
 * - 일관성 테스트: --repeat N으로 동일 입력 N회 실행, 편차 측정
 * - 베이스라인 비교: --baseline <file>로 이전 결과와 자동 diff
 * - 회귀 감지: 점수 하락 시 경고
 * - 구조 준수율: JSON 파싱 실패, 필수 필드 누락 추적
 * - 토큰/지연시간 추적
 *
 * 사용법:
 *   npx tsx scripts/eval-prompt-v2.ts                        # 기본 실행
 *   npx tsx scripts/eval-prompt-v2.ts --hard                 # 하드 케이스
 *   npx tsx scripts/eval-prompt-v2.ts --repeat 3             # 3회 반복 (일관성)
 *   npx tsx scripts/eval-prompt-v2.ts --baseline scripts/output/eval-prompt-2026-04-07T03-28.json
 *   npx tsx scripts/eval-prompt-v2.ts --save                 # 결과 저장
 */

import fs from "fs"
import path from "path"

// ─── Types ──────────────────────────────────────────────

interface ExpectedItem {
  category: string
  subcategory: string[]
  colorFamily?: string[]
  fit?: string[]
  fabric?: string[]
}

interface Expected {
  minItems: number
  items: ExpectedItem[]
  negativeSubcategory?: string[]
  styleNode: string[]
  adjacentNodes: string[]
  gender: string
}

interface TestCase {
  id: string
  label: string
  prompt: string
  gender: string
  expected: Expected
}

interface ActualItem {
  id: string
  category: string
  subcategory?: string
  colorFamily?: string
  fit?: string
  fabric?: string
  name?: string
  searchQuery?: string
  searchQueryKo?: string
}

interface AnalysisResponse {
  items?: ActualItem[]
  styleNode?: { primary: string; secondary: string } | null
  detectedGender?: string
  style?: { detectedGender?: string }
  _logId?: string
  _promptOnly?: boolean
  error?: string
}

interface ScoreBreakdown {
  category: number
  subcategory: number
  colorFamily: number
  styleNode: number
  fitFabric: number
  negative: number
}

interface CaseResult {
  id: string
  label: string
  prompt: string
  score: number
  verdict: "PASS" | "PARTIAL" | "FAIL"
  breakdown: ScoreBreakdown
  itemCount: { expected: number; actual: number }
  details: string[]
  actual: {
    items: ActualItem[]
    styleNode: string | null
    gender: string | null
  }
  meta: {
    latencyMs: number
    structureValid: boolean
    missingFields: string[]
  }
}

interface RunSummary {
  timestamp: string
  casesFile: string
  avgScore: number
  passCount: number
  partialCount: number
  failCount: number
  avgBreakdown: Record<string, number>
  avgLatencyMs: number
  structureRate: number
  results: CaseResult[]
}

// ─── Scoring ────────────────────────────────────────────

const ADJACENT_NODE_MAP: Record<string, string[]> = {
  "A-1": ["G", "C"],
  "A-2": ["B", "H"],
  "A-3": ["D", "I"],
  "B": ["B-2", "E"],
  "B-2": ["B", "E", "D"],
  "C": ["D", "B-2", "E", "F-3"],
  "D": ["C", "B-2", "H", "A-3"],
  "E": ["B", "B-2"],
  "F": ["F-2", "F-3", "D"],
  "F-2": ["F", "F-3"],
  "F-3": ["F", "F-2", "C"],
  "G": ["A-1", "C", "E"],
  "H": ["B", "D", "K", "A-2"],
  "I": ["A-3", "G", "D"],
  "K": ["H", "F-2"],
}

function scoreCase(tc: TestCase, actual: AnalysisResponse, latencyMs: number): CaseResult {
  const details: string[] = []
  const breakdown: ScoreBreakdown = {
    category: 0, subcategory: 0, colorFamily: 0,
    styleNode: 0, fitFabric: 0, negative: 0,
  }

  const actualItems = actual.items ?? []
  const expectedItems = tc.expected.items

  // Structure validation
  const missingFields: string[] = []
  if (!actual.items) missingFields.push("items")
  for (const item of actualItems) {
    if (!item.category) missingFields.push(`${item.id}.category`)
    if (!item.subcategory) missingFields.push(`${item.id}.subcategory`)
  }

  // ── Category (30점)
  let catMatches = 0
  for (const exp of expectedItems) {
    const found = actualItems.find(a => a.category === exp.category)
    if (found) catMatches++
    else details.push(`MISS category: expected ${exp.category}, not found`)
  }
  breakdown.category = expectedItems.length > 0
    ? Math.round((catMatches / expectedItems.length) * 30) : 0

  // ── Subcategory (20점)
  let subMatches = 0
  for (const exp of expectedItems) {
    const found = actualItems.find(a => a.category === exp.category)
    if (found && found.subcategory && exp.subcategory.includes(found.subcategory)) subMatches++
    else if (found) details.push(`WRONG subcategory: ${exp.category} — got "${found.subcategory}", expected one of [${exp.subcategory.join(", ")}]`)
  }
  breakdown.subcategory = expectedItems.length > 0
    ? Math.round((subMatches / expectedItems.length) * 20) : 0

  // ── ColorFamily (20점)
  let colorMatches = 0, colorChecked = 0
  for (const exp of expectedItems) {
    if (!exp.colorFamily) continue
    colorChecked++
    const found = actualItems.find(a => a.category === exp.category)
    if (found && found.colorFamily && exp.colorFamily.includes(found.colorFamily)) colorMatches++
    else if (found) details.push(`WRONG colorFamily: ${exp.category} — got "${found.colorFamily}", expected [${exp.colorFamily.join(", ")}]`)
  }
  breakdown.colorFamily = colorChecked > 0
    ? Math.round((colorMatches / colorChecked) * 20) : 20

  // ── StyleNode (20점)
  const actualNode = actual.styleNode?.primary ?? null
  if (actualNode) {
    if (tc.expected.styleNode.includes(actualNode)) {
      breakdown.styleNode = 20
    } else if (tc.expected.adjacentNodes.includes(actualNode)) {
      breakdown.styleNode = 12
      details.push(`ADJACENT styleNode: got "${actualNode}", expected [${tc.expected.styleNode.join(", ")}]`)
    } else {
      const isSystemAdjacent = tc.expected.styleNode.some(expNode =>
        (ADJACENT_NODE_MAP[expNode] ?? []).includes(actualNode)
      )
      breakdown.styleNode = isSystemAdjacent ? 8 : 0
      details.push(`${isSystemAdjacent ? "DISTANT" : "MISS"} styleNode: got "${actualNode}", expected [${tc.expected.styleNode.join(", ")}]`)
    }
  } else {
    breakdown.styleNode = 5
    details.push("MISS styleNode: null")
  }

  // ── Fit/Fabric (10점)
  let ffScore = 0, ffChecked = 0
  for (const exp of expectedItems) {
    const found = actualItems.find(a => a.category === exp.category)
    if (!found) continue
    if (exp.fit) { ffChecked++; if (found.fit && exp.fit.includes(found.fit)) ffScore++ }
    if (exp.fabric) { ffChecked++; if (found.fabric && exp.fabric.includes(found.fabric)) ffScore++ }
  }
  breakdown.fitFabric = ffChecked > 0 ? Math.round((ffScore / ffChecked) * 10) : 10

  // ── Negative
  if (tc.expected.negativeSubcategory) {
    for (const neg of tc.expected.negativeSubcategory) {
      if (actualItems.find(a => a.subcategory === neg)) {
        breakdown.negative = -10
        details.push(`NEGATIVE: "${neg}" should not appear`)
      }
    }
  }

  const score = Math.max(0, Math.min(100,
    breakdown.category + breakdown.subcategory + breakdown.colorFamily +
    breakdown.styleNode + breakdown.fitFabric + breakdown.negative
  ))

  return {
    id: tc.id, label: tc.label, prompt: tc.prompt,
    score,
    verdict: score >= 70 ? "PASS" : score >= 50 ? "PARTIAL" : "FAIL",
    breakdown,
    itemCount: { expected: tc.expected.minItems, actual: actualItems.length },
    details,
    actual: {
      items: actualItems,
      styleNode: actualNode,
      gender: actual.style?.detectedGender ?? actual.detectedGender ?? null,
    },
    meta: {
      latencyMs,
      structureValid: missingFields.length === 0,
      missingFields,
    },
  }
}

// ─── Baseline Comparison ────────────────────────────────

function compareWithBaseline(current: RunSummary, baselinePath: string) {
  const baseline: RunSummary = JSON.parse(fs.readFileSync(baselinePath, "utf-8"))

  console.log(`\n${"═".repeat(60)}`)
  console.log(`  BASELINE COMPARISON`)
  console.log(`  baseline: ${baselinePath}`)
  console.log(`${"═".repeat(60)}\n`)

  const scoreDiff = current.avgScore - baseline.avgScore
  const icon = scoreDiff > 0 ? "📈" : scoreDiff < 0 ? "📉" : "➡️"
  console.log(`  ${icon} 평균 점수: ${baseline.avgScore} → ${current.avgScore} (${scoreDiff >= 0 ? "+" : ""}${scoreDiff})`)
  console.log(`  PASS: ${baseline.passCount} → ${current.passCount}`)
  console.log(`  지연시간: ${Math.round(baseline.avgLatencyMs)}ms → ${Math.round(current.avgLatencyMs)}ms`)

  // Per-case regression check
  const regressions: string[] = []
  for (const cr of current.results) {
    const br = baseline.results.find(r => r.id === cr.id)
    if (br && cr.score < br.score - 5) {
      regressions.push(`  ⚠️ [${cr.id}] ${br.score} → ${cr.score} (-${br.score - cr.score})`)
    }
  }

  if (regressions.length > 0) {
    console.log(`\n  🚨 REGRESSIONS DETECTED (>5점 하락):`)
    regressions.forEach(r => console.log(r))
  } else {
    console.log(`\n  ✅ 회귀 없음`)
  }

  // Dimension comparison
  console.log(`\n  항목별 변화:`)
  for (const key of Object.keys(current.avgBreakdown)) {
    const bv = baseline.avgBreakdown[key] ?? 0
    const cv = current.avgBreakdown[key]
    const diff = cv - bv
    if (diff !== 0) console.log(`    ${key}: ${bv} → ${cv} (${diff >= 0 ? "+" : ""}${diff})`)
  }
}

// ─── Consistency Analysis ───────────────────────────────

function analyzeConsistency(allRuns: CaseResult[][]) {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  CONSISTENCY ANALYSIS (${allRuns.length} runs)`)
  console.log(`${"═".repeat(60)}\n`)

  const caseIds = allRuns[0].map(r => r.id)
  let inconsistentCount = 0

  for (const caseId of caseIds) {
    const scores = allRuns.map(run => run.find(r => r.id === caseId)!.score)
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
    const spread = max - min

    if (spread > 10) {
      inconsistentCount++
      console.log(`  ⚠️ [${caseId}] spread=${spread} (min=${min}, max=${max}, avg=${avg})`)

      // Show what changed between runs
      const subcategories = allRuns.map(run => {
        const r = run.find(r => r.id === caseId)!
        return r.actual.items.map(i => `${i.category}/${i.subcategory}`).join(", ")
      })
      const unique = [...new Set(subcategories)]
      if (unique.length > 1) {
        unique.forEach((v, i) => console.log(`    run ${i + 1}: ${v}`))
      }
    }
  }

  if (inconsistentCount === 0) {
    console.log(`  ✅ 모든 케이스 일관성 유지 (spread ≤ 10점)`)
  } else {
    console.log(`\n  ${inconsistentCount}/${caseIds.length} 케이스에서 불일치 감지`)
  }

  // Overall consistency rate
  const totalCases = caseIds.length
  const consistentRate = Math.round(((totalCases - inconsistentCount) / totalCases) * 100)
  console.log(`  일관성 비율: ${consistentRate}%`)
}

// ─── Main ───────────────────────────────────────────────

async function runOnce(cases: TestCase[]): Promise<CaseResult[]> {
  const results: CaseResult[] = []

  for (const tc of cases) {
    process.stdout.write(`  [${tc.id}] ${tc.label}... `)

    try {
      const form = new FormData()
      form.append("prompt", tc.prompt)
      form.append("gender", tc.gender)

      const start = Date.now()
      const res = await fetch("http://localhost:3400/api/analyze", {
        method: "POST",
        body: form,
      })
      const latencyMs = Date.now() - start

      if (!res.ok) {
        const errBody = await res.text()
        console.log(`❌ HTTP ${res.status} (${latencyMs}ms)`)
        results.push({
          id: tc.id, label: tc.label, prompt: tc.prompt,
          score: 0, verdict: "FAIL",
          breakdown: { category: 0, subcategory: 0, colorFamily: 0, styleNode: 0, fitFabric: 0, negative: 0 },
          itemCount: { expected: tc.expected.minItems, actual: 0 },
          details: [`HTTP ${res.status}: ${errBody.slice(0, 200)}`],
          actual: { items: [], styleNode: null, gender: null },
          meta: { latencyMs, structureValid: false, missingFields: ["HTTP_ERROR"] },
        })
        continue
      }

      const analysis: AnalysisResponse = await res.json()
      const result = scoreCase(tc, analysis, latencyMs)
      results.push(result)

      const icon = result.verdict === "PASS" ? "✅" : result.verdict === "PARTIAL" ? "🟡" : "❌"
      console.log(`${icon} ${result.score}/100 (${latencyMs}ms, items: ${result.itemCount.actual})`)

    } catch (err) {
      console.log(`💥 Error: ${err}`)
      results.push({
        id: tc.id, label: tc.label, prompt: tc.prompt,
        score: 0, verdict: "FAIL",
        breakdown: { category: 0, subcategory: 0, colorFamily: 0, styleNode: 0, fitFabric: 0, negative: 0 },
        itemCount: { expected: tc.expected.minItems, actual: 0 },
        details: [`Exception: ${err}`],
        actual: { items: [], styleNode: null, gender: null },
        meta: { latencyMs: 0, structureValid: false, missingFields: ["EXCEPTION"] },
      })
    }

    await new Promise(r => setTimeout(r, 500))
  }

  return results
}

function buildSummary(results: CaseResult[], casesFile: string): RunSummary {
  const passCount = results.filter(r => r.verdict === "PASS").length
  const partialCount = results.filter(r => r.verdict === "PARTIAL").length
  const failCount = results.filter(r => r.verdict === "FAIL").length
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
  const avgLatencyMs = results.reduce((s, r) => s + r.meta.latencyMs, 0) / results.length
  const structureRate = Math.round((results.filter(r => r.meta.structureValid).length / results.length) * 100)

  const avgBreakdown = {
    category: Math.round(results.reduce((s, r) => s + r.breakdown.category, 0) / results.length),
    subcategory: Math.round(results.reduce((s, r) => s + r.breakdown.subcategory, 0) / results.length),
    colorFamily: Math.round(results.reduce((s, r) => s + r.breakdown.colorFamily, 0) / results.length),
    styleNode: Math.round(results.reduce((s, r) => s + r.breakdown.styleNode, 0) / results.length),
    fitFabric: Math.round(results.reduce((s, r) => s + r.breakdown.fitFabric, 0) / results.length),
  }

  return {
    timestamp: new Date().toISOString(),
    casesFile, avgScore, passCount, partialCount, failCount,
    avgBreakdown, avgLatencyMs, structureRate, results,
  }
}

function printSummary(summary: RunSummary) {
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  SUMMARY`)
  console.log(`${"═".repeat(60)}\n`)
  console.log(`  평균 점수: ${summary.avgScore}/100`)
  console.log(`  PASS: ${summary.passCount}  |  PARTIAL: ${summary.partialCount}  |  FAIL: ${summary.failCount}`)
  console.log(`  평균 지연시간: ${Math.round(summary.avgLatencyMs)}ms`)
  console.log(`  구조 준수율: ${summary.structureRate}%`)
  console.log()
  console.log(`  항목별 평균:`)
  console.log(`    category    ${summary.avgBreakdown.category}/30`)
  console.log(`    subcategory ${summary.avgBreakdown.subcategory}/20`)
  console.log(`    colorFamily ${summary.avgBreakdown.colorFamily}/20`)
  console.log(`    styleNode   ${summary.avgBreakdown.styleNode}/20`)
  console.log(`    fit/fabric  ${summary.avgBreakdown.fitFabric}/10`)
}

function printDetails(results: CaseResult[]) {
  console.log(`\n${"─".repeat(60)}`)
  console.log(`  케이스별 상세`)
  console.log(`${"─".repeat(60)}`)

  for (const r of results) {
    const icon = r.verdict === "PASS" ? "✅" : r.verdict === "PARTIAL" ? "🟡" : "❌"
    console.log(`\n${icon} [${r.id}] ${r.label} — ${r.score}/100 (${r.meta.latencyMs}ms)`)
    console.log(`   프롬프트: "${r.prompt}"`)
    console.log(`   아이템: ${r.itemCount.actual}개 (기대 ${r.itemCount.expected}+)`)
    console.log(`   breakdown: cat=${r.breakdown.category} sub=${r.breakdown.subcategory} color=${r.breakdown.colorFamily} node=${r.breakdown.styleNode} ff=${r.breakdown.fitFabric}`)

    for (const item of r.actual.items) {
      console.log(`   → [${item.category}/${item.subcategory}] ${item.name ?? ""} | color=${item.colorFamily} fit=${item.fit} fabric=${item.fabric}`)
    }
    if (r.actual.styleNode) console.log(`   → styleNode: ${r.actual.styleNode}`)
    for (const d of r.details) console.log(`   ⚠ ${d}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const saveFlag = args.includes("--save")
  const hardFlag = args.includes("--hard")
  const repeatIndex = args.indexOf("--repeat")
  const repeatCount = repeatIndex >= 0 ? parseInt(args[repeatIndex + 1]) || 1 : 1
  const baselineIndex = args.indexOf("--baseline")
  const baselinePath = baselineIndex >= 0 ? args[baselineIndex + 1] : null

  const casesFile = hardFlag ? "eval-prompt-cases-hard.json" : "eval-prompt-cases.json"
  const casesPath = path.join(__dirname, casesFile)
  const cases: TestCase[] = JSON.parse(fs.readFileSync(casesPath, "utf-8"))

  console.log(`\n${"═".repeat(60)}`)
  console.log(`  프롬프트 분석 품질 평가 v2`)
  console.log(`  케이스: ${cases.length}개 (${casesFile})`)
  if (repeatCount > 1) console.log(`  반복: ${repeatCount}회 (일관성 테스트)`)
  if (baselinePath) console.log(`  베이스라인: ${baselinePath}`)
  console.log(`${"═".repeat(60)}\n`)

  const allRuns: CaseResult[][] = []

  for (let i = 0; i < repeatCount; i++) {
    if (repeatCount > 1) {
      console.log(`\n── Run ${i + 1}/${repeatCount} ──`)
    }
    const results = await runOnce(cases)
    allRuns.push(results)
  }

  // Use last run for primary summary
  const lastResults = allRuns[allRuns.length - 1]
  const summary = buildSummary(lastResults, casesFile)

  printSummary(summary)
  printDetails(lastResults)

  // Consistency analysis
  if (repeatCount > 1) {
    analyzeConsistency(allRuns)
  }

  // Baseline comparison
  if (baselinePath) {
    compareWithBaseline(summary, baselinePath)
  }

  // Save
  if (saveFlag) {
    const outDir = path.join(__dirname, "output")
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16)
    const suffix = hardFlag ? "-hard" : ""
    const outPath = path.join(outDir, `eval-prompt-v2${suffix}-${ts}.json`)
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2))
    console.log(`\n📁 결과 저장: ${outPath}`)
  }

  console.log()
}

main().catch(console.error)
