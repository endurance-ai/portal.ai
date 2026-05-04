# SPEC-V6-EVAL Plan Audit — Iteration 1

Audited: 2026-05-04
Auditor: plan-auditor (fresh context, no author reasoning per M1 Context Isolation)
Files audited: spec.md, plan.md, acceptance.md, spec-compact.md
Reasoning context (brief.md, research.md, MCP server instructions, workflow rule files) ignored per M1.

## Verdict: FAIL

## Defects Found

### Defect 1: EARS form mismatch — REQ-V6-EVAL-003 label vs syntax
- Location: spec.md:L46–55, spec-compact.md:L28–36
- Issue: Labeled "(State-driven)". Audit prompt's State-driven canonical form is `WHERE/SHALL`. The body uses `WHILE ... 상태에서, 사용자가 ... 트리거하면, 시스템 SHALL`. WHILE belongs to Ubiquitous per the prompt's mapping; the construction is a hybrid State+Event ("WHILE state ... WHEN trigger ... SHALL"). Either the label is wrong or the EARS keyword is wrong; both cannot be right under the contracted vocabulary.
- Severity: blocker
- Suggested fix: Either (a) rewrite as pure Event-driven `WHEN ((golden_query_id, algorithm_version) judgments are all NOT NULL AND user triggers "Compute Run"), the system SHALL ...`, or (b) keep two-clause structure but change label to `(Event-driven w/ pre-state)` and document the deviation in HISTORY.

### Defect 2: EARS form mismatch — REQ-V6-EVAL-004 label vs syntax + verb
- Location: spec.md:L57–61, spec-compact.md:L38–40
- Issue: Labeled "(Optional)". Audit prompt's Optional canonical form is `WHILE/MAY`. The body uses `WHERE ... 시점에, 시스템 SHALL`. WHERE belongs to a different bucket per the prompt's mapping, and the verb is `SHALL` rather than `MAY` — Optional semantics imply discretion ("the system MAY provide a Freeze action when feature exists"), but this REQ is unconditional once the temporal condition is met. The temporal trigger ("v4 30 쿼리 전체에 대한 라벨링 + 메트릭 계산을 완료한 시점") is event-driven, not feature-existence.
- Severity: blocker
- Suggested fix: Reclassify as Event-driven and rewrite: `WHEN a user has completed labeling and metric computation for all 30 v4 golden queries, the system SHALL expose a "Freeze Baseline" action that sets eval_runs.frozen=true and rejects subsequent (algorithm_version='v4', golden_query_id IS NULL) inserts.` Update label to `(Event-driven)`.

### Defect 3: Cross-document API contract gap — PATCH endpoint undefined
- Location: acceptance.md:L57 ("PATCH /api/admin/eval/run 또는 동등 엔드포인트") vs spec.md:L106–107 (only POST documented for `src/app/api/admin/eval/run/route.ts`) vs plan.md:D2 (only POST contract specified)
- Issue: Acceptance Scenario 2.2 requires a PATCH (or equivalent) endpoint to update a single judgment's `relevance_grade` and `labeled_at`. spec.md and plan.md document NO such endpoint. The phrase "또는 동등 엔드포인트" (or an equivalent endpoint) defers the endpoint contract to the implementer — implementation will diverge from acceptance because the contract is undefined. There is no `src/app/api/admin/eval/judgments/route.ts` listed in affected files either.
- Severity: blocker
- Suggested fix: (a) Add explicit endpoint to spec.md Affected Files (e.g., `PATCH src/app/api/admin/eval/judgments/[id]/route.ts` or `PATCH src/app/api/admin/eval/run/route.ts`), (b) update REQ-002 step 3 to specify the HTTP verb + path, (c) remove "또는 동등 엔드포인트" from acceptance.md to make the contract binary-testable.

### Defect 4: MX:ANCHOR fan_in claim unverifiable
- Location: spec.md:L144–145
- Issue: `@MX:ANCHOR` rule (per moai-constitution.md) requires fan_in ≥ 3. The plan claims `src/lib/eval/ndcg.ts:computeNdcg` will reach fan_in ≥ 3 via "compute API route + characterization test + run-snapshot orchestrator". But (1) the compute API route calls `run-snapshot` (D3 plan), not `ndcg` directly — so it's a transitive caller, not a direct one; (2) the listed characterization tests (`queue.test.tsx`, `golden.test.tsx`) target the legacy queue and golden-set tabs, NOT `computeNdcg`; the actual ndcg test is `ndcg.test.ts`, a unit test. Direct callers reduce to 1 (run-snapshot) + 1 unit test. fan_in < 3. Same logic for `precision.ts`.
- Severity: major
- Suggested fix: Either (a) downgrade tag to `@MX:NOTE` for both pure functions, or (b) restructure so compute route calls `computeNdcg` directly (skipping run-snapshot wrapper) plus an additional caller (e.g., a CLI script under `scripts/`) to legitimately reach fan_in ≥ 3, then document the three direct call sites in MX Tag Plan.

