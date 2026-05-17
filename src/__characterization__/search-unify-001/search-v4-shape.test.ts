/**
 * SPEC-SEARCH-UNIFY-001 PRESERVE 2/2 — `src/domains/search-v4` raw output
 * shape contract.
 *
 * This is the SECOND half of the HARD characterization gate. PRESERVE 1
 * (find-search-route.test.ts) pinned the app-side `/api/find/search` HTTP
 * envelope (the v5-success byte-shape). THIS file pins the OTHER contract the
 * upcoming versioned `SearchEngine` port depends on: the `domains/search-v4`
 * engine's PUBLIC SURFACE — the exact shape the future
 * `v4-fallback-adapter` (IMPROVE, deferred) must reproduce when it wraps the
 * raw RPC (REQ-SU-004: raw RPC only, no scoring re-maintenance).
 *
 * WHY structural / type-level, not live invocation:
 *   `searchByEnums` -> `fetchCandidates` -> `@/lib/supabase` (PostgREST). It
 *   CANNOT be unit-invoked without a live PostgREST gateway. This is the SAME
 *   constraint `src/__characterization__/arch-app-001/v4-scoring.test.ts`
 *   documented — that test pins the scoring ARITHMETIC (scorer/ranker
 *   numbers) via frozen reference computations; it does NOT pin the
 *   `searchByEnums` ORCHESTRATION OUTPUT SHAPE or the barrel signature. That
 *   is the gap THIS file fills (no coverage duplication).
 *
 * What is pinned here (CURRENT public contract of the search-v4 barrel,
 * verbatim — quirks pinned as-is, nothing "fixed"):
 *   1. Barrel (`@/domains/search-v4`) exports: `searchByEnums` is a function
 *      of arity 10 (the exact positional signature the fallback adapter and
 *      the live `/api/search-products` caller depend on).
 *   2. `ScoredProduct` element shape: the keys + value TYPES the engine
 *      returns per result. Asserted via a representative object that the
 *      exported `ScoredProduct` type must structurally accept (compile-time)
 *      AND a runtime key/type snapshot (the contract surface the adapter
 *      normalizes into the route envelope).
 *   3. QUIRK: `price` is a PRE-FORMATTED STRING (e.g. "₩129,000"), NOT a
 *      number — diverges from the v5 `AICandidate.price: number|null`. The
 *      adapter boundary must preserve this string-ness (the route's
 *      `toSearchProduct` already emits a string for v5; v4 is already a
 *      string upstream).
 *   4. `_scoring` (when present) is a `ScoreBreakdown` of exactly 14 numeric
 *      keys incl. `totalScore`.
 *
 * The supabase client is MOCKED (never called — arity check does not invoke
 * the function) purely so importing the barrel is side-effect-safe in jsdom.
 */

import {describe, expect, it} from "vitest"
import type {
  FormattedProduct,
  ScoredProduct,
  ScoreBreakdown,
  MatchReason,
  SearchQuery,
} from "@/domains/search-v4"

// `@/lib/supabase` imports `server-only` and re-exports the PostgREST client.
// Neutralize so importing the search-v4 barrel (transitively pulls supabase
// via query-builder) is side-effect-safe under jsdom. We never invoke
// searchByEnums (arity-only assertion), so no client behavior is exercised.
import {vi} from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase", () => ({
  supabase: {from: () => ({select: () => ({})})},
}))

describe("search-v4 barrel — public engine surface (port fallback contract)", () => {
  it("exports searchByEnums as a function with the pinned positional arity (10)", async () => {
    const mod = await import("@/domains/search-v4")
    expect(typeof mod.searchByEnums).toBe("function")
    // 10 positional params: item, genderFilter, dbCategories, primaryNode,
    // secondaryNode, moodTags, priceFilter, itemKeywords, brandDnaMap,
    // brandFilter. The v4-fallback-adapter binds against THIS arity.
    expect(mod.searchByEnums.length).toBe(10)
  })

  it("re-exports the v4 pipeline building blocks the engine composes", async () => {
    const mod = await import("@/domains/search-v4")
    expect(typeof mod.fetchCandidates).toBe("function")
    expect(typeof mod.scoreRow).toBe("function")
    expect(typeof mod.passesScoreFilter).toBe("function")
    expect(typeof mod.rankAndCap).toBe("function")
    expect(typeof mod.sanitizeKeyword).toBe("function")
  })

  it("pins the v4 diversity/scoring constants the result shape implies", async () => {
    const mod = await import("@/domains/search-v4")
    // These constants govern the SHAPE/SIZE of the returned ScoredProduct[]
    // (cap count, per-brand/platform diversity). The fallback adapter must
    // not assume a different cap.
    expect(mod.TARGET_RESULTS).toBe(7)
    expect(mod.MAX_PER_BRAND).toBe(2)
    expect(mod.MAX_PER_PLATFORM).toBe(3)
    expect(mod.MIN_VALID_PRICE).toBe(1000)
    expect(mod.ACTIVE_VERSION).toBe("v1")
  })
})

