# SPEC-V6-EVAL Plan Audit — Iteration 2

Audited: 2026-05-04
Auditor: plan-auditor (fresh context per M1)
Compared against: review-1.md
Reasoning context (MCP server instructions, workflow rule files injected via system reminders, brief.md, research.md) ignored per M1 Context Isolation. Audit performed against spec.md / plan.md / acceptance.md / spec-compact.md only.

## Verdict: FAIL

## Iteration-1 Defect Resolution

| # | Defect | Status |
|---|--------|--------|
| 1 | REQ-V6-EVAL-003 EARS form mismatch (label vs syntax) | FIXED |
| 2 | REQ-V6-EVAL-004 EARS form mismatch (label + verb) | FIXED |
| 3 | PATCH endpoint undefined (cross-doc API contract gap) | FIXED |
| 4 | MX:ANCHOR fan_in claim unverifiable for ndcg/precision | FIXED |
| 5 | Test coverage plan does not match acceptance scenarios | PARTIAL |
| 6 | REQ-005 RLS lacks executable verification task in plan.md | FIXED |
| 7 | Emoji in acceptance document | FIXED |
| 8 | Acceptance scenario count discrepancy (3 statements disagree) | FIXED |
| 9 | REQ-005 verb deviation from canonical SHALL NOT pattern | FIXED |

### Per-defect evidence

**D1 — FIXED.** spec.md L36 now reads `REQ-V6-EVAL-002 (Event-driven)` and L47 `REQ-V6-EVAL-003 (Event-driven)` with body `WHEN ... 시스템 SHALL`. spec-compact.md L28 mirrors. Hybrid `WHILE...WHEN` removed; canonical Event-driven form applied.

**D2 — FIXED.** spec.md L58 now `REQ-V6-EVAL-004 (Event-driven)` with `WHEN 사용자가 v4 알고리즘 30 골든셋 쿼리 전체에 대한 라벨링과 메트릭 계산을 완료한 시점에, 시스템 SHALL`. spec-compact.md L38 mirrors. Optional/WHERE/MAY mismatch eliminated; verb is `SHALL` aligned with Event-driven canonical form.

**D3 — FIXED.** spec.md L42 (REQ-002 step 3) explicitly names `PATCH /api/admin/eval/judgments/{id}`. spec.md L110–112 adds `[NEW] src/app/api/admin/eval/judgments/[id]/` to Affected Files with PATCH semantics + `requireApprovedAdmin()` guard. plan.md D3 (L75) specifies the full contract (PATCH, 0~3 grade, CHECK→400, 404 on missing). acceptance.md L57 / L64 reference the explicit endpoint; spec-compact.md L23 / L94 match. The phrase "또는 동등 엔드포인트" is gone.

**D4 — FIXED.** spec.md L154–155 downgrades both `ndcg.ts:computeNdcg` and `precision.ts:computePrecisionAtK` to `@MX:NOTE` with explicit rationale "직접 caller 는 run-snapshot orchestrator 단일. fan_in < 3 이므로 ANCHOR 자격 미달". Rule conformance restored.

**D5 — PARTIAL.** Five new test files added per the iter-1 suggested fix list (`golden-queries/route.test.ts`, `compute/route.test.ts`, `freeze-baseline/route.test.ts`, `judgment-store.test.ts`, `tests/integration/eval-rls.test.ts`); acceptance.md L143 updated to "신규 10 테스트 파일". However, the iter-1 defect body also enumerated component tests for `eval-golden-queries.tsx`, `eval-labeling-form.tsx`, `eval-runs-dashboard.tsx` as missing — these remain absent. acceptance.md Scenarios 1.1 (table render + edit/delete buttons), 2.1 (10-card grid + 0~3 selectors), 2.2 (visual badge after grade selection), 4.1 (frozen badge + button disappearance) describe UI behaviors with no corresponding test artifact. The Quality Gate L143 narrows the 85% coverage scope to `src/lib/eval/*` and `src/app/api/admin/eval/*` only — explicitly excluding the 3 new components. This is a deliberate scope choice but leaves the documented UI acceptance scenarios untested.

**D6 — FIXED.** plan.md L67 adds `C6. (High) tests/integration/eval-rls.test.ts — anon-key Supabase client to ... PGRST 에러 또는 빈 result set 검증. CI 파이프라인에 포함 (REQ-005 의 자동 verification gate).` Phase Ordering Summary L127 includes C6 in sequence. Risk Mitigation table L107 marks the verification as `(자동) C6 task`. Manual-only verification removed.

**D7 — FIXED.** acceptance.md L111 now reads `[BASELINE (locked)]`; the 🔒 emoji is gone. spec-compact.md L69 also uses `[BASELINE (locked)]`.

**D8 — FIXED.** acceptance.md L9 = "총 14 시나리오". Counted scenarios: REQ-001 = 3 (1.1/1.2/1.3), REQ-002 = 3 (2.1/2.2/2.3), REQ-003 = 4 (3.1/3.2/3.3/3.4), REQ-004 = 2 (4.1/4.2), REQ-005 = 2 (5.1/5.2) → 14. spec.md L74–78 updated to match (3/3/4/2/2). spec-compact.md L50 also "총 14 시나리오". All three counts converge.