### Defect 5: Test coverage plan does not match acceptance scenarios
- Location: spec.md:L128–134, acceptance.md:L142
- Issue: 5 test files planned, but they cover only 2 of 4 new API routes (run only) and 0 of 3 new components. Acceptance scenarios that lack a corresponding test artifact:
  - Scenario 1.2 / 1.3 → no `golden-queries/route.test.ts`
  - Scenario 3.3 / 3.4 → no `compute/route.test.ts`
  - Scenario 4.1 / 4.2 → no `freeze-baseline/route.test.ts`
  - Scenario 1.1 / 2.1 / 2.2 → no component tests for `eval-golden-queries.tsx`, `eval-labeling-form.tsx`, `eval-runs-dashboard.tsx`
  - Scenario 5.1 / 5.2 → no automated RLS test file (Quality Gate L146 says "(수동) anon-key SELECT 수동 검증" — manual, not automated)
- Quality Gate L142 ("신규 5 테스트 파일 모두 통과") explicitly caps test coverage at 5 files. With 8 testable units (4 routes + 4 lib files) plus 3 components plus RLS gate, planned coverage is structurally insufficient to satisfy MoAI Constitution's "85%+ coverage" requirement.
- Severity: major
- Suggested fix: Add 5 more test files: `golden-queries/route.test.ts`, `compute/route.test.ts`, `freeze-baseline/route.test.ts`, `judgment-store.test.ts`, and an integration test (`tests/integration/eval-rls.test.ts`) that boots a Supabase test client with anon-key. Update Quality Gate to "신규 10 테스트 파일".

### Defect 6: REQ-005 (RLS) lacks an executable verification task in plan.md
- Location: plan.md Phase A–F (no RLS test task), Risk Mitigation L100 ("(수동) anon-key Supabase client 로 ... (자동) integration test 또는 migration assertion")
- Issue: REQ-005 has 2 acceptance scenarios but plan.md task decomposition (A1–F3) lists no concrete task to write or run an RLS verification test. Risk Mitigation table mentions automated integration test as one option but does not assign it a phase, owner, or task ID. Implementation will likely ship without REQ-005 being tested in CI.
- Severity: major
- Suggested fix: Add a task `C6. (High) tests/integration/eval-rls.test.ts — anon-key Supabase client SELECT/INSERT against eval_golden_queries / eval_judgments / eval_runs; assert empty result set or PGRST error.` Insert before Phase D in the ordering summary.

### Defect 7: Emoji in acceptance document
- Location: acceptance.md:L110 ("🔒 BASELINE")
- Issue: `.claude/rules/moai/development/coding-standards.md` "Content Restrictions" forbids emoji characters in instruction documents. SPEC artifacts (`spec.md`, `acceptance.md`, `plan.md`, `spec-compact.md`) are instruction documents per the same rule's enumeration of governed file types.
- Severity: minor
- Suggested fix: Replace "🔒 BASELINE" with `[BASELINE]` or `BASELINE (locked)` text-only badge specification.

### Defect 8: Acceptance scenario count discrepancy
- Location: acceptance.md:L9 ("총 11 시나리오"), spec.md:L74–77 (per-REQ minimum coverage)
- Issue: acceptance.md header asserts 11 scenarios; actual count is 14 (3 + 3 + 4 + 2 + 2). Furthermore, spec.md's "최소 커버리지" enumerates 1+1=2 for REQ-002 but acceptance.md provides 3, and 1 for REQ-004/REQ-005 but acceptance.md provides 2 each. Three independent count statements disagree.
- Severity: minor
- Suggested fix: Align all three: change acceptance.md L9 to "총 14 시나리오"; update spec.md L75–77 to "REQ-002: 3건 / REQ-003: 4건 / REQ-004: 2건 / REQ-005: 2건". Otherwise reviewers cannot trust the document's own self-description.

### Defect 9: REQ-005 verb deviation from prompt-stated EARS form
- Location: spec.md:L65, spec-compact.md:L44
- Issue: Audit prompt states Unwanted form is `IF/THEN/SHALL NOT`. REQ-005 uses `IF ... THEN 시스템 SHALL ... 거부` (positive SHALL + negative verb "거부") rather than `SHALL NOT`. Semantically equivalent but lexically off-pattern. A pedantic linter or downstream tooling that pattern-matches "SHALL NOT" will miss this REQ.
- Severity: minor
- Suggested fix: Rewrite as `THEN 시스템 SHALL NOT 해당 작업을 허용한다 (RLS deny via empty result set or PGRST error)` to match the canonical pattern.

## Strengths

- spec-compact.md is genuinely compact: contains only REQ + acceptance + files + exclusions with no overview prose leakage. Cross-document consistency for top-level structure is solid.
- Exclusions section (spec.md:L81–89) is specific and references successor SPEC IDs (V6-CORE, V6-EVAL-V2, V6-AUTOMATION) — concrete delegation rather than vague "out of scope".
- Frontmatter in spec.md has all 8 required fields (id, version, status, created, updated, author, priority, issue_number) with valid types.

## Verdict Rationale

FAIL. Three blocker defects: (1, 2) two REQs use EARS keywords inconsistent with their declared category under the prompt's contracted vocabulary, making the form-classification unreliable for downstream validators; (3) acceptance Scenario 2.2 requires a PATCH endpoint that is not documented in spec.md affected files or plan.md task list, leaving the API contract undefined. Any of the three is sufficient to fail; together they indicate the SPEC was not cross-checked between spec.md and acceptance.md before submission. Major defects 4–6 (MX fan_in overclaim, missing API/component/RLS tests, no RLS verification task) reinforce that the implementation plan as written cannot satisfy the MoAI Constitution's TRUST-T (Tested ≥ 85% coverage) and MX-tag rules.