describe("search-v4 — ScoredProduct element shape (what the fallback adapter must reproduce)", () => {
  // A representative result element EXACTLY as searchByEnums produces it
  // (verbatim field set from types.ts FormattedProduct & ScoredProduct).
  // Typed as ScoredProduct: if the exported type drifts, this stops
  // compiling — the type IS part of the pinned contract.
  const scoring: ScoreBreakdown = {
    subcategory: 0.25,
    subcategorySimilar: 0.1,
    nameMatch: 0.2,
    keywords: 0.15,
    fit: 0.15,
    fabric: 0.15,
    colorFamily: 0.2,
    colorAdjacent: 0.1,
    styleNode: 0.3,
    moodTags: 0.05,
    season: 0.15,
    pattern: 0.15,
    brandDna: 0.2,
    totalScore: 2.3,
  }

  const reasons: MatchReason[] = [{field: "colorFamily", value: "Black"}]

  const SAMPLE: ScoredProduct = {
    // FormattedProduct (user-facing — feeds the route envelope via the adapter)
    brand: "Acme",
    price: "₩129,000", // QUIRK: pre-formatted STRING, not a number
    platform: "cafe24",
    imageUrl: "https://img/x.jpg",
    link: "https://shop/x",
    title: "Wool Coat",
    description: "warm",
    material: "wool",
    reviewCount: 12,
    matchReasons: reasons,
    _scoring: scoring,
    // ScoredProduct internals (used by ranker + the /api/search-products
    // caller dedup/slice; the fallback adapter normalizes these away)
    _score: 2.3,
    _rawPrice: 129000,
    _genderPriority: 0,
    _subTier: 0,
  }

  it("the exact key set of a v4 result element (pinned, verbatim)", () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(
      [
        "_genderPriority",
        "_rawPrice",
        "_score",
        "_scoring",
        "_subTier",
        "brand",
        "description",
        "imageUrl",
        "link",
        "material",
        "matchReasons",
        "platform",
        "price",
        "reviewCount",
        "title",
      ].sort(),
    )
  })

  it("QUIRK: price is a pre-formatted string '₩129,000', NOT a number", () => {
    expect(typeof SAMPLE.price).toBe("string")
    expect(SAMPLE.price).toBe("₩129,000")
  })

  it("the user-facing FormattedProduct subset has string brand/title/platform/imageUrl/link", () => {
    // The v4-fallback-adapter maps THIS subset into the same route envelope
    // slot as v5's toSearchProduct output (brand/title/price/platform/imageUrl/link).
    const fp: FormattedProduct = SAMPLE
    expect(typeof fp.brand).toBe("string")
    expect(typeof fp.title).toBe("string")
    expect(typeof fp.price).toBe("string")
    expect(typeof fp.platform).toBe("string")
    expect(typeof fp.imageUrl).toBe("string")
    expect(typeof fp.link).toBe("string")
  })

  it("ScoredProduct internal ranking fields are all numbers", () => {
    expect(typeof SAMPLE._score).toBe("number")
    expect(typeof SAMPLE._rawPrice).toBe("number")
    expect(typeof SAMPLE._genderPriority).toBe("number")
    expect(typeof SAMPLE._subTier).toBe("number")
  })

  it("_scoring (ScoreBreakdown) is exactly 14 numeric keys incl. totalScore", () => {
    const keys = Object.keys(SAMPLE._scoring as ScoreBreakdown).sort()
    expect(keys).toEqual(
      [
        "brandDna",
        "colorAdjacent",
        "colorFamily",
        "fabric",
        "fit",
        "keywords",
        "moodTags",
        "nameMatch",
        "pattern",
        "season",
        "styleNode",
        "subcategory",
        "subcategorySimilar",
        "totalScore",
      ].sort(),
    )
    for (const v of Object.values(SAMPLE._scoring as ScoreBreakdown)) {
      expect(typeof v).toBe("number")
    }
  })

  it("SearchQuery input shape (engine arg 0) — required id/category/searchQuery", () => {
    // The fallback adapter constructs THIS from the find/search body before
    // calling searchByEnums. Pin the required-field surface.
    const q: SearchQuery = {
      id: "it1",
      category: "outerwear",
      searchQuery: "black wool coat",
    }
    expect(typeof q.id).toBe("string")
    expect(typeof q.category).toBe("string")
    expect(typeof q.searchQuery).toBe("string")
    // optional fields exist on the type without being required
    const full: SearchQuery = {
      ...q,
      subcategory: "overcoat",
      fit: "oversized",
      fabric: "wool",
      colorFamily: "black",
      searchQueryKo: "검정 울 코트",
      season: "winter",
      pattern: "solid",
    }
    expect(full.subcategory).toBe("overcoat")
  })
})
