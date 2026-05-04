---
spec_id: SPEC-V6-EVAL
version: 0.1.2
created: 2026-05-04
updated: 2026-05-04
methodology: DDD (ANALYZE-PRESERVE-IMPROVE) + Brownfield TDD for new pure functions
---

# SPEC-V6-EVAL — Implementation Plan

## HISTORY

- 2026-05-04 v0.1.2: Iteration 3 revision per plan-audit-2 report. Added PATCH `/api/admin/eval/judgments/[id]` route test to D6 (now 6 test files in D6, total 11 across SPEC); expanded Quality Gate coverage scope to include `src/components/admin/eval-*.tsx`. Version aligned with spec.md / acceptance.md / spec-compact.md (all 0.1.2).
- 2026-05-04 v0.1.1: Iteration 2 revision per plan-audit-1 report. Added C6 RLS integration test task; expanded D6 to 5 test files; extended Estimated Scope test count to 10. (Frontmatter version was not bumped at the time — corrected retroactively in v0.1.2 HISTORY.)
- 2026-05-04 v0.1.0: Initial plan draft (Plan workflow Phase 2). DDD methodology selection, Phase A-F task decomposition with priority labels, Risk Mitigation table.

## Tech Stack (현행 portal.ai 스택 유지, 신규 추가 없음)

- 프레임워크: Next.js 16 App Router + React 19 (`src/app/admin/eval/*`, `src/app/api/admin/eval/*`)
- DB: Supabase Postgres + RLS (마이그레이션 033 신규)
- 테스트: Vitest 4 (`src/**/*.test.{ts,tsx}` + `tests/**/*.test.{ts,tsx}`), jsdom env, vitest.config.ts 그대로 사용
- UI: shadcn/ui 기존 컴포넌트 (Button, Card, Dialog, Badge, Table, Checkbox) 재사용 — 신규 npm 의존성 금지
- Auth: 기존 `src/lib/admin-auth.ts:requireApprovedAdmin()` 가드 재사용
- Search 호출: 기존 `POST /api/search-products` (`_includeScoring: true`) — 신규 wrapper 함수 추가 가능 (`src/lib/eval/search-invoker.ts` optional)

## Methodology Selection — DDD 우선, 신규 pure function 만 TDD

브라운필드 (`page.tsx` 239 LOC + 4 컴포넌트 안정 운영). 신규 추가 vs 기존 보존이 혼재 → DDD ANALYZE-PRESERVE-IMPROVE 가 기본. 단, 신규 pure function (`src/lib/eval/ndcg.ts`, `precision.ts`) 은 외부 의존성 없는 독립 모듈이라 RED-GREEN-REFACTOR (Brownfield Enhancement 룰: pre-RED 로 입력 형식만 확인 후 RED 작성).

| 작업 영역 | Methodology | 이유 |
|---|---|---|
| `src/lib/eval/ndcg.ts`, `precision.ts` | TDD | 신규 pure function, 외부 의존성 없음 |
| `src/lib/eval/judgment-store.ts`, `run-snapshot.ts` | DDD | Supabase client 통합, 기존 패턴 따름 |
| `src/app/api/admin/eval/*` 신규 4 라우트 | DDD | 기존 admin/eval API 패턴 PRESERVE |
| `src/app/admin/eval/page.tsx` 탭 추가 | DDD | 기존 두 탭 PRESERVE 필수 |
| 신규 컴포넌트 3개 | DDD | shadcn 패턴 보존 |
| 마이그레이션 033 | N/A (DDL) | RLS 패턴은 023 복제 |

## Task Decomposition (Priority-ordered, no time estimates)

### Phase A — ANALYZE (기존 코드 이해)

**Priority High**

