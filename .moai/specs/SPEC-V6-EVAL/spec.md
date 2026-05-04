---
id: SPEC-V6-EVAL
version: 0.1.2
status: draft
created: 2026-05-04
updated: 2026-05-04
author: MoAI orchestrator (manager-spec)
priority: high
issue_number: 0
---

# SPEC-V6-EVAL — Search Engine v6 평가 인프라

## HISTORY

- 2026-05-04 v0.1.2: Iteration 3 revisions per plan-audit-2 report. Added PATCH judgments route test (route.test.ts) — 11 test files total (was 10), expanded Quality Gate coverage scope to include `src/components/admin/eval-*.tsx`, plan.md version sync to 0.1.2.
- 2026-05-04 v0.1.1: Iteration 2 revisions per plan-audit-1 report. Fixed EARS form labels (REQ-003/004), added PATCH endpoint contract (REQ-002), expanded test plan (10 files), added C6 RLS integration test task, MX:ANCHOR→NOTE for pure metric functions, scenario count alignment, emoji removal, REQ-005 SHALL NOT canonical form.
- 2026-05-04 v0.1.0: Initial draft (Plan workflow Phase 2). brief.md 의 4개 frozen 결정과 research.md 의 H 섹션 두 아키텍처 결정(dual identity, 0~3 grade vs legacy verdict 분리)을 EARS 구조로 박제. 5 REQ 모듈로 압축 (golden CRUD / labeling / metric calc / baseline freeze / RLS guard).

## Overview

portal.ai 검색엔진 v6 작업의 선행 인프라. 30개 골든셋 쿼리에 대해 **NDCG@10 + Precision@5** 두 메트릭을 사람 라벨링 기반으로 산출하고, v4 알고리즘 baseline 점수를 frozen row 로 박제하여 차후 v6 변경 시 정량적 회귀/개선 비교를 가능하게 한다. 메트릭과 라벨링은 어드민 (`/admin/eval`) 내부 도구로 한정하며, 외부/anon 접근은 RLS 로 차단한다.

이번 SPEC 의 스코프 경계는 명확하다 — **측정 인프라만** 만든다. v5 임베딩 풀배치, rerank/fusion 가중치 변경, LLM-as-judge, 골든셋 100/300 확장, 프로덕션 자동 샘플링은 별도 SPEC (V6-CORE / V6-EVAL-V2 / V6-AUTOMATION) 으로 분리한다. 기존 `eval_reviews` / `eval_golden_set` 테이블 (legacy verdict pass/fail/partial) 은 건드리지 않고, 신규 3개 테이블 (`eval_golden_queries` / `eval_judgments` / `eval_runs`) 을 병렬 추가한다.

## Goals (EARS-format requirements)

### REQ-V6-EVAL-001 (Ubiquitous) — Golden Set Admin CRUD

WHILE 사용자가 `/admin/eval` 페이지의 "Golden Queries" 탭에 있고 `admin_profiles.status = 'approved'` 인 상태에서, 시스템 SHALL `eval_golden_queries` 테이블의 모든 row 를 페이지네이션으로 표시하고 (instagram_url, query_signature, intent_note, created_by, created_at), 신규 추가 / 편집 / 삭제 액션을 제공한다.

[HARD] golden_query 의 식별 모델은 dual identity:
- `instagram_url` (nullable text) — IG 포스트 기반 골든셋
- `query_signature` (text) — IG URL 이 없는 경우 정규화된 검색 쿼리 해시
- UNIQUE 제약: `(COALESCE(instagram_url, query_signature))` 단일 컬럼 unique constraint 또는 두 컬럼 조합 unique index. (research.md §H 결정 1)

### REQ-V6-EVAL-002 (Event-driven) — Algorithm Run Trigger + Judgment Persistence

WHEN 사용자가 "Labeling" 탭에서 특정 `golden_query_id` 와 `algorithm_version` (v4 또는 v6) 을 선택하고 "검색 실행" 버튼을 누르면, 시스템 SHALL:

1. `POST /api/admin/eval/run` 라우트 호출 → 서버가 내부적으로 `POST /api/search-products` 를 `_includeScoring: true` 옵션으로 호출 (golden_query 의 query_signature/instagram_url 에서 derive 한 SearchRequest body)
2. 응답의 top-10 `FormattedProduct[]` 를 받아 각 product 에 대해 `eval_judgments` 테이블에 row 를 upsert (golden_query_id, product_id, algorithm_version, labeler_id=current_admin_user, relevance_grade=NULL pending, labeled_at=NULL)
3. 사람이 각 product 카드에서 0~3 grade 를 입력하면 `PATCH /api/admin/eval/judgments/{id}` 가 호출되어 해당 row 의 `relevance_grade` 와 `labeled_at` 을 갱신한다
4. 모든 라벨링 완료 시 NDCG@10 / Precision@5 계산 트리거 가능 상태로 표시

[HARD] `relevance_grade` 는 0~3 정수 (0=irrelevant, 1=poor, 2=good, 3=excellent). 기존 `eval_reviews.verdict` (pass/fail/partial) 와는 **완전히 분리**된 스케일이며 마이그레이션/조인 없음. (research.md §H 결정 2)

### REQ-V6-EVAL-003 (Event-driven) — Metric Calculation and Snapshot

WHEN 특정 (golden_query_id, algorithm_version) 조합의 모든 top-10 judgment 의 `relevance_grade` 가 NOT NULL 이며 사용자가 "Compute Run" 액션을 트리거할 때, 시스템 SHALL:

1. `src/lib/eval/ndcg.ts` 의 `computeNdcg(judgments, k=10)` pure function 으로 NDCG@10 계산
2. `src/lib/eval/precision.ts` 의 `computePrecisionAtK(judgments, k=5, threshold=2)` pure function 으로 Precision@5 계산 (relevance_grade ≥ 2 = relevant)
3. 결과를 `eval_runs` 테이블에 새 row 로 insert (algorithm_version, ndcg_at_10, precision_at_5, query_count, judgment_count, computed_at, notes, frozen=false)
4. "Runs" 탭 대시보드에 algorithm_version 별로 두 메트릭을 표시 (frozen=true row 는 별도 배지로 강조)

집계 단위는 단일 query 단위 row 와 다중 query 평균 row 두 가지를 지원한다 (golden_query_id NULL = 전체 평균).

### REQ-V6-EVAL-004 (Event-driven) — v4 Baseline Freeze

WHEN 사용자가 v4 알고리즘 30 골든셋 쿼리 전체에 대한 라벨링과 메트릭 계산을 완료한 시점에, 시스템 SHALL "Freeze Baseline" 액션을 노출하여 해당 `eval_runs` row 의 `frozen` boolean 을 true 로 설정하고 이후 동일 (algorithm_version='v4', golden_query_id IS NULL) 조합의 신규 INSERT 를 거부한다.

baseline 박제는 1회성 게이트이며, 강제 해제는 SQL 직접 수정으로만 가능 (UI/API 노출 금지).

### REQ-V6-EVAL-005 (Unwanted) — RLS Deny for Non-Admin

IF 요청자가 `admin_profiles.status = 'approved'` 가 아닌 상태에서 `eval_golden_queries`, `eval_judgments`, `eval_runs` 세 테이블 중 하나라도 anon-key 또는 일반 authenticated user key 로 SELECT / INSERT / UPDATE / DELETE 를 시도하면, THEN 시스템 SHALL NOT 해당 작업을 허용한다 (RLS deny via empty result set or PGRST error).

[HARD] 신규 3개 테이블 모두에 RLS 활성화 + admin_profiles JOIN 정책 필수. service role (API route 서버 사이드) 은 RLS bypass — `requireApprovedAdmin()` 가드가 1차 방어, RLS 가 심층 방어.

## Acceptance Criteria

상세 Given/When/Then 시나리오는 `acceptance.md` 참고. 최소 커버리지:

