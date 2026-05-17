# SPEC-SEARCH-UNIFY-001 — ANALYZE

> Phase: ANALYZE (DDD). Companion to PRESERVE characterization tests
> (`src/__characterization__/search-unify-001/`). IMPROVE is **deferred and
> orchestrator-gated** — this document only maps the current behavior and the
> seam; it implements nothing.

Authoritative source: `.moai/specs/SPEC-SEARCH-UNIFY-001/spec.md`.
Worktree: `app-SPEC-SEARCH-UNIFY-001` @ `feature/SPEC-SEARCH-UNIFY-001`.

---

## 1. Current behavior map — `src/app/api/find/search/route.ts`

v5-only since #57 (`docs/features/main-flow.md` line 221 doc-fix). The v4
in-process fallback was **removed from code**; the route 502s on AI failure.
File is 217 LOC, single `POST` handler.

### 1.1 Input validation (400 contract)

| Condition | Code | Response |
|---|---|---|
| `request.json()` throws | `route.ts:101-105` | `400 {error:"Invalid JSON"}` |
| `!body.item \|\| typeof !== "object"` | `route.ts:107-109` | `400 {error:"Missing \`item\`"}` |
| `!body.item.searchQuery \|\| typeof !== "string"` | `route.ts:110-115` | `400 {error:"item.searchQuery is required"}` |
| fall-through: `!(body.imageUrl && AI_SERVER_URL)` | `route.ts:210-216` | `400 {error:"imageUrl and AI_SERVER_URL required", code:"AI_SERVER_REQUIRED"}` |

**QUIRK (pinned, find-search-route.test.ts):** when `AI_SERVER_URL` env is
unset, the `if (body.imageUrl && AI_SERVER_URL)` gate at `route.ts:138` is
false **even with a valid `imageUrl`**, so control falls through to the 400
`AI_SERVER_REQUIRED` branch — it never reaches the 502 path.

### 1.2 v5 success path → response shape

- `route.ts:122-135` — `taggedHandles` → normalized handles (strip `@`,
  lowercase, max 20) → `resolveIgHandlesToBrands` → `brandFilter` (brand
  names) + `resolved` (echoed back as `resolvedBrands`).
- `route.ts:138` — gate `if (body.imageUrl && AI_SERVER_URL)`.
- `route.ts:151-169` — `Promise.all([strongAI?, generalAI])`:
  - `strongAI`: only called when `brandFilter.length > 0`, with
    `{...commonAI, brandFilter, tolerance: strongMatchTolerance ?? 0.5}`.
    Otherwise `Promise.resolve(null)`.
  - `generalAI`: always called, with `{...commonAI, tolerance: generalTolerance ?? 0.5}`.
  - `callAIServer` (`route.ts:54-96`): `POST {AI_SERVER_URL}/recommend`,
    `AbortController` timeout `AI_SERVER_TIMEOUT_MS` (default 60000). Returns
    `null` on `!AI_SERVER_URL` (58), non-2xx (`route.ts:75-81`), or any
    `fetch`/abort throw (`route.ts:88-93`). Otherwise returns parsed
    `AIRecommendResponse`.
- `route.ts:171` — **the 200/502 decision gates ONLY on `if (generalAI)`
  truthiness.** Not on result count, not on strong success.
- `route.ts:178-185` — `toSearchProduct` maps `AICandidate` →
  `{brand, title:c.name, price: c.price!=null ? "₩"+toLocaleString("ko-KR") : "", platform: c.platform??"", imageUrl: c.imageUrl??"", link: c.productUrl??""}`.
- `route.ts:186-198` — 200 envelope (byte-shape, **port-seam invariant**):
  ```
  { item: body.item,
    resolvedBrands: resolved,
    strongMatches: strongAI && strongAI.results.length>0 ? [{id:"strong", products:[...toSearchProduct]}] : [],
    general:       generalAI.results.length>0           ? [{id:"general", products:[...toSearchProduct]}] : [],
    engine: "v5" }
  ```

**QUIRKs (pinned):** AI ok but `results:[]` → still `200 engine:"v5"` with
empty groups (not 502); strong call 500 but general ok → still 200, empty
`strongMatches`; `price:null` → `""`, `price:0` → `"₩0"`.

### 1.3 v5 failure → 502

