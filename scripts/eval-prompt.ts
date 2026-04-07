/**
 * 프롬프트 분석 품질 자동 평가 스크립트
 *
 * 사용법:
 *   npx tsx scripts/eval-prompt.ts
 *   npx tsx scripts/eval-prompt.ts --save   # 결과 JSON 저장
 *
 * dev 서버(localhost:3400)가 떠있어야 함.
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

function scoreCase(tc: TestCase, actual: AnalysisResponse): CaseResult {
  const details: string[] = []
  const breakdown: ScoreBreakdown = {
    category: 0,
    subcategory: 0,
    colorFamily: 0,
    styleNode: 0,
    fitFabric: 0,
    negative: 0,
  }

  const actualItems = actual.items ?? []
  const expectedItems = tc.expected.items

  // ── Category (30점) ──
  // 기대 카테고리가 실제에 존재하는지
  let catMatches = 0
  for (const exp of expectedItems) {
    const found = actualItems.find(a => a.category === exp.category)
    if (found) {
      catMatches++
    } else {
      details.push(`MISS category: expected ${exp.category}, not found`)
    }
  }
  breakdown.category = expectedItems.length > 0
    ? Math.round((catMatches / expectedItems.length) * 30)
    : 0

  // ── Subcategory (20점) ──
  let subMatches = 0
  for (const exp of expectedItems) {
    const found = actualItems.find(a => a.category === exp.category)
    if (found && found.subcategory && exp.subcategory.includes(found.subcategory)) {
      subMatches++
    } else if (found) {
      details.push(`WRONG subcategory: ${exp.category} — got "${found.subcategory}", expected one of [${exp.subcategory.join(", ")}]`)
    }
  }
  breakdown.subcategory = expectedItems.length > 0
    ? Math.round((subMatches / expectedItems.length) * 20)
    : 0

  // ── ColorFamily (20점) ──
  let colorMatches = 0
  let colorChecked = 0
  for (const exp of expectedItems) {
    if (!exp.colorFamily) continue
    colorChecked++
    const found = actualItems.find(a => a.category === exp.category)
    if (found && found.colorFamily && exp.colorFamily.includes(found.colorFamily)) {
      colorMatches++
    } else if (found) {
      details.push(`WRONG colorFamily: ${exp.category} — got "${found.colorFamily}", expected one of [${exp.colorFamily.join(", ")}]`)
    }
  }
  breakdown.colorFamily = colorChecked > 0
    ? Math.round((colorMatches / colorChecked) * 20)
    : 20 // 컬러 체크 없으면 만점

  // ── StyleNode (20점) ──
  const actualNode = actual.styleNode?.primary ?? null
  if (actualNode) {
    if (tc.expected.styleNode.includes(actualNode)) {
      breakdown.styleNode = 20
    } else if (tc.expected.adjacentNodes.includes(actualNode)) {
      breakdown.styleNode = 12
      details.push(`ADJACENT styleNode: got "${actualNode}", expected [${tc.expected.styleNode.join(", ")}] (adjacent OK)`)
    } else {
      // 시스템 인접 노드로도 체크
      const isSystemAdjacent = tc.expected.styleNode.some(expNode => {
        const adj = ADJACENT_NODE_MAP[expNode] ?? []
        return adj.includes(actualNode)
      })
      if (isSystemAdjacent) {
        breakdown.styleNode = 8
        details.push(`DISTANT styleNode: got "${actualNode}", expected [${tc.expected.styleNode.join(", ")}] (system-adjacent)`)
      } else {
        breakdown.styleNode = 0
        details.push(`MISS styleNode: got "${actualNode}", expected [${tc.expected.styleNode.join(", ")}]`)
      }
    }
  } else {
    details.push("MISS styleNode: null (prompt-only mode, expected)")
    // 프롬프트 전용은 styleNode가 null일 수 있음 — 감점하되 0은 아님
    breakdown.styleNode = 5
  }

  // ── Fit/Fabric (10점) ──
  let ffScore = 0
  let ffChecked = 0
  for (const exp of expectedItems) {
    const found = actualItems.find(a => a.category === exp.category)
    if (!found) continue

    if (exp.fit) {
      ffChecked++
      if (found.fit && exp.fit.includes(found.fit)) ffScore++
      else details.push(`WRONG fit: ${exp.category} — got "${found.fit}", expected [${exp.fit.join(", ")}]`)
    }
    if (exp.fabric) {
      ffChecked++
      if (found.fabric && exp.fabric.includes(found.fabric)) ffScore++
      else details.push(`WRONG fabric: ${exp.category} — got "${found.fabric}", expected [${exp.fabric.join(", ")}]`)
    }
  }
  breakdown.fitFabric = ffChecked > 0
    ? Math.round((ffScore / ffChecked) * 10)
    : 10 // fit/fabric 체크 없으면 만점

  // ── Negative check (감점) ──
  if (tc.expected.negativeSubcategory) {
    for (const neg of tc.expected.negativeSubcategory) {
      const found = actualItems.find(a => a.subcategory === neg)
      if (found) {
        breakdown.negative -= 10
        details.push(`NEGATIVE: "${neg}" should not appear but found in ${found.category}`)
      }
    }
  }

  const score = Math.max(0, Math.min(100,
    breakdown.category + breakdown.subcategory + breakdown.colorFamily +
    breakdown.styleNode + breakdown.fitFabric + breakdown.negative
  ))

  const verdict: "PASS" | "PARTIAL" | "FAIL" =
    score >= 70 ? "PASS" : score >= 50 ? "PARTIAL" : "FAIL"

  return {
    id: tc.id,
    label: tc.label,
    prompt: tc.prompt,
    score,
    verdict,
    breakdown,
    itemCount: {
      expected: tc.expected.minItems,
      actual: actualItems.length,
    },
    details,
    actual: {
      items: actualItems,
      styleNode: actualNode,
      gender: actual.style?.detectedGender ?? actual.detectedGender ?? null,
    },
  }
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const saveFlag = process.argv.includes("--save")
  const hardFlag = process.argv.includes("--hard")

  // Load cases
  const casesFile = hardFlag ? "eval-prompt-cases-hard.json" : "eval-prompt-cases.json"
  const casesPath = path.join(__dirname, casesFile)
  const cases: TestCase[] = JSON.parse(fs.readFileSync(casesPath, "utf-8"))

  console.log(`\n${"═".repeat(60)}`)
  console.log(`  프롬프트 분석 품질 평가 — ${cases.length}개 케이스`)
  console.log(`${"═".repeat(60)}\n`)

  const results: CaseResult[] = []

  for (const tc of cases) {
    process.stdout.write(`[${tc.id}] ${tc.label}... `)

    try {
      const form = new FormData()
      form.append("prompt", tc.prompt)
      form.append("gender", tc.gender)

      const res = await fetch("http://localhost:3400/api/analyze", {
        method: "POST",
        body: form,
      })

      if (!res.ok) {
        const errBody = await res.text()
        console.log(`❌ HTTP ${res.status}`)
        results.push({
          id: tc.id,
          label: tc.label,
          prompt: tc.prompt,
          score: 0,
          verdict: "FAIL",
          breakdown: { category: 0, subcategory: 0, colorFamily: 0, styleNode: 0, fitFabric: 0, negative: 0 },
          itemCount: { expected: tc.expected.minItems, actual: 0 },
          details: [`HTTP ${res.status}: ${errBody.slice(0, 200)}`],
          actual: { items: [], styleNode: null, gender: null },
        })
        continue
      }

      const analysis: AnalysisResponse = await res.json()
      const result = scoreCase(tc, analysis)
      results.push(result)

      const icon = result.verdict === "PASS" ? "✅" : result.verdict === "PARTIAL" ? "🟡" : "❌"
      console.log(`${icon} ${result.score}/100 (items: ${result.itemCount.actual})`)

    } catch (err) {
      console.log(`💥 Error: ${err}`)
      results.push({
        id: tc.id,
        label: tc.label,
        prompt: tc.prompt,
        score: 0,
        verdict: "FAIL",
        breakdown: { category: 0, subcategory: 0, colorFamily: 0, styleNode: 0, fitFabric: 0, negative: 0 },
        itemCount: { expected: tc.expected.minItems, actual: 0 },
        details: [`Exception: ${err}`],
        actual: { items: [], styleNode: null, gender: null },
      })
    }

    // Rate limit — 0.5초 간격
    await new Promise(r => setTimeout(r, 500))
  }

  // ── Summary ──────────────────────────────────────────

  console.log(`\n${"═".repeat(60)}`)
  console.log(`  SUMMARY`)
  console.log(`${"═".repeat(60)}\n`)

  const passCount = results.filter(r => r.verdict === "PASS").length
  const partialCount = results.filter(r => r.verdict === "PARTIAL").length
  const failCount = results.filter(r => r.verdict === "FAIL").length
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)

  console.log(`  평균 점수: ${avgScore}/100`)
  console.log(`  PASS: ${passCount}  |  PARTIAL: ${partialCount}  |  FAIL: ${failCount}`)
  console.log()

  // Breakdown averages
  const avgBreakdown = {
    category: Math.round(results.reduce((s, r) => s + r.breakdown.category, 0) / results.length),
    subcategory: Math.round(results.reduce((s, r) => s + r.breakdown.subcategory, 0) / results.length),
    colorFamily: Math.round(results.reduce((s, r) => s + r.breakdown.colorFamily, 0) / results.length),
    styleNode: Math.round(results.reduce((s, r) => s + r.breakdown.styleNode, 0) / results.length),
    fitFabric: Math.round(results.reduce((s, r) => s + r.breakdown.fitFabric, 0) / results.length),
  }

  console.log(`  항목별 평균:`)
  console.log(`    category    ${avgBreakdown.category}/30`)
  console.log(`    subcategory ${avgBreakdown.subcategory}/20`)
  console.log(`    colorFamily ${avgBreakdown.colorFamily}/20`)
  console.log(`    styleNode   ${avgBreakdown.styleNode}/20`)
  console.log(`    fit/fabric  ${avgBreakdown.fitFabric}/10`)
  console.log()

  // Per-case detail
  console.log(`${"─".repeat(60)}`)
  console.log(`  케이스별 상세`)
  console.log(`${"─".repeat(60)}`)

  for (const r of results) {
    const icon = r.verdict === "PASS" ? "✅" : r.verdict === "PARTIAL" ? "🟡" : "❌"
    console.log(`\n${icon} [${r.id}] ${r.label} — ${r.score}/100`)
    console.log(`   프롬프트: "${r.prompt}"`)
    console.log(`   아이템: ${r.itemCount.actual}개 추출 (기대 ${r.itemCount.expected}+)`)
    console.log(`   breakdown: cat=${r.breakdown.category} sub=${r.breakdown.subcategory} color=${r.breakdown.colorFamily} node=${r.breakdown.styleNode} ff=${r.breakdown.fitFabric}`)

    if (r.actual.items.length > 0) {
      for (const item of r.actual.items) {
        console.log(`   → [${item.category}/${item.subcategory}] ${item.name ?? ""} | color=${item.colorFamily} fit=${item.fit} fabric=${item.fabric}`)
        if (item.searchQuery) console.log(`     query: "${item.searchQuery}"`)
      }
    }
    if (r.actual.styleNode) {
      console.log(`   → styleNode: ${r.actual.styleNode}`)
    }

    if (r.details.length > 0) {
      for (const d of r.details) {
        console.log(`   ⚠ ${d}`)
      }
    }
  }

  // ── Save ──────────────────────────────────────────────

  if (saveFlag) {
    const outDir = path.join(__dirname, "output")
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16)
    const outPath = path.join(outDir, `eval-prompt-${ts}.json`)
    fs.writeFileSync(outPath, JSON.stringify({ summary: { avgScore, passCount, partialCount, failCount, avgBreakdown }, results }, null, 2))
    console.log(`\n📁 결과 저장: ${outPath}`)
  }

  console.log()
}

main().catch(console.error)