- REQ-001: 3건 (Golden CRUD happy path 2 + dual identity unique 위반 1)
- REQ-002: 3건 (POST /api/admin/eval/run 호출 1 + PATCH /api/admin/eval/judgments/{id} 라벨 저장 1 + CHECK 위반 거부 1)
- REQ-003: 4건 (NDCG fixture 정확도 1 + Precision fixture 정확도 1 + Compute Run row 생성 1 + algorithm_version 분리 1)
- REQ-004: 2건 (baseline freeze 후 재 INSERT 차단 1 + v6 freeze 거부 1)
- REQ-005: 2건 (anon-key SELECT deny 1 + 비-approved authenticated INSERT deny 1)

총 14 시나리오.

## What NOT to Build (Exclusions)

- LLM-as-judge 자동 채점 → SPEC-V6-EVAL-V2 또는 V6-AUTOMATION
- v5 임베딩 풀배치 실행 → SPEC-V6-CORE
- 검색 알고리즘 변경 (rerank, fusion 가중치 등) → SPEC-V6-CORE
- 골든셋 100/300 확장 → V6-EVAL-V2
- 프로덕션 IG URL 자동 샘플링 → V6-AUTOMATION
- A/B 좌우 비교 UI → 별도 SPEC
- Vision API 재호출 캐싱 인프라 → 아키텍처 결정 필요, 별도 SPEC (golden_query 생성 시점 1회 호출은 OK, 라벨링 중 재호출 금지)

## Affected Files

### [DELTA] src/app/admin/eval/

- [EXISTING] `page.tsx` (239 LOC) — characterization tests 먼저 (현재 "평가 대기열" + "골든셋" 두 탭 동작 박제)
- [MODIFY] `page.tsx` — "Golden Queries" + "Labeling" + "Runs" 세 탭 추가 (기존 두 탭은 PRESERVE, 새 탭 IMPROVE)
- [NEW] `src/components/admin/eval-golden-queries.tsx` — 30 쿼리 목록 + 추가/편집/삭제 다이얼로그
- [NEW] `src/components/admin/eval-labeling-form.tsx` — 쿼리당 top-10 결과 그리드 + 0~3 grade selector
- [NEW] `src/components/admin/eval-runs-dashboard.tsx` — algorithm_version 별 NDCG/Precision 표 + frozen 배지

### [NEW] src/app/api/admin/eval/golden-queries/

- `route.ts` — GET (목록) / POST (신규) / PATCH (편집) / DELETE (삭제), `requireApprovedAdmin()` 가드

### [NEW] src/app/api/admin/eval/run/

- `route.ts` — POST `{ golden_query_id, algorithm_version }` → `/api/search-products` 내부 호출 → `eval_judgments` upsert

### [NEW] src/app/api/admin/eval/judgments/[id]/

- `route.ts` — PATCH `{ relevance_grade }` → 단일 `eval_judgments` row 의 `relevance_grade` (0~3 CHECK) + `labeled_at=now()` 갱신, `requireApprovedAdmin()` 가드

### [NEW] src/app/api/admin/eval/compute/

- `route.ts` — POST `{ golden_query_id?, algorithm_version }` → `eval_judgments` 조회 → NDCG/Precision 계산 → `eval_runs` insert

### [NEW] src/app/api/admin/eval/freeze-baseline/

- `route.ts` — POST `{ run_id }` → `eval_runs.frozen = true` (algorithm_version='v4' 만 허용)

### [NEW] src/lib/eval/

- `ndcg.ts` — `computeNdcg(judgments: Array<{ rank: number; relevance_grade: number }>, k: number): number` pure function
- `precision.ts` — `computePrecisionAtK(judgments, k, threshold): number` pure function
- `judgment-store.ts` — `upsertJudgments()`, `loadJudgmentsForQuery()` Supabase helpers
- `run-snapshot.ts` — `computeAndStoreRun()` orchestrator (lib/eval 의 메트릭 함수 호출 + eval_runs insert)

### [NEW] supabase/migrations/

- `033_eval_v6_tables.sql` — 3 테이블 생성 (`eval_golden_queries`, `eval_judgments`, `eval_runs`) + RLS 활성화 + admin_profiles JOIN 정책 + FK 제약 (eval_judgments.product_id → products.id, eval_judgments.golden_query_id → eval_golden_queries.id) + dual identity unique constraint

