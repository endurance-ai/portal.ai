# SPEC-V6-EVAL Research

생성: 2026-05-04 (Phase 0.5 of /moai plan workflow)
작성: Explore subagent (deep codebase analysis)

---

## A. Existing admin eval module

**File inventory:**
- UI: `src/app/admin/eval/page.tsx` (main page, 239 LOC)
- UI Components: `src/components/admin/eval-metrics.tsx`, `eval-queue.tsx`, `eval-golden-set.tsx`, `eval-review-detail.tsx`
- API routes: `src/app/api/admin/eval/route.ts` (GET/PATCH/DELETE for queue), `[analysisId]/route.ts` (GET/POST/PATCH/DELETE for reviews), `golden-set/route.ts` (GET/DELETE)
- Auth guard: `src/lib/admin-auth.ts` — `requireApprovedAdmin()` gate + `getAdminStatus()` cache

**Current UI flow:**
Page.tsx displays two tabs: "평가 대기열" (eval queue) and "골든셋" (golden set). Queue tab fetches analyses from `/api/admin/eval` (paginated, verdict-filterable), shows metrics (total/reviewed/pending/pass-rate), and allows filtering by all/pending/reviewed + verdict multi-select. Each analysis card displays image, prompt_text, verdict, comments. Golden set tab loads golden set items via `/api/admin/eval/golden-set`, shows image + expected node + expected items.

**Current data capture:**
- `eval_reviews` (migration 009): analysis_id, reviewer_email, verdict (pass/fail/partial), comment, created_at. Migration 015 adds is_pinned, prompt_version.
- `eval_golden_set` (migration 009/013): analysis_id, image_url, expected_node_primary, expected_node_secondary, expected_items (JSONB), notes, test_type, added_by, created_at.
- `analyses` table: linked source data (id, image_filename, prompt_text, style_node_primary/secondary, detected_gender, items, is_pinned).

**Gaps for v6-EVAL:**
1. No `eval_golden_queries` table — golden set currently links to analyses (analysis_id FK). v6-EVAL needs: instagram_url or query_signature, intent_note, created_by.
2. No `eval_judgments` table — need: golden_query_id, product_id, relevance_grade (0~3), labeler_id, labeled_at, algorithm_version.
3. No `eval_runs` table — need: algorithm_version, ndcg_at_10, precision_at_5, query_count, computed_at.
4. No metrics calculation functions (NDCG@10, Precision@5).
5. No "run v4 algorithm on query" endpoint for evaluation workflow.

---

## B. Database schema (eval-related)

**Existing tables with RLS status:**

| Table | Migration | Columns | RLS Status |
|-------|-----------|---------|-----------|
| `eval_reviews` | 009, 015 | id, analysis_id, reviewer_email, verdict, comment, created_at, is_pinned, prompt_version | None (no RLS enabled) |
| `eval_golden_set` | 009, 013 | id, analysis_id, image_url, expected_node_*, expected_items, expected_color_family, expected_fit, expected_fabric, test_type, notes, added_by, created_at | None (no RLS enabled) |
| `api_access_logs` | 009 | id, ip, user_agent, endpoint, method, status_code, duration_ms, analysis_id, created_at | None |
| `search_quality_logs` | 014 | id, analysis_id, item_id, query_*, result_count, top_score, avg_score, score_breakdown (JSONB), is_empty, created_at | None |

**New tables needed (v6-EVAL):**

| Table | Columns | Why |
|-------|---------|-----|
| `eval_golden_queries` | id (uuid), instagram_url (text, nullable), query_signature (text), intent_note (text), created_by (text), created_at (timestamptz), algorithm_version (text: v4\|v6) | Single source of truth for 30 golden queries. Query signature enables dedup; algorithm_version allows multiple runs on same query. |
| `eval_judgments` | id (uuid), golden_query_id (uuid FK), product_id (uuid FK), relevance_grade (int 0~3), labeler_id (text), labeled_at (timestamptz), algorithm_version (text: v4\|v6), notes (text, nullable) | Human labels: 0=irrelevant, 1=poor, 2=good, 3=excellent. algorithm_version enables per-version judgment tracking. |
| `eval_runs` | id (uuid), golden_query_id (uuid FK, nullable), algorithm_version (text: v4\|v6), ndcg_at_10 (numeric), precision_at_5 (numeric), query_count (int), judgment_count (int), computed_at (timestamptz), notes (text) | Aggregated metric snapshot. One row = one (algorithm_version, query set) pair. Enables frozen v4 baseline + future v6 comparison. |

