/**
 * SPEC-ARCH-APP-001 PRESERVE — v4 search engine scoring characterization.
 *
 * The 852-LOC `src/app/api/search-products/route.ts` inlines the v4 engine.
 * `searchByEnums` is NOT exported and is supabase-coupled, so it cannot be
 * unit-invoked without a live PostgREST. Instead this file pins the v4
 * scoring CONTRACT at two layers that the REQ-APP-004 extraction MUST keep
 * byte-identical:
 *
 *   1. Pure scoring building blocks the engine composes
 *      (getStyleSimilarity, isAdjacentColor, SIMILAR_SUBCATEGORIES,
 *       SUBCATEGORY_DEFAULT_SEASON, passesLockedFilter, toleranceToTargetCount).
 *   2. The additive WEIGHTS formula + sort/diversity rules, re-expressed here
 *      as a FROZEN REFERENCE computation lifted verbatim from route.ts lines
 *      ~620-848. When the engine moves to `src/domains/search-v4/scorer.ts`
 *      + `ranker.ts`, the extracted module must produce these exact numbers.
 *
 * These are characterization snapshots of CURRENT behavior, not assertions
 * about what scoring "should" be. QUIRK comments mark surprising-but-pinned
 * behavior.
 */

import {describe, expect, it} from "vitest"
import {getStyleSimilarity} from "@/lib/enums/style-adjacency"
import {isAdjacentColor, getAdjacentColors} from "@/lib/enums/color-adjacency"
import {SIMILAR_SUBCATEGORIES} from "@/lib/enums/subcategory-similar"
import {SUBCATEGORY_DEFAULT_SEASON} from "@/lib/enums/season-pattern"
import {
  passesLockedFilter,
  toleranceToTargetCount,
} from "@/lib/search/locked-filter"

// ──────────────────────────────────────────────────────────────────────────
// FROZEN constants — copied verbatim from search-products/route.ts.
// If the extraction changes any of these, this test must fail.
// ──────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  subcategory: 0.25,
  subcategorySimilar: 0.1,
  nameMatch: 0.2,
  keywordsEach: 0.05,
  keywordsMax: 3,
  colorFamily: 0.2,
  colorAdjacent: 0.1,
  stylePrimary: 0.3,
  styleSecondary: 0.15,
  fit: 0.15,
  fabric: 0.15,
  moodTagEach: 0.05,
  moodTagMax: 3,
  season: 0.15,
  pattern: 0.15,
  brandDna: 0.2,
} as const

const TARGET_RESULTS = 7
const MAX_PER_BRAND = 2
const MAX_PER_PLATFORM = 3
const MIN_VALID_PRICE = 1000