### [NEW] tests/

- `src/lib/eval/ndcg.test.ts` — 알려진 fixture 4-6개 (NDCG=1.0 perfect / NDCG=0 worst / NDCG 부분 점수)
- `src/lib/eval/precision.test.ts` — Precision@5 fixture (5/5, 3/5, 0/5, threshold 경계)
- `src/lib/eval/judgment-store.test.ts` — `upsertJudgments`, `loadJudgmentsForQuery`, `routeAlgorithmVersion('v6')` throw 검증 (Supabase client mock)
- `src/app/admin/eval/__characterization__/queue.test.tsx` — DDD: 현재 "평가 대기열" 탭 렌더링 / fetch / 필터 동작 박제
- `src/app/admin/eval/__characterization__/golden.test.tsx` — DDD: 현재 "골든셋" 탭 동작 박제
- `src/app/api/admin/eval/run/route.test.ts` — POST 라우트 happy path + 비-admin 거부
- `src/app/api/admin/eval/golden-queries/route.test.ts` — GET/POST/PATCH/DELETE 각 happy path + dual identity 충돌 (409) + 비-admin 거부
- `src/app/api/admin/eval/judgments/[id]/route.test.ts` — PATCH happy path (relevance_grade 0~3 update + labeled_at refresh) + CHECK 위반 (relevance_grade < 0 or > 3) → 400 + missing id → 404 + non-admin (anon-key) → 403/RLS deny
- `src/app/api/admin/eval/compute/route.test.ts` — POST happy path (NDCG/Precision 계산 → eval_runs INSERT) + 미완성 judgment 시 거부 + 비-admin 거부
- `src/app/api/admin/eval/freeze-baseline/route.test.ts` — POST v4 row freeze 성공 + v6 거부 (400) + 이미 frozen baseline 존재 시 409 + 비-admin 거부
- `tests/integration/eval-rls.test.ts` — anon-key Supabase client 로 3 테이블 SELECT/INSERT 시도 → empty 결과셋 또는 PGRST 에러 검증 (REQ-005 자동 검증, CI 포함)

### [DELTA] docs/

- [MODIFY] `docs/features/search-engine.md` — "Evaluation Infrastructure (v6-EVAL)" 섹션 추가: 3 테이블 토폴로지, NDCG/Precision 산식, baseline freeze 워크플로
- [MODIFY] `docs/ARCHITECTURE.md` — `eval_*` 테이블 토폴로지 + `admin/eval` 모듈 갱신 (필수 동기화 doc 3종 중 1)
- [MODIFY] `docs/infra/data-model.md` — 3 신규 테이블 schema + RLS 정책

## MX Tag Plan (Phase 3.5 mandatory)

- `@MX:NOTE` — `src/lib/eval/ndcg.ts:computeNdcg` (pure function; 직접 caller 는 run-snapshot orchestrator 단일. fan_in < 3 이므로 ANCHOR 자격 미달; 향후 caller 추가 시 ANCHOR 승격 검토)
- `@MX:NOTE` — `src/lib/eval/precision.ts:computePrecisionAtK` (동일 사유: pure function + 단일 직접 caller (run-snapshot))
- `@MX:NOTE` — `supabase/migrations/033_eval_v6_tables.sql` — RLS pattern 은 migration 023 (admin_profiles) 참조; admin_profiles JOIN 으로 admin-only 게이트
- `@MX:WARN` — `src/app/api/admin/eval/run/route.ts` — `_includeScoring: true` 로 search-products 호출 시 응답 페이로드 ~3-5KB/product, 30 쿼리 × 10 product = 응답 크기 100KB+. 라벨링 세션당 호출 빈도 제한 검토 필요 (rate limit 미구현, 어드민 신뢰 가정)
- `@MX:TODO` — `src/lib/eval/judgment-store.ts:routeAlgorithmVersion` — algorithm_version='v6' 라우팅은 SPEC-V6-CORE 가 v6 endpoint (`/api/search-products-v6` 또는 RPC) 를 제공할 때까지 throw `NotImplementedError`