- A1. Read `src/app/admin/eval/page.tsx`, `src/components/admin/eval-{queue,golden-set,metrics,review-detail}.tsx` 전체 — 현재 fetch / 상태 / 렌더링 흐름 명세 작성
- A2. Read `src/app/api/admin/eval/route.ts`, `[analysisId]/route.ts`, `golden-set/route.ts` — 응답 shape, 필터 파라미터, 페이지네이션 패턴 명세
- A3. Read `supabase/migrations/023_admin_profiles_rls.sql` 와 `024_admin_profiles_search_path.sql` — RLS 정책 골격 추출
- A4. Read `src/app/api/search-products/route.ts` (관련 부분만, `_includeScoring` 처리 + FormattedProduct shape) — 호출 인터페이스 명세

### Phase B — PRESERVE (characterization tests for 기존 두 탭)

**Priority High** (RUN phase 진입 전 필수)

- B1. `src/app/admin/eval/__characterization__/queue.test.tsx` 작성 — 평가 대기열 탭의 (1) 초기 fetch, (2) verdict 필터 변경, (3) 페이지네이션, (4) review 카드 렌더링 동작 박제. fetch mock + jsdom render
- B2. `src/app/admin/eval/__characterization__/golden.test.tsx` 작성 — 골든셋 탭의 (1) 초기 fetch, (2) image + expected_node 표시, (3) 삭제 액션 박제

### Phase C — IMPROVE 전반: 데이터 레이어 + 메트릭 함수

**Priority High → Medium**

- C1. (High) `supabase/migrations/033_eval_v6_tables.sql` 작성:
  - `eval_golden_queries`: id uuid PK, instagram_url text NULL, query_signature text NOT NULL, intent_note text, created_by text, created_at timestamptz default now(), UNIQUE constraint on (COALESCE(instagram_url, '')||'|'||query_signature) 또는 partial unique index
  - `eval_judgments`: id uuid PK, golden_query_id uuid FK → eval_golden_queries(id) ON DELETE CASCADE, product_id uuid FK → products(id) ON DELETE RESTRICT, relevance_grade smallint CHECK (relevance_grade BETWEEN 0 AND 3), labeler_id text, labeled_at timestamptz NULL, algorithm_version text CHECK (algorithm_version IN ('v4','v6')), notes text NULL, search_rank smallint NOT NULL (1~10), UNIQUE (golden_query_id, product_id, algorithm_version)
  - `eval_runs`: id uuid PK, golden_query_id uuid FK NULL (NULL = 전체 평균), algorithm_version text CHECK IN ('v4','v6'), ndcg_at_10 numeric(5,4), precision_at_5 numeric(5,4), query_count int, judgment_count int, frozen boolean default false, computed_at timestamptz default now(), notes text
  - 3 테이블 모두 RLS 활성화 + admin_profiles JOIN 정책 (research.md §C 코드 그대로 복사)
  - frozen=true 인 (algorithm_version='v4', golden_query_id IS NULL) row 가 존재하면 동일 조합 신규 INSERT 차단하는 trigger 또는 partial unique index
- C2. (High) `src/lib/eval/ndcg.ts` — TDD:
  - RED: `tests/src/lib/eval/ndcg.test.ts` 에 fixture 4-6 작성 (perfect ranking, worst, mixed)
  - GREEN: `computeNdcg(judgments, k)` 표준 NDCG 공식 (DCG / IDCG, log2 base) 구현
  - REFACTOR: edge case (k > judgments.length, all zero) 정리
- C3. (High) `src/lib/eval/precision.ts` — TDD 동일 사이클, `computePrecisionAtK(judgments, k=5, threshold=2)`
- C4. (Medium) `src/lib/eval/judgment-store.ts` — Supabase admin client 로 upsert/load helpers; `routeAlgorithmVersion(version)` 는 v4 만 구현, v6 는 `throw new Error('SPEC-V6-CORE pending')` (`@MX:TODO`)
- C5. (Medium) `src/lib/eval/run-snapshot.ts` — `computeAndStoreRun({ golden_query_id?, algorithm_version })` 오케스트레이터: judgment-store 호출 → ndcg/precision 계산 → eval_runs insert
- C6. (High) `tests/integration/eval-rls.test.ts` — anon-key Supabase client 를 사용하여 `eval_golden_queries` / `eval_judgments` / `eval_runs` 세 테이블에 SELECT/INSERT 시도; PGRST 에러 또는 빈 result set 검증. CI 파이프라인에 포함 (REQ-005 의 자동 verification gate). 추가로 비-approved authenticated user (admin_profiles.status='pending') 의 INSERT 시도 차단 검증 포함

