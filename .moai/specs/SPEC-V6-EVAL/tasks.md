## Task Decomposition

SPEC: SPEC-V6-EVAL
Methodology: DDD (with TDD for pure functions per Brownfield Enhancement rule)
Total tasks: 16
Phase 1.5 generated: 2026-05-04 (manager-strategy output, user-approved at Decision Point 1)

## Frozen Decisions (Open Questions Recommended Values — user-approved at Decision Point 1)

| # | Decision | Value | Affects |
|---|---|---|---|
| 1 | T-001 migration seed data | empty table (no seed) — admin manual entry | T-001, T-009 |
| 2 | T-010 search-products call test strategy | mock fetch (vitest mock) | T-010 |
| 3 | gh issue reference | 0 (none, experiment branch) | T-016 commits |
| 4 | T-011 PATCH labeled_at policy | always update (no conditional) | T-011 |
| 5 | T-016 docs sync timing | separate /moai sync invocation | T-016, sync workflow |

## Tasks

| Task ID | Description | Requirement | Dependencies | Planned Files | Status |
|---|---|---|---|---|---|
| T-001 | DB migration 033: 3 신규 테이블 (eval_golden_queries, eval_judgments, eval_runs) + RLS (admin_profiles JOIN pattern from migration 023) + dual identity unique constraint + frozen baseline trigger | REQ-001, REQ-003, REQ-004, REQ-005 | - | supabase/migrations/033_eval_v6_tables.sql | **completed** (2026-05-04, 153 LOC) |
| T-002 | RLS integration test: anon-key + non-approved authenticated 2 시나리오 (SELECT/INSERT deny via PGRST error or empty result) | REQ-005 | T-001 | tests/integration/eval-rls.test.ts | **completed** (2026-05-04, 109 LOC, vitest exit 0) |
| T-003 | Characterization test: 기존 "평가 대기열" 탭 동작 박제 (PRESERVE — DDD baseline) | preserve baseline | - | src/app/admin/eval/__characterization__/queue.test.tsx | **completed** (2026-05-04, 222 LOC, 6 tests) |
| T-004 | Characterization test: 기존 "골든셋" 탭 동작 박제 (PRESERVE) | preserve baseline | - | src/app/admin/eval/__characterization__/golden.test.tsx | **completed** (2026-05-04, 219 LOC, 5 tests) |
| T-005 | TDD: computeNdcg pure function (RED-GREEN-REFACTOR) + 단위 테스트 (NDCG@10 정확도 fixture 기반) | REQ-003 | - | src/lib/eval/ndcg.ts + ndcg.test.ts | **completed** (2026-05-04, 39+80 LOC, 16 tests) |
| T-006 | TDD: computePrecisionAtK pure function + 단위 테스트 | REQ-003 | - | src/lib/eval/precision.ts + precision.test.ts | **completed** (2026-05-04, 41+68 LOC, 15 tests) |
| T-007 | DDD: judgment-store.ts (upsert/load helpers + routeAlgorithmVersion v6 throw) + 단위 테스트 | REQ-002, REQ-003 | T-001, T-005 | src/lib/eval/judgment-store.ts + judgment-store.test.ts | pending |
| T-008 | DDD: run-snapshot.ts orchestrator (judgment-store + ndcg/precision + eval_runs insert) | REQ-003 | T-005, T-006, T-007 | src/lib/eval/run-snapshot.ts | pending |
| T-009 | API route: golden-queries GET/POST/PATCH/DELETE + dual identity 409 + 라우트 테스트 | REQ-001 | T-001 | src/app/api/admin/eval/golden-queries/route.ts + route.test.ts | pending |
| T-010 | API route: run POST → search-products 내부 호출 (mock fetch in tests) + judgments upsert + 라우트 테스트 | REQ-002 | T-001, T-007 | src/app/api/admin/eval/run/route.ts + route.test.ts | pending |
| T-011 | API route: judgments/[id] PATCH (relevance_grade 0~3 + always-update labeled_at) + 라우트 테스트 (CHECK 위반 400, 404, RLS deny) | REQ-002 | T-001 | src/app/api/admin/eval/judgments/[id]/route.ts + route.test.ts | pending |
| T-012 | API route: compute POST (judgment 완전성 체크 + run-snapshot 호출) + 라우트 테스트 | REQ-003 | T-008 | src/app/api/admin/eval/compute/route.ts + route.test.ts | pending |
| T-013 | API route: freeze-baseline POST (v4 only, 409 on duplicate frozen v4 row) + 라우트 테스트 | REQ-004 | T-001, T-012 | src/app/api/admin/eval/freeze-baseline/route.ts + route.test.ts | pending |
| T-014 | UI 컴포넌트 3개: eval-golden-queries.tsx (CRUD) + eval-labeling-form.tsx (top-10 + 0~3 grade) + eval-runs-dashboard.tsx (algorithm_version 별 metric 표시 + frozen 표기) | REQ-001, REQ-002, REQ-003, REQ-004 | T-009, T-010, T-011, T-012, T-013 | src/components/admin/eval-*.tsx (3 files) | pending |
| T-015 | page.tsx 수정: 기존 두 탭 PRESERVE + 신규 3 탭 통합. characterization tests (T-003, T-004) 재실행으로 회귀 0 검증 | REQ-001, REQ-002, REQ-003, REQ-004 | T-003, T-004, T-014 | src/app/admin/eval/page.tsx | pending |
| T-016 | Phase F docs 3종 동기화 (별도 /moai sync 단계에서 수행): docs/features/search-engine.md "Evaluation Infrastructure" 섹션, docs/ARCHITECTURE.md eval_* 토폴로지, docs/infra/data-model.md 3 신규 테이블 스키마 | sync phase | T-001~T-015 | 3 doc files | pending |

## Order Safety (DDD principle)

1. Foundation (T-001 → T-002): RLS 누락 시 모든 후속 차단
2. Preservation (T-003, T-004 parallel): IMPROVE 전 기존 동작 박제
3. Pure functions (T-005, T-006 parallel): 외부 의존성 0, TDD RED-GREEN
4. Lib orchestrators (T-007 → T-008)
5. API routes (T-009-T-013 mostly parallel, T-012 만 T-008 의존)
6. UI (T-014 → T-015)
7. Docs (T-016 — separate /moai sync invocation)

## Success Criteria (priority labels)

- [Priority High] 14 acceptance scenarios 전부 11 test files 자동 검증
- [Priority High] 85%+ coverage on src/lib/eval/* AND src/app/api/admin/eval/* AND src/components/admin/eval-*.tsx
- [Priority High] T-002 RLS integration test CI 게이트 통과
- [Priority High] migration 033 적용 후 pnpm build 성공
- [Priority Medium] characterization tests (T-003, T-004) 통과 — 기존 두 탭 회귀 0
- [Priority Medium] MX 태그: NOTE×3 (ndcg, precision, migration), WARN×1 (run route), TODO×1 (judgment-store v6)
- [Priority Medium] TRUST 5 게이트 5 차원 통과
- [Priority Low] docs 3종 동기화 (T-016, /moai sync 단계)