## Technical Approach Summary

DDD ANALYZE-PRESERVE-IMPROVE 적용 이유: `src/app/admin/eval/page.tsx` (239 LOC) 와 4개 컴포넌트가 현재 안정적으로 동작 중이며 (평가 대기열 + 골든셋 두 탭), 신규 3 탭 추가가 기존 동작에 회귀를 일으키면 안 된다. 따라서 (1) ANALYZE 단계에서 현재 page.tsx + eval-queue.tsx + eval-golden-set.tsx 의 fetch / 필터 / 렌더링 동작을 파악, (2) PRESERVE 단계에서 두 기존 탭의 characterization test 작성 (jsdom + vitest, MSW 또는 fetch mock), (3) IMPROVE 단계에서 신규 3 탭 + 신규 컴포넌트 추가. 신규 메트릭 계산 함수 (`src/lib/eval/ndcg.ts`, `precision.ts`) 는 pure function 이라 RED-GREEN 가능 (Brownfield Enhancement 룰).

구현 순서: (1) migration 033 작성 + RLS integration test (`tests/integration/eval-rls.test.ts`) → (2) `src/lib/eval/` 4개 파일 + 단위 테스트 (TDD) → (3) `/api/admin/eval/golden-queries|run|judgments/[id]|compute|freeze-baseline` 5개 라우트 + 라우트 테스트 → (4) characterization tests for 기존 탭 → (5) 신규 3 컴포넌트 + page.tsx 탭 통합 → (6) docs 3종 동기화. RLS 가드 검증은 anon-key Supabase client 기반 자동 integration test 로 수행 (수동 검증 폐기).

## Reference Implementations (from research.md)

- RLS 패턴: `supabase/migrations/023_admin_profiles_rls.sql` — `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... USING (EXISTS (SELECT 1 FROM admin_profiles WHERE user_id = auth.uid() AND status = 'approved'))` 구조 그대로 3 테이블에 복사
- Admin 가드: `src/lib/admin-auth.ts` 의 `requireApprovedAdmin()` 함수 — 모든 신규 API route 첫 줄에서 호출
- shadcn/ui: 기존 사용 컴포넌트 (Button, Card, Dialog, Badge, Table, Checkbox) 재사용. 신규 컴포넌트 추가 금지 (Card / Dialog / Table 조합으로 충분)
- 테스트 패턴: `src/lib/search/locked-filter.test.ts` — vitest describe/it/expect, Korean test names 허용, pure function 단위 테스트. NDCG/Precision 도 동일 패턴
- v4 검색 호출: `POST /api/search-products` body 에 `_includeScoring: true` 추가 → 응답 product 마다 `_scoring.totalScore` 포함 (research.md §D)
- 메트릭 표시 패턴: 기존 `src/components/admin/eval-metrics.tsx` (60 LOC) 의 4-card grid + tabular-nums 정렬 → eval-runs-dashboard.tsx 도 같은 시각 언어로

## Risks (from research.md §G)

- **Vision API 비용 trap**: golden_query 생성 시 1회 Vision 호출만 허용, 결과는 `eval_golden_queries.intent_note` 또는 별도 캐시 컬럼에 frozen. 라벨링 중 재호출 금지 (구조적으로 차단 — 라벨링 UI 는 search-products API 만 호출, Vision 미호출).
- **RLS pitfall**: 신규 3 테이블 모두 RLS 활성화 + admin-only 정책 강제. `tests/integration/eval-rls.test.ts` 가 anon-key client 로 SELECT/INSERT 시도 → deny 자동 검증 (CI 게이트). `requireApprovedAdmin()` 가드 우회 시나리오 (직접 Supabase 쿼리) 까지 차단.
- **v5 의존성**: `algorithm_version` 파라미터로 v4 / v6 라우팅 추상화. v6 endpoint 미존재 상태에서는 `judgment-store.ts:routeAlgorithmVersion` 가 throw 하여 명시적 실패. SPEC-V6-CORE 머지 후 라우팅 코드 채움.