### Phase D — IMPROVE: API routes (5 신규)

**Priority Medium**

- D1. `src/app/api/admin/eval/golden-queries/route.ts` — GET / POST / PATCH / DELETE, 첫 줄 `requireApprovedAdmin()`, dual identity 충돌 시 409 응답
- D2. `src/app/api/admin/eval/run/route.ts` — POST `{ golden_query_id, algorithm_version }`, `/api/search-products` 내부 호출 (절대 URL fetch 또는 server-side 직접 import), 응답 top-10 → eval_judgments upsert (relevance_grade=NULL), 응답으로 judgment row 목록 반환
- D3. `src/app/api/admin/eval/judgments/[id]/route.ts` — PATCH `{ relevance_grade }` (0~3 정수), `requireApprovedAdmin()` 가드, `eval_judgments` 의 단일 row 의 `relevance_grade` 와 `labeled_at=now()` 갱신. CHECK 위반 시 400, row 미존재 시 404. REQ-002 step 3 의 라벨 저장 contract 충족
- D4. `src/app/api/admin/eval/compute/route.ts` — POST `{ golden_query_id?, algorithm_version }`, judgment 완전성 체크 (모든 grade NOT NULL) → run-snapshot 호출 → eval_runs row 반환
- D5. `src/app/api/admin/eval/freeze-baseline/route.ts` — POST `{ run_id }`, algorithm_version='v4' 만 허용, frozen=true 설정. 이미 frozen 인 baseline 존재 시 409
- D6. (테스트) 6 라우트/lib 테스트 파일 일괄 작성 (5 API routes 각 1 + judgment-store lib 1):
  - `src/app/api/admin/eval/run/route.test.ts` — POST happy path + 비-admin 거부
  - `src/app/api/admin/eval/golden-queries/route.test.ts` — GET/POST/PATCH/DELETE happy path + dual identity 409 + 비-admin 거부
  - `src/app/api/admin/eval/judgments/[id]/route.test.ts` — PATCH happy path (relevance_grade 0~3 update + labeled_at refresh) + CHECK 위반 (grade < 0 or > 3) → 400 + missing id → 404 + non-admin (anon-key) → 403/RLS deny
  - `src/app/api/admin/eval/compute/route.test.ts` — POST happy path + 미완성 judgment 거부 + 비-admin 거부
  - `src/app/api/admin/eval/freeze-baseline/route.test.ts` — v4 freeze 성공 + v6 거부 + 이미 frozen 시 409 + 비-admin 거부
  - `src/lib/eval/judgment-store.test.ts` — upsertJudgments / loadJudgmentsForQuery / routeAlgorithmVersion('v6') throw

### Phase E — IMPROVE: UI 통합

**Priority Medium → Low**

- E1. `src/components/admin/eval-golden-queries.tsx` — 30 쿼리 Table + 추가 Dialog (instagram_url, query_signature, intent_note 입력)
- E2. `src/components/admin/eval-labeling-form.tsx` — golden_query 선택 + algorithm_version 선택 + "검색 실행" 버튼 → top-10 product 카드 그리드 (image + brand + 0~3 grade selector) + "Compute Run" 버튼
- E3. `src/components/admin/eval-runs-dashboard.tsx` — eval_runs 테이블 (algorithm_version, ndcg, precision, frozen 배지, computed_at) + "Freeze Baseline" 액션 (v4 row 만)
- E4. `src/app/admin/eval/page.tsx` — 기존 두 탭 PRESERVE, 새 3 탭 ("Golden Queries" / "Labeling" / "Runs") 추가. characterization tests 재실행하여 회귀 없음 확인

### Phase F — Sync (3 doc 동기화, /moai sync 단계에서 수행)