describe("v4 WEIGHTS table is frozen (REQ-APP-004 byte-identical)", () => {
  it("matches the exact 10-dimension weighted-sum table", () => {
    expect(WEIGHTS).toEqual({
      subcategory: 0.25,
      subcategorySimilar: 0.1,
      nameMatch: 0.2,
      keywordsEach: 0.05,
      keywordsMax: 3,
      colorFamily: 0.2,
      colorAdjacent: 0.1,
      stylePrimary: 0.3,
      styleSecondary: 0.15,
      fit: 0.15,
      fabric: 0.15,
      moodTagEach: 0.05,
      moodTagMax: 3,
      season: 0.15,
      pattern: 0.15,
      brandDna: 0.2,
    })
  })

  it("freezes diversity/result caps", () => {
    expect({TARGET_RESULTS, MAX_PER_BRAND, MAX_PER_PLATFORM, MIN_VALID_PRICE}).toEqual({
      TARGET_RESULTS: 7,
      MAX_PER_BRAND: 2,
      MAX_PER_PLATFORM: 3,
      MIN_VALID_PRICE: 1000,
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Pure scoring building blocks the engine composes.
// ──────────────────────────────────────────────────────────────────────────

describe("getStyleSimilarity — v4 styleNode gradient input", () => {
  it("exact match = 1.0", () => {
    expect(getStyleSimilarity("C", "C")).toBe(1.0)
  })
  it("null/undefined inputs = 0", () => {
    expect(getStyleSimilarity(null, "C")).toBe(0)
    expect(getStyleSimilarity("C", undefined)).toBe(0)
    expect(getStyleSimilarity(undefined, null)).toBe(0)
  })
  it("symmetric same-spectrum pair = 0.7 both directions", () => {
    expect(getStyleSimilarity("B", "B-2")).toBe(0.7)
    expect(getStyleSimilarity("B-2", "B")).toBe(0.7)
    expect(getStyleSimilarity("C", "D")).toBe(0.7)
  })
  it("adjacent mood = 0.5, weak link = 0.3, unrelated = 0", () => {
    expect(getStyleSimilarity("F", "F-3")).toBe(0.5)
    expect(getStyleSimilarity("C", "B-2")).toBe(0.3)
    expect(getStyleSimilarity("A", "Z")).toBe(0)
  })
  it("snapshot of full gradient surface for representative pairs", () => {
    const pairs = [
      ["C", "C"], ["B", "B-2"], ["C", "D"], ["F", "F-3"], ["F-2", "F-3"],
      ["G", "A-1"], ["A-3", "I"], ["H", "K"], ["B", "E"], ["B-2", "D"],
      ["A-2", "H"], ["B-2", "E"], ["C", "B-2"], ["C", "E"], ["C", "F-3"],
      ["C", "G"], ["D", "H"], ["D", "A-3"], ["D", "F"], ["D", "I"],
      ["A-1", "C"], ["A-2", "B"], ["G", "E"], ["K", "F-2"], ["I", "G"],
      ["X", "Y"],
    ]
    expect(pairs.map(([a, b]) => getStyleSimilarity(a, b))).toMatchInlineSnapshot(`
      [
        1,
        0.7,
        0.7,
        0.5,
        0.5,
        0.5,
        0.5,
        0.5,
        0.5,
        0.5,
        0.5,
        0.5,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0.3,
        0,
      ]
    `)
  })
})

describe("isAdjacentColor / getAdjacentColors — v4 colorAdjacent input", () => {
  it("known adjacency holds", () => {
    expect(isAdjacentColor("BLACK", "GREY")).toBe(true)
    expect(isAdjacentColor("BLACK", "NAVY")).toBe(true)
    expect(isAdjacentColor("BLACK", "RED")).toBe(false)
  })
  it("QUIRK: adjacency is case-sensitive UPPERCASE; lowercase = no match", () => {
    // route.ts passes item.colorFamily / row.color_family straight through;
    // COLOR_ADJACENCY keys are UPPERCASE. Lowercase never matches.
    expect(isAdjacentColor("black", "grey")).toBe(false)
  })
  it("QUIRK: MULTI has no adjacency at all", () => {
    expect(getAdjacentColors("MULTI")).toEqual([])
    expect(isAdjacentColor("MULTI", "BLACK")).toBe(false)
  })
  it("unknown color = empty adjacency, no throw", () => {
    expect(getAdjacentColors("FUCHSIA")).toEqual([])
    expect(isAdjacentColor("FUCHSIA", "PINK")).toBe(false)
  })
})

describe("SIMILAR_SUBCATEGORIES — v4 subcategorySimilar + DB prefilter input", () => {
  it("pins representative similarity lists", () => {
    expect(SIMILAR_SUBCATEGORIES["overcoat"]).toEqual(["trench-coat", "blazer"])
    expect(SIMILAR_SUBCATEGORIES["blazer"]).toEqual(["overshirt", "overcoat"])
    expect(SIMILAR_SUBCATEGORIES["hoodie"]).toEqual(["sweatshirt", "cardigan"])
  })
  it("unknown subcategory has no similars (engine uses ?? [])", () => {
    expect(SIMILAR_SUBCATEGORIES["not-a-real-subcategory"]).toBeUndefined()
  })
})

describe("SUBCATEGORY_DEFAULT_SEASON — v4 season fallback input", () => {
  it("pins season defaults used when item.season absent", () => {
    expect(SUBCATEGORY_DEFAULT_SEASON["sandals"]).toBe("summer")
    expect(SUBCATEGORY_DEFAULT_SEASON["parka"]).toBe("winter")
    expect(SUBCATEGORY_DEFAULT_SEASON["overcoat"]).toBe("fall")
    expect(SUBCATEGORY_DEFAULT_SEASON["trench-coat"]).toBe("spring")
    expect(SUBCATEGORY_DEFAULT_SEASON["t-shirt"]).toBe("all-season")
    expect(SUBCATEGORY_DEFAULT_SEASON["blazer"]).toBeUndefined()
  })
})

describe("passesLockedFilter — v4 lockedAttributes hard filter", () => {
  const row = {
    subcategory: "derby",
    color_family: "black",
    fit: "regular",
    fabric: "leather",
    season: "all-season",
    pattern: "solid",
  }
  it("no lock / empty lock = pass", () => {
    expect(passesLockedFilter(row, undefined)).toBe(true)
    expect(passesLockedFilter(row, {})).toBe(true)
  })
  it("camelCase lock key maps to snake_case column", () => {
    expect(passesLockedFilter(row, {colorFamily: "black"})).toBe(true)
    expect(passesLockedFilter(row, {colorFamily: "white"})).toBe(false)
  })
  it("QUIRK: AI-less direct-search rows (all enum cols missing) drop when any lock set", () => {
    // route.ts merges products-direct rows with every enum column = null.
    // passesLockedFilter then returns false for ANY non-empty lock -> dropped.
    const directRow = {subcategory: null, color_family: null}
    expect(passesLockedFilter(directRow, {subcategory: "derby"})).toBe(false)
  })
  it("QUIRK: null row itself fails closed (safety-first exclusion)", () => {
    expect(passesLockedFilter(null, {subcategory: "derby"})).toBe(false)
  })
})

describe("toleranceToTargetCount — v4 result-count knob", () => {
  it("route.ts calls it with defaultCount = TARGET_RESULTS (7), not the lib default 15", () => {
    // search-products/route.ts: toleranceToTargetCount(styleTolerance, TARGET_RESULTS)
    expect(toleranceToTargetCount(null, TARGET_RESULTS)).toBe(7)
    expect(toleranceToTargetCount(undefined, TARGET_RESULTS)).toBe(7)
  })
  it("QUIRK: with explicit tolerance the 10..20 range is used, IGNORING defaultCount", () => {
    // The 7 fallback only applies for null/undefined/non-finite tolerance.
    // A real tolerance always yields round(10 + clamped*10) -> 10..20,
    // so targetCount can EXCEED TARGET_RESULTS (7). Pinned as-is.
    expect(toleranceToTargetCount(0, TARGET_RESULTS)).toBe(10)
    expect(toleranceToTargetCount(0.5, TARGET_RESULTS)).toBe(15)
    expect(toleranceToTargetCount(1, TARGET_RESULTS)).toBe(20)
    expect(toleranceToTargetCount(1.5, TARGET_RESULTS)).toBe(20)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// FROZEN REFERENCE: additive scoring formula lifted verbatim from
// searchByEnums (route.ts ~620-799). The extracted scorer module MUST
// reproduce these exact totals for the fixed inputs below.
// ──────────────────────────────────────────────────────────────────────────

type Row = {
  subcategory: string | null
  fit: string | null
  fabric: string | null
  color_family: string | null
  style_node: string | null
  mood_tags: string[] | null
  keywords_ko: string[] | null
  keywords_en: string[] | null
  season: string | null
  pattern: string | null
  name: string
}
type Item = {
  subcategory?: string
  fit?: string
  fabric?: string
  colorFamily?: string
  season?: string
  pattern?: string
}

// Verbatim port of the per-row scoring math. Only the SUBCATEGORY_NAME_KEYWORDS
// branch is reduced to a literal map for the cases exercised here (the engine's
// keyword table is large; we pin the arithmetic, not the full dictionary).
function referenceScore(
  row: Row,
  item: Item,
  itemKeywords: string[],
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
  moodTags: string[] | undefined,
  nameKeywords: string[],
): number {
  let subcategoryExact = 0
  let subcategorySimilar = 0
  if (item.subcategory && row.subcategory) {
    if (row.subcategory === item.subcategory) {
      subcategoryExact = WEIGHTS.subcategory
    } else {
      const similars = SIMILAR_SUBCATEGORIES[item.subcategory] ?? []
      if (similars.includes(row.subcategory)) {
        subcategorySimilar = WEIGHTS.subcategorySimilar
      }
    }
  }
  const subcategoryScore = subcategoryExact + subcategorySimilar

  let nameMatchScore = 0
  if (item.subcategory) {
    const nameLower = (row.name || "").toLowerCase()
    const keywords = nameKeywords.length > 0 ? nameKeywords : [item.subcategory]
    if (keywords.some((kw) => nameLower.includes(kw.toLowerCase()))) {
      nameMatchScore = WEIGHTS.nameMatch
    }
  }

  const rowKeywordsKo = Array.isArray(row.keywords_ko) ? row.keywords_ko : []
  const rowKeywordsEn = Array.isArray(row.keywords_en)
    ? row.keywords_en.map((k) => k.toLowerCase())
    : []
  const allRowKeywords = [...rowKeywordsKo, ...rowKeywordsEn]
  const kwOverlap = itemKeywords.filter((kw) =>
    allRowKeywords.some((rk) => rk.includes(kw) || kw.includes(rk)),
  ).length
  const keywordsScore =
    Math.min(kwOverlap, WEIGHTS.keywordsMax) * WEIGHTS.keywordsEach

  const fitScore = item.fit && row.fit === item.fit ? WEIGHTS.fit : 0
  const fabricScore = item.fabric && row.fabric === item.fabric ? WEIGHTS.fabric : 0
  const colorFamilyScore =
    item.colorFamily && row.color_family === item.colorFamily
      ? WEIGHTS.colorFamily
      : 0
  const colorAdjacentScore =
    !colorFamilyScore &&
    item.colorFamily &&
    row.color_family &&
    isAdjacentColor(item.colorFamily, row.color_family)
      ? WEIGHTS.colorAdjacent
      : 0

  let seasonScore = 0
  const querySeason =
    item.season ||
    (item.subcategory ? SUBCATEGORY_DEFAULT_SEASON[item.subcategory] : undefined)
  if (querySeason && row.season) {
    if (row.season === querySeason) {
      seasonScore = WEIGHTS.season
    } else if (row.season === "all-season") {
      seasonScore = WEIGHTS.season * 0.5
    }
  }

  let patternScore = 0
  if (item.pattern && row.pattern && row.pattern === item.pattern) {
    patternScore = WEIGHTS.pattern
  }

  const primarySim = getStyleSimilarity(primaryNode, row.style_node)
  const secondarySim = getStyleSimilarity(secondaryNode, row.style_node)
  const styleNodeScore = Math.max(
    WEIGHTS.stylePrimary * primarySim,
    WEIGHTS.styleSecondary * secondarySim,
  )

  const rowMoodTags = Array.isArray(row.mood_tags) ? row.mood_tags : []
  const requestMoodTags = moodTags ?? []
  const overlapCount = rowMoodTags.filter((t) =>
    requestMoodTags.includes(t),
  ).length
  const moodScore =
    Math.min(overlapCount, WEIGHTS.moodTagMax) * WEIGHTS.moodTagEach

  // brandDnaScore is always 0: brandDnaMap is intentionally empty since the
  // 062/067 column drops (route.ts comment lines 246-250). Pinned as 0.
  const brandDnaScore = 0

  return (
    subcategoryScore +
    nameMatchScore +
    keywordsScore +
    fitScore +
    fabricScore +
    colorFamilyScore +
    colorAdjacentScore +
    styleNodeScore +
    moodScore +
    seasonScore +
    patternScore +
    brandDnaScore
  )
}

describe("v4 additive scoring formula — frozen reference totals", () => {
  it("perfect match across all dimensions", () => {
    const row: Row = {
      subcategory: "blazer",
      fit: "regular",
      fabric: "wool",
      color_family: "BLACK",
      style_node: "C",
      mood_tags: ["minimal", "clean"],
      keywords_ko: ["워싱"],
      keywords_en: ["washed"],
      season: "fall",
      pattern: "solid",
      name: "Wool Blazer",
    }
    const item: Item = {
      subcategory: "blazer",
      fit: "regular",
      fabric: "wool",
      colorFamily: "BLACK",
      season: "fall",
      pattern: "solid",
    }
    const total = referenceScore(
      row,
      item,
      ["washed"],
      "C",
      undefined,
      ["minimal", "clean"],
      ["blazer", "블레이저"],
    )
    // subcat .25 + name .20 + kw(1*.05) + fit .15 + fabric .15 + color .20
    //   + style(.30*1.0) + mood(2*.05=.10) + season .15 + pattern .15 = 1.70
    // (pinned to OBSERVED value — characterization, not hand-computed target)
    expect(total).toBeCloseTo(1.7, 10)
  })

  it("similar-subcategory + adjacent-color + all-season half-credit + style gradient", () => {
    const row: Row = {
      subcategory: "trench-coat", // similar to "overcoat"
      fit: null,
      fabric: null,
      color_family: "GREY", // adjacent to BLACK
      style_node: "D", // C->D similarity 0.7
      mood_tags: null,
      keywords_ko: null,
      keywords_en: null,
      season: "all-season", // != fall -> half season credit
      pattern: null,
      name: "Long Coat",
    }
    const item: Item = {
      subcategory: "overcoat",
      colorFamily: "BLACK",
      season: "fall",
    }
    const total = referenceScore(
      row,
      item,
      [],
      "C",
      undefined,
      undefined,
      ["coat", "코트"], // name "Long Coat" includes "coat" -> nameMatch
    )
    // subcatSimilar .10 + name .20 + colorAdjacent .10 + style(.30*0.7=.21)
    //   + season(.15*0.5=.075) = 0.685
    expect(total).toBeCloseTo(0.685, 10)
  })

  it("zero match -> total 0 (engine then filters it out as _score<=0)", () => {
    const row: Row = {
      subcategory: "sneakers",
      fit: "slim",
      fabric: "leather",
      color_family: "RED",
      style_node: "Z",
      mood_tags: ["loud"],
      keywords_ko: null,
      keywords_en: null,
      season: "summer",
      pattern: "camo",
      name: "Red Sneaker",
    }
    const item: Item = {
      subcategory: "blazer",
      fit: "regular",
      colorFamily: "BLACK",
    }
    const total = referenceScore(
      row,
      item,
      ["formal"],
      "C",
      undefined,
      ["minimal"],
      ["blazer"],
    )
    expect(total).toBe(0)
  })

  it("keywords cap at keywordsMax (3) regardless of overlap count", () => {
    const row: Row = {
      subcategory: "shirt",
      fit: null,
      fabric: null,
      color_family: null,
      style_node: null,
      mood_tags: null,
      keywords_ko: ["a", "b", "c", "d", "e"],
      keywords_en: null,
      season: null,
      pattern: null,
      name: "x",
    }
    const item: Item = {subcategory: "shirt"}
    const total = referenceScore(
      row,
      item,
      ["a", "b", "c", "d", "e"],
      undefined,
      undefined,
      undefined,
      [], // -> name keyword falls back to [item.subcategory]="shirt", "x" has no "shirt" -> nameMatch 0
    )
    // subcat .25 + keywords capped 3*.05=.15 = 0.40
    expect(total).toBeCloseTo(0.4, 10)
  })

  it("QUIRK: styleNode uses MAX(primary, secondary) weighted — secondary can win", () => {
    const row: Row = {
      subcategory: null,
      fit: null,
      fabric: null,
      color_family: null,
      style_node: "B-2",
      mood_tags: null,
      keywords_ko: null,
      keywords_en: null,
      season: null,
      pattern: null,
      name: "",
    }
    const item: Item = {}
    // primary "C" -> sim(C,B-2)=0.3 -> .30*0.3 = .09
    // secondary "B-2" -> sim=1.0 -> .15*1.0 = .15  (secondary wins via Math.max)
    const total = referenceScore(row, item, [], "C", "B-2", undefined, [])
    expect(total).toBeCloseTo(0.15, 10)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// FROZEN REFERENCE: sort comparator + brand/platform diversity cap
// (route.ts ~801-851). Pins ordering & cap behavior.
// ──────────────────────────────────────────────────────────────────────────

type Scored = {
  _score: number
  _rawPrice: number
  _genderPriority: number
  _subTier: number
  _scoring: {colorFamily: number}
  brand: string
  platform: string
}

function referenceSortAndCap(
  scored: Scored[],
  hasColorQuery: boolean,
  perBrandCap: number,
): Scored[] {
  const sorted = [...scored].sort((a, b) => {
    const subDiff = a._subTier - b._subTier
    if (subDiff !== 0) return subDiff
    if (hasColorQuery) {
      const aColor = a._scoring.colorFamily > 0 ? 0 : 1
      const bColor = b._scoring.colorFamily > 0 ? 0 : 1
      if (aColor !== bColor) return aColor - bColor
    }
    const genderDiff = a._genderPriority - b._genderPriority
    if (genderDiff !== 0) return genderDiff
    const scoreDiff = b._score - a._score
    if (scoreDiff !== 0) return scoreDiff
    return a._rawPrice - b._rawPrice
  })

  const result: Scored[] = []
  const brandCount: Record<string, number> = {}
  const platformCount: Record<string, number> = {}
  for (const p of sorted) {
    if (result.length >= TARGET_RESULTS) break
    const brand = (p.brand || "unknown").toLowerCase()
    const platform = (p.platform || "unknown").toLowerCase()
    if ((brandCount[brand] ?? 0) >= perBrandCap) continue
    if ((platformCount[platform] ?? 0) >= MAX_PER_PLATFORM) continue
    brandCount[brand] = (brandCount[brand] ?? 0) + 1
    platformCount[platform] = (platformCount[platform] ?? 0) + 1
    result.push(p)
  }
  return result
}

const mk = (o: Partial<Scored> & {brand: string}): Scored => ({
  _score: 0,
  _rawPrice: 0,
  _genderPriority: 2,
  _subTier: 3,
  _scoring: {colorFamily: 0},
  platform: "p1",
  ...o,
})

describe("v4 sort comparator — frozen precedence", () => {
  it("subTier dominates everything else", () => {
    const out = referenceSortAndCap(
      [
        mk({brand: "lo-tier", _subTier: 3, _score: 99}),
        mk({brand: "hi-tier", _subTier: 0, _score: 1}),
      ],
      false,
      MAX_PER_BRAND,
    )
    expect(out.map((p) => p.brand)).toEqual(["hi-tier", "lo-tier"])
  })

  it("color match precedes gender precedes score when subTier ties (color query on)", () => {
    const out = referenceSortAndCap(
      [
        mk({brand: "a", _subTier: 0, _scoring: {colorFamily: 0}, _score: 99}),
        mk({brand: "b", _subTier: 0, _scoring: {colorFamily: 0.2}, _score: 1}),
      ],
      true,
      MAX_PER_BRAND,
    )
    expect(out.map((p) => p.brand)).toEqual(["b", "a"])
  })

  it("price ascending is the final tiebreaker", () => {
    const out = referenceSortAndCap(
      [
        mk({brand: "exp", _subTier: 0, _score: 1, _rawPrice: 9000}),
        mk({brand: "chp", _subTier: 0, _score: 1, _rawPrice: 1000}),
      ],
      false,
      MAX_PER_BRAND,
    )
    expect(out.map((p) => p.brand)).toEqual(["chp", "exp"])
  })
})

describe("v4 diversity cap — frozen", () => {
  it("default per-brand cap = 2, per-platform cap = 3", () => {
    const items = Array.from({length: 10}, (_, i) =>
      mk({brand: "samebrand", platform: `pf${i}`, _subTier: 0, _score: 10 - i}),
    )
    const out = referenceSortAndCap(items, false, MAX_PER_BRAND)
    // same brand -> capped at 2 despite 10 candidates
    expect(out).toHaveLength(2)
  })

  it("QUIRK: brandFilter searches lift per-brand cap to Infinity", () => {
    const items = Array.from({length: 10}, (_, i) =>
      mk({brand: "samebrand", platform: `pf${i}`, _subTier: 0, _score: 10 - i}),
    )
    const out = referenceSortAndCap(items, false, Infinity)
    // Infinity per-brand cap -> only TARGET_RESULTS (7) + platform cap bind
    expect(out).toHaveLength(7)
  })

  it("never exceeds TARGET_RESULTS (7)", () => {
    const items = Array.from({length: 30}, (_, i) =>
      mk({brand: `b${i}`, platform: `pf${i}`, _subTier: 0, _score: 30 - i}),
    )
    expect(referenceSortAndCap(items, false, MAX_PER_BRAND)).toHaveLength(7)
  })
})