`route.ts:201-207` — `generalAI` falsy (null from 5xx, network throw, or
abort/timeout — all collapse to `null` in `callAIServer`'s catch) →
`502 {error:"AI server unavailable", code:"AI_SERVER_FAILED"}`.

---

## 2. The seam — where the versioned `SearchEngine` port inserts

### 2.1 Exact call site

The seam is the **`route.ts:151-169` `Promise.all([... callAIServer ...])`
block plus the `if (generalAI)` decision (`route.ts:171`) and the 502
(`route.ts:204`)**. Today the route both *invokes the engine* (callAIServer
twice) and *owns the envelope translation* (toSearchProduct + grouping).

In IMPROVE the port is inserted **between handle-resolution
(`route.ts:122-135`) and envelope construction (`route.ts:186-198`)**:

```
route POST
  ├─ input validation                     (unchanged — stays in route)
  ├─ taggedHandles → resolved/brandFilter  (unchanged — stays in route)
  ├─ [SEAM]  engine = selectEngine(SEARCH_ENGINE_VERSION)
  │          result = engine.search({ item, imageUrl, gender, styleNode,
  │                                   moodTags, priceFilter, brandFilter,
  │                                   strongTolerance, generalTolerance })
  └─ envelope construction from result     (unchanged shape — stays in route)
```

### 2.2 Composition behind the port (IMPROVE — NOT built here)

```
selectEngine(SEARCH_ENGINE_VERSION)
   ├─ unset / "v5"  → CircuitBreaker(v5-adapter, fallback = v4-fallback-adapter)
   ├─ "v4"          → v4-fallback-adapter (forced degraded)
   └─ "v6"          → v6-adapter (drop-in, not in scope)

CircuitBreaker.search(req):
   closed    → v5-adapter.search(req)
                  success     → reset failure count, return (engine:"v5")
                  5xx/timeout → failure++ ; if >= threshold open breaker
                              → v4-fallback-adapter.search(req) (engine:"v4-degraded")
   open      → fast-fail → v4-fallback-adapter.search(req) (engine:"v4-degraded")
                  after cooldown → half-open
   half-open → probe v5-adapter once; success → close; fail → re-open
```

**Byte-identical-on-v5-success invariant:** when v5-adapter succeeds, the
breaker is a pure pass-through. `v5-adapter` MUST internally reproduce the
current `callAIServer` + `toSearchProduct` + strong/general grouping so the
route's envelope is byte-for-byte identical. The PRESERVE 1 regression net
(`find-search-route.test.ts`, 13 tests) is the enforcement mechanism: it
asserts the full envelope incl. `engine:"v5"`, the price quirks, and the
`generalAI`-only 200/502 gate. Rollback: `SEARCH_ENGINE_VERSION` unset +
`CB_ENABLED=false` => breaker bypass => v5-direct, single-env-toggle restore.

---

## 3. v4 fallback target — `src/domains/search-v4/`

The future `v4-fallback-adapter` wraps the **already-extracted**
`searchByEnums` (SPEC-ARCH-APP-001, NOT this SPEC's work). Per REQ-SU-007 it
uses **raw RPC output only** — no re-maintenance of scoring; the
scorer/ranker run as-is inside `searchByEnums` and the adapter does not touch
them.

### 3.1 Exposed entry point

`src/domains/search-v4/index.ts` barrel exports `searchByEnums` (+ scorer,
ranker, query-builder, constants, types). Engine signature
(`engine.ts:14-25`):

```
searchByEnums(
  item: SearchQuery,
  genderFilter: string | null,
  dbCategories: string[] | null,
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
  moodTags: string[] | undefined,
  priceFilter: { minPrice?: number; maxPrice?: number } | undefined,
  itemKeywords: string[],
  brandDnaMap: Map<string, BrandDna>,
  brandFilter: string[] | null,
): Promise<ScoredProduct[]>
```

Pipeline: `fetchCandidates` (3 PostgREST paths + merge) → `scoreRow` +
`passesScoreFilter` → `rankAndCap`.

### 3.2 Result shape (the contract the fallback adapter must reproduce)

`ScoredProduct = FormattedProduct & { _score, _rawPrice, _genderPriority, _subTier }`
(`types.ts:56-77`):

```
FormattedProduct {
  brand: string
  price: string            // QUIRK: STRING, pre-formatted (e.g. "₩129,000"), NOT a number
  platform: string
  imageUrl: string
  link: string
  title: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: { field: string; value: string }[]
  _scoring?: ScoreBreakdown  // 14 numeric keys incl. totalScore
}
ScoredProduct adds (internal, used by ranker/caller, not user-facing):
  _score: number ; _rawPrice: number ; _genderPriority: number ; _subTier: number
```

**Live caller** (`src/app/api/search-products/route.ts:97-124`, the only
non-characterization caller) consumes it as `ScoredProduct[]`, dedups by
`` `${p.brand}::${p.title}` ``, slices to `targetCount`, reshapes to
`{id, products:[{...FormattedProduct, _rawPrice}]}`. The future
`v4-fallback-adapter` must produce the same `ScoredProduct[]` element shape
(esp. **price-as-pre-formatted-string** quirk — diverges from the v5
`AICandidate.price: number|null`; the route's `toSearchProduct` already
emits a string, so the adapter boundary normalizes both engines to the
route's `{price:string}` envelope).

### 3.3 Supabase coupling constraint (drives PRESERVE 2/2 design)

`query-builder.ts:4` imports `@/lib/supabase`; `searchByEnums` cannot be
unit-invoked without a live PostgREST. This is the **same constraint
`src/__characterization__/arch-app-001/v4-scoring.test.ts` documented**: that
test pins the scoring *arithmetic* (scorer/ranker numbers) via frozen
reference computations. It does **not** pin the `searchByEnums` *orchestration
output shape* / barrel signature — which is the gap PRESERVE 2/2 fills (the
structural contract, type-level + barrel-stability, that the fallback adapter
must satisfy). No coverage duplication.

---

## 4. DTO alignment (doc only — ai repo NOT read/modified)

**Explicit statement:** I did NOT read or modify the `ai` repo. The shapes
below are **inferred solely from the app-side caller's TypeScript interface
declarations** in `src/app/api/find/search/route.ts` (lines 35-52). They are
the contract the port's request/response must match for v5-success
byte-identity. SPEC-ARCH-AI-001 REQ-AI-005 is the ai-side owner of the real
DTO; this is an app-side observed shape — treat any divergence from the actual
ai DTO as a follow-up reconciliation (flagged as an assumption below).

### 4.1 Request (app → ai `POST /recommend`)

Assembled at `route.ts:142-168`:

```
RecommendRequest (observed) {
  item: { id, category, subcategory?, fit?, fabric?, colorFamily?,
          searchQuery, searchQueryKo? }
  imageUrl: string
  gender?: string
  styleNode?: { primary: string; secondary?: string }
  moodTags?: string[]
  priceFilter?: { minPrice?: number; maxPrice?: number }
  brandFilter?: string[]     // present ONLY on the "strong" call
  tolerance: number          // strongMatchTolerance | generalTolerance, default 0.5
}
```

### 4.2 Response (ai → app)

`route.ts:35-52` interfaces:

```
RecommendResponse (observed) {
  itemId: string
  results: AICandidate[]
  counts: Record<string, number>
  latencyMs: Record<string, number>
}
AICandidate {
  id: string
  brand: string
  name: string
  price: number | null       // (route maps → "₩x" | "")
  imageUrl: string | null
  productUrl: string | null
  platform: string | null
  subcategory: string | null
  score: number
}
```

The `SearchEngine` port contract MUST be expressible such that the v5-adapter
takes the §4.1 request and yields results the route maps via the existing
`toSearchProduct` (`route.ts:178-185`) into the §1.2 envelope **unchanged**.

---

## 5. v6 drop-in seam (mechanism only — NOT designed/implemented)

v6 slots behind the **identical `SearchEngine` port** via the global single
active version `SEARCH_ENGINE_VERSION` (REQ-SU-002 / REQ-SU-006):

1. Author `src/domains/search/adapters/v6-adapter.ts` implementing the same
   `SearchEngine` interface (same request/response contract as §4).
2. Register it in the version→adapter map consulted by `selectEngine`.
3. Set `SEARCH_ENGINE_VERSION=v6`.

**Zero `find/search` (or any app caller) diff** — the route only ever calls
`selectEngine(...).search(req)`. REQ-SU-006 forward-compat is a first-class
acceptance gate: a dummy v6 stub + `SEARCH_ENGINE_VERSION=v6` must route with
caller diff 0, proven by an automated test in IMPROVE. v6 itself is **out of
scope** (user is actively developing it; this SPEC must not block/refactor
it — NOT-in-scope "v6 구현").

---

## 6. PRESERVE → IMPROVE handoff (ordered, orchestrator-gated)

PRESERVE (this phase, complete after part 2):

- **PRESERVE 1/2** committed `2985163` —
  `src/__characterization__/search-unify-001/find-search-route.test.ts`
  (13 tests, GREEN): pins find/search HTTP envelope, v5-success byte-shape
  incl. `engine:"v5"`, 400 variants, 502 on v5 failure, all QUIRKs.
- **PRESERVE 2/2** (this commit) —
  `src/__characterization__/search-unify-001/search-v4-shape.test.ts`: pins
  `searchByEnums` signature arity + `ScoredProduct`/`FormattedProduct`
  structural contract + barrel export stability (the shape the
  v4-fallback-adapter must reproduce). Type-level + structural, not live
  (supabase-coupled, §3.3).

IMPROVE (deferred — each step behavior-preserving, gated):

1. `src/domains/search/engine-port.ts` — `SearchEngine` interface +
   request/response types aligned to §4. No behavior; no caller change.
2. `src/domains/search/adapters/v5-adapter.ts` — extract `callAIServer` +
   `toSearchProduct` + strong/general grouping verbatim. Invariant: PRESERVE
   1 (`find-search-route.test.ts`) stays GREEN unchanged (byte-identical
   envelope incl. `engine:"v5"`).
3. `src/domains/search/adapters/v4-fallback-adapter.ts` — wrap
   `searchByEnums` raw RPC (no scorer/ranker re-maintenance), normalize to
   port response, mark `engine:"v4-degraded"`. Invariant: PRESERVE 2
   (`search-v4-shape.test.ts`) stays GREEN — adapter output element shape
   matches pinned `ScoredProduct`/`FormattedProduct`.
4. `src/domains/search/circuit-breaker.ts` — closed/open/half-open state
   machine, env threshold/cooldown, `CB_ENABLED` bypass.
5. **find/search delegation swap** (the only `src/` behavior change, highest
   risk) — replace `route.ts:151-216` engine+decision block with
   `selectEngine(...).search(req)` + envelope. Default
   (`SEARCH_ENGINE_VERSION` unset, `CB_ENABLED=false`) = v5-direct, so
   single-env rollback. Invariant: PRESERVE 1 GREEN unchanged + REQ-SU-006
   v6-stub routing test GREEN.
6. **Docs sync** (CLAUDE.md mandatory-3): `docs/features/search-engine.md`
   (port + flag + fallback + breaker + v6 seam section), `docs/features/main-flow.md`
   (REQ-SU-008 re-verify Step 5 + remove interim banner),
   `docs/ARCHITECTURE.md` (search topology diagram).

**Byte-identical-on-v5-success invariant** holds across every IMPROVE step:
PRESERVE 1 must pass *unchanged* (no test edits) at every commit; any diff in
the v5-success envelope is a regression and triggers immediate revert.

---

## 7. Assumptions / blockers

- **A1 (ai DTO inferred, not verified):** §4 shapes come exclusively from the
  app-side caller's interface declarations in find/search/route.ts. The
  `ai` repo was not read (out of scope; SPEC-ARCH-AI-001 owns REQ-AI-005). If
  the real `/recommend` DTO diverges from the app's observed interface, the
  port contract in IMPROVE step 1 needs reconciliation against the ai source
  — flag for the orchestrator before v5-adapter extraction.
- **A2 (`search-v5-client` module absent):** spec Cross-References mention
  `src/domains/search-v5-client/` as the active-adapter wrap target, but
  SPEC-ARCH-APP-001 only extracted `search-v4`; the v5 path still lives
  inline in find/search (`callAIServer`). IMPROVE step 2 therefore *extracts*
  v5 from the route into the adapter (not "wrap an existing module"). Noted
  so the orchestrator does not expect a pre-existing v5 client module.
- No blockers preventing PRESERVE completion. IMPROVE is intentionally not
  started (orchestrator gate).