**Priority High** (필수 동기화 doc 3종 룰)

- F1. `docs/features/search-engine.md` 에 "Evaluation Infrastructure (v6-EVAL)" 섹션 추가
- F2. `docs/ARCHITECTURE.md` 에 `eval_*` 테이블 토폴로지 + admin/eval 모듈 갱신
- F3. `docs/infra/data-model.md` 에 3 신규 테이블 schema + RLS 정책

## Risk Mitigation

| Risk | Mitigation | 검증 방법 |
|---|---|---|
| Vision API 재호출로 비용 폭증 | golden_query 생성 시 1회만 Vision 호출, 결과 frozen. 라벨링 UI 는 search-products API 만 호출, Vision 미호출 (구조적 차단) | 코드 리뷰: eval-labeling-form.tsx 가 Vision API import 없음을 grep 으로 확인 |
| 신규 3 테이블 RLS 누락 → anon-key 노출 | migration 033 의 모든 테이블에 `ENABLE ROW LEVEL SECURITY` + admin_profiles JOIN 정책 강제. PR 리뷰 시 grep `ENABLE ROW LEVEL SECURITY` 카운트 = 3 확인 | (자동) C6 task 의 integration test (`tests/integration/eval-rls.test.ts`) 가 anon-key SELECT/INSERT 시도 → empty 또는 PGRST 에러 검증; CI 게이트 |
| v6 endpoint 미존재로 algorithm_version='v6' 호출 시 silent fail | `judgment-store.ts:routeAlgorithmVersion('v6')` 가 명시적으로 throw, UI 에서 v6 버튼 disabled 처리 | TypeScript `never` 분기 + 단위 테스트 1건 (throws assertion) |
| 기존 두 탭 (queue/golden) 회귀 | Phase B characterization tests 가 PRESERVE. Phase E 완료 후 재실행하여 통과 확인 | `pnpm test src/app/admin/eval/__characterization__` 통과 |
| migration 033 의 dual identity unique constraint 잘못 설계 시 동일 IG URL 중복 허용 | C1 작성 시 SQL fixture 로 (instagram_url='X', query_signature='X-sig') 중복 INSERT → 실패 확인 | migration test (수동 또는 supabase test fixture) |

## Estimated Scope (file count)

| 카테고리 | 신규 | 수정 | 합계 |
|---|---|---|---|
| 마이그레이션 | 1 | 0 | 1 |
| `src/lib/eval/` | 4 | 0 | 4 |
| API routes | 5 (golden-queries, run, judgments/[id], compute, freeze-baseline) | 0 | 5 |
| 컴포넌트 | 3 | 0 | 3 |
| 페이지 | 0 | 1 (page.tsx) | 1 |
| 테스트 | 11 (ndcg, precision, judgment-store, queue char, golden char, run route, golden-queries route, judgments/[id] route, compute route, freeze-baseline route, eval-rls integration) | 0 | 11 |
| docs | 0 | 3 (search-engine, ARCHITECTURE, data-model) | 3 |
| **합계** | **24** | **4** | **28** |

## Phase Ordering Summary

A → B → (C1 || C2 || C3) → C4 → C5 → C6 → D1..D6 → E1..E4 → F1..F3

(A,B 는 RUN 진입 직후 / C2,C3 는 pure function 이라 병렬 가능 / C6 는 migration 033 (C1) 적용 후 즉시 가능 / D 는 C 완료 후 / E 는 D 완료 후 / F 는 /moai sync 에서)

## Reference Implementations

상세는 `spec.md` 의 "Reference Implementations" 섹션 참고. 핵심 5개:
1. RLS: `supabase/migrations/023_admin_profiles_rls.sql`
2. Admin 가드: `src/lib/admin-auth.ts:requireApprovedAdmin()`
3. shadcn 사용 패턴: `src/components/admin/eval-metrics.tsx`
4. 테스트 패턴: `src/lib/search/locked-filter.test.ts`
5. v4 호출 인터페이스: `src/app/api/search-products/route.ts` (`_includeScoring`, FormattedProduct shape)