---

## C. RLS pattern (canonical example)

**admin_profiles RLS (migration 023):**

```sql
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own admin_profile" ON admin_profiles;
CREATE POLICY "read own admin_profile"
ON admin_profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

**Pattern explanation:**
- Enable RLS on table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- Create POLICY for role-action combo (`ON tbl FOR SELECT TO authenticated USING (condition)`)
- Service role (used in API routes via supabase admin key) **bypasses RLS entirely** — so API routes need no changes. Middleware (createSupabaseServer in proxy.ts) uses anon key, so RLS gate applies.
- Search path lock (migration 024): SECURITY DEFINER functions must set `search_path = public, pg_temp` to prevent schema-injection attacks.

**Application to new eval tables (admin-only via admin_profiles JOIN):**
```sql
ALTER TABLE eval_golden_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin-only select" ON eval_golden_queries FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM admin_profiles WHERE user_id = auth.uid() AND status = 'approved'
));
-- (same pattern for eval_judgments, eval_runs)
```

---

## D. Search algorithm invocation interface

**Entry point:** `POST /api/search-products/route.ts` (~870 LOC). Single request → multiple queries + algorithm outputs ranked products.

**Input shape (SearchRequest type):**
```typescript
{
  queries: Array<{
    id: string
    category: string
    subcategory?: string
    fit?: string
    fabric?: string
    colorFamily?: string
    searchQuery: string
    searchQueryKo?: string
    season?: string
    pattern?: string
    lockedAttributes?: { subcategory?, colorFamily?, fit?, fabric? }
  }>
  gender?: string
  styleNode?: { primary: string; secondary?: string }
  moodTags?: string[]
  priceFilter?: { minPrice?: number; maxPrice?: number }
  styleTolerance?: number
  brandFilter?: string[]
  _logId?: string
  _includeScoring?: boolean   // ← KEY: enables _scoring field in response
}
```

**Output shape (FormattedProduct[]):**
```typescript
{
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: Array<{ field: string; value: string }>
  _scoring?: {   // ← present when _includeScoring: true
    subcategory: number
    subcategorySimilar: number
    nameMatch: number
    keywords: number
    fit: number
    fabric: number
    colorFamily: number
    colorAdjacent: number
    styleNode: number
    moodTags: number
    season: number
    pattern: number
    brandDna: number
    totalScore: number
  }
}
```

**Key v4 algorithm constants (search-products/route.ts:81-104):**
- TARGET_RESULTS: 7 (default output count before diversity capping)
- MAX_PER_BRAND: 2, MAX_PER_PLATFORM: 3 (diversity caps)
- WEIGHTS: 10-dimensional scoring (subcategory 0.25, colorFamily 0.20, styleNode 0.30+0.15, fit/fabric/season/pattern each 0.15, brandDna 0.20, etc.)

**How to invoke v4 programmatically from eval workflow:**
1. Build SearchRequest with single query (golden set query details: category, subcategory, style node, etc.)
2. POST to `/api/search-products` with `_includeScoring: true`
3. Parse response: grab top-10 products, extract `_scoring.totalScore` per product
4. For NDCG calculation: map relevance_grade (0~3) to product_id ranking, compute discount cumulative gain

**Important:** v4 uses INNER JOIN to `product_ai_analysis` — products without AI analysis row are invisible. Known issue for v5 transition (35k overseas products invisible today).

---

## E. Test setup and characterization patterns

**Test config (vitest.config.ts):**
- Environment: jsdom (React component testing)
- Globals: false (explicit imports required)
- Include: `src/**/*.test.{ts,tsx}`, `tests/**/*.test.{ts,tsx}`
- Exclude: node_modules, .next, dist
- Alias: `@` → `./src`

**Existing characterization tests:**
- `src/lib/search/locked-filter.test.ts` (60 LOC): Unit tests for `passesLockedFilter()` + `toleranceToTargetCount()`. Vitest describe/it/expect. Tests camelCase-to-snake_case key mapping, null/undefined edge cases.
- `src/lib/instagram/parse-post-url.test.ts`: Similar pattern.

**Supabase mock/stub strategy:**
- No mocks found — tests appear to be pure function unit tests (no DB calls).
- DDD mode: characterization tests should capture current `passesLockedFilter()`, `toleranceToTargetCount()` behavior. New metric calc functions (NDCG, Precision) follow same pattern (pure functions, no DB).
- RLS integration tests would need Supabase test client or manual Docker Postgres setup — likely out of scope for v1.

---

## F. Reference patterns (reuse opportunities)

**Admin module layout pattern:**
- Layout (`src/app/admin/layout.tsx`): getAdminStatus() cache → if approved, render Sidebar + Header + main. Else render minimal ThemeProvider div for login/pending.
- Main content slot: `overflow-y-auto p-4 pb-20 md:pb-4`

**Admin data-fetching pattern:**
- Server-side: `requireApprovedAdmin()` guard → check NextResponse, extract user
- Client-side: fetch() calls to `/api/admin/*` routes, error handling via toast
- Example: page.tsx — fetchData callback with URLSearchParams, re-fetch on filter/page change

**shadcn/ui components already in use:**
- Button, Checkbox, Dialog, DialogContent/Header/Footer/Title/Description
- Badge (for test_type display)
- Loader2, ChevronLeft/Right, ChevronDown icons (lucide-react)
- Card (in eval-metrics)
- Table (likely)

**Metric display pattern (EvalMetrics, 60 LOC):**
- Grid of 4 cards (total, reviewed, pending, pass-rate)
- Icon + value + label, accent styling for key metrics
- 2-col mobile, 4-col desktop, tabular-nums for alignment

---

## G. Risks and constraints discovered

**Vision API cost trap:**
Risk: golden set 30 queries × labeling iterations = repeated Vision calls per IG URL.
- Mitigation: Vision results frozen at golden_query creation. Cache by IG URL (not in this SPEC scope, but document in architecture).

**RLS pitfall:**
New eval_* tables must enforce admin-only access via RLS + admin_profiles.status='approved' join. Existing eval_reviews/eval_golden_set have **no RLS enabled** (acceptable because they reference internal analyses table). New `eval_golden_queries`/`eval_judgments`/`eval_runs` are golden truth — MUST have RLS to prevent anon key access.
- Mitigation: Apply RLS to all three new tables at creation time. Test via anon-key client to verify deny.

**v5 AI server dependency:**
Brief mentions "v5 풀배치 미실행". Today v4 is stable and callable. Future v6 may need to call /recommend RPC instead.
- Mitigation: Metric calculation code accepts `algorithm_version` parameter (v4 or v6) and routes to appropriate endpoint. Endpoint signature identical (POST /api/search-products), behavior differs.

**Token/cost for v1 size:**
30 queries × ~10 results = ~300 judgments. Vision API once per golden_query creation: ~30 × $0.01 ≈ $0.30. Negligible if architecture prevents repeat calls.

---

## H. Recommended Implementation Approach

Given the existing eval_reviews + eval_golden_set baseline, the cleanest v1 approach is:

1. **Create three new tables** (eval_golden_queries, eval_judgments, eval_runs) with RLS + FK constraints to analyses/products
2. **Apply DDD ANALYZE-PRESERVE-IMPROVE** to existing page.tsx/components — characterization tests capture current queue/golden tabs behavior, then minimal UI refactoring to add "30 query golden set" + "run v4 algorithm" + "labeling grid" views
3. **Build metric calculation** as pure TypeScript functions (NDCG@10, Precision@5) + SQL views for aggregation (eval_runs snapshot)
4. **Integrate search-products endpoint** call via new `/api/admin/eval/run` route that takes golden_query_id + algorithm_version, calls search-products, stores results in eval_judgments rows, triggers metric compute

**Two critical architecture decisions manager-spec must lock:**

1. **Query identity model:** instagram_url (enables dedup, ties to IG) vs query_signature (platform-agnostic, requires hashing). Recommend: both columns, unique constraint on (instagram_url OR query_signature) pair.
2. **Judgment grade scale:** v1 uses relevance_grade 0~3 only. Existing eval_reviews.verdict (pass/fail/partial) is legacy — not used for v6-EVAL metrics. Document this separation; no schema migration needed for legacy table.

---

> 자세히: brief.md, docs/features/search-engine.md (v4 algorithm spec), docs/infra/data-model.md (full schema)