**D9 — FIXED.** spec.md L66 / spec-compact.md L44 now use `THEN 시스템 SHALL NOT 해당 작업을 허용한다 (RLS deny via empty result set or PGRST error)`. Canonical `IF/THEN/SHALL NOT` pattern restored for pattern-matching tooling.

## New Defects Introduced

### N1 (Blocker) — PATCH `/api/admin/eval/judgments/[id]` route has no route test file

The D3 fix added a brand-new endpoint covering Scenarios 2.2 (happy-path label save) and 2.3 (CHECK violation → 400). spec.md L133–144 lists 10 test files, but `src/app/api/admin/eval/judgments/[id]/route.test.ts` is not among them. plan.md D6 (L78–83) enumerates 5 test files for "5 라우트" but only covers 4 routes (run, golden-queries, compute, freeze-baseline) plus `judgment-store.test.ts` (a lib helper test, not the route). `judgment-store.test.ts` per spec.md L137 covers `upsertJudgments`, `loadJudgmentsForQuery`, `routeAlgorithmVersion('v6') throw` — none of which exercise the PATCH route handler, the CHECK-violation 400 path, the 404 path, or the `requireApprovedAdmin()` guard for that route. Result: Scenarios 2.2 and 2.3 (REQ-002's two of three acceptance scenarios) lack any automated route-level coverage. Severity: blocker — directly contradicts Quality Gate L143 ("85%+ coverage on ... `src/app/api/admin/eval/*`"), since one of the five api/admin/eval routes has zero test coverage.

Suggested fix: Add `src/app/api/admin/eval/judgments/[id]/route.test.ts` to spec.md L133–144 (covering: PATCH happy path with grade=3 → row updated; CHECK violation grade=5 → 400; missing id → 404; non-admin caller → 403/401). Update acceptance.md L143 to "신규 11 테스트 파일", update plan.md D6 with the additional file, update plan.md L121 estimated-scope test count from 10 to 11.

### N2 (Minor) — plan.md frontmatter version stale

plan.md L3 declares `version: 0.1.0` while spec.md (L3), acceptance.md (L3), spec-compact.md (L3) all advanced to `version: 0.1.1` after the iter-2 revisions. plan.md was substantively modified (added C6, expanded D6 to 5 files, added 10-test scope row in Estimated Scope) but its frontmatter was not bumped. Severity: minor — confuses downstream tooling that joins the four artifacts by version key.

Suggested fix: Bump plan.md L3 to `version: 0.1.1` and add a short HISTORY note inside plan.md (currently absent).

### N3 (Minor) — Component-test gap is now structurally locked

This is partially the residual of D5 (above) and partially a new framing concern: Quality Gate L143 in acceptance.md narrows the 85% coverage requirement to `src/lib/eval/*` and `src/app/api/admin/eval/*`, formally excluding the 3 new components. With this gate in place, the SPEC will pass /moai run even though Scenarios 1.1, 2.1, 2.2 (visual rendering portions), and 4.1 (badge/button visibility) have no automated test verifying UI behavior. Severity: minor — does not block this iteration's pass criteria but means acceptance scenarios 1.1, 2.1, 2.2, 4.1 are only verifiable via manual QA, which the SPEC nowhere documents.

Suggested fix: Either (a) explicitly add to Exclusions: "UI-render automated tests for new components — manual QA only, captured in /admin/eval QA checklist", or (b) add 3 component test files to bring the 3 new components under the coverage gate.

## Strengths

- Cross-document consistency for spec.md ↔ acceptance.md ↔ spec-compact.md is now solid: REQ labels, EARS keywords, scenario counts, and endpoint paths align on a line-by-line spot-check across all five REQs.
- Phase Ordering Summary in plan.md L127 explicitly threads C6 (RLS integration test) into the dependency graph (`C5 → C6 → D1..D6`), demonstrating the verification gate is not an afterthought.
- MX Tag Plan rationale (spec.md L154–158) now justifies each tag choice with concrete fan_in / caller-count reasoning rather than aspirational claims.
- Iteration 2 HISTORY entry (spec.md L16) is specific and traces each change to the audit defect numbers — good practice for downstream auditing.

## Verdict Rationale

FAIL. One blocker introduced by the D3 fix (N1: PATCH `/api/admin/eval/judgments/[id]` route added without a corresponding test file, leaving 1 of 5 api/eval routes uncovered and Scenarios 2.2/2.3 untested at the route level — directly contradicts the SPEC's own Quality Gate L143). Eight of nine iter-1 defects are FIXED; D5 is PARTIAL (suggested-fix items applied, broader UI-component coverage gap remains). One minor consistency issue (plan.md version not bumped). The iter-2 revision was substantively responsive but introduced a single, easily-missed coverage gap precisely at the seam where iter-1 D3 was patched.
