---
spec_id: SPEC-V6-EVAL
version: 0.1.2
created: 2026-05-04
updated: 2026-05-04
source: spec.md (auto-extracted compact view)
---

# SPEC-V6-EVAL — Compact

## Requirements (EARS)

### REQ-V6-EVAL-001 (Ubiquitous) — Golden Set Admin CRUD

WHILE 사용자가 `/admin/eval` "Golden Queries" 탭에 있고 `admin_profiles.status='approved'` 인 상태에서, 시스템 SHALL `eval_golden_queries` 의 모든 row 를 페이지네이션 표시 (instagram_url, query_signature, intent_note, created_by, created_at) 하고 신규 추가/편집/삭제 액션을 제공한다.

[HARD] Dual identity: instagram_url (nullable) + query_signature (NOT NULL) + UNIQUE constraint on (COALESCE(instagram_url,'')||'|'||query_signature).

### REQ-V6-EVAL-002 (Event-driven) — Algorithm Run + Judgment Persistence

WHEN 사용자가 "Labeling" 탭에서 (golden_query_id, algorithm_version) 선택 + "검색 실행" 클릭 시, 시스템 SHALL:
1. `POST /api/admin/eval/run` 호출 → 서버가 `POST /api/search-products` 를 `_includeScoring: true` 로 호출
2. 응답 top-10 `FormattedProduct[]` 를 `eval_judgments` 에 upsert (relevance_grade=NULL pending)
3. 사람이 0~3 grade 입력 시 `PATCH /api/admin/eval/judgments/{id}` 호출 → row 갱신 (relevance_grade, labeled_at)
4. 모든 grade 라벨링 완료 시 compute 트리거 가능

[HARD] relevance_grade 0~3 정수, 기존 eval_reviews.verdict (pass/fail/partial) 와 완전히 분리.

### REQ-V6-EVAL-003 (Event-driven) — Metric Calculation + Snapshot

WHEN (golden_query_id, algorithm_version) 의 모든 top-10 judgment 의 `relevance_grade` 가 NOT NULL 이며 사용자가 "Compute Run" 액션을 트리거할 때, 시스템 SHALL:
1. `computeNdcg(judgments, k=10)` 호출
2. `computePrecisionAtK(judgments, k=5, threshold=2)` 호출
3. `eval_runs` 에 새 row INSERT (algorithm_version, ndcg_at_10, precision_at_5, query_count, judgment_count, computed_at, frozen=false)
4. "Runs" 탭에 결과 표시

집계 단위: 단일 query (golden_query_id NOT NULL) 또는 전체 평균 (NULL).

### REQ-V6-EVAL-004 (Event-driven) — v4 Baseline Freeze

WHEN 사용자가 v4 algorithm 30 골든셋 쿼리 전체 라벨링+계산을 완료한 시점에, 시스템 SHALL "Freeze Baseline" 액션을 노출하여 `eval_runs.frozen=true` 설정 + 동일 (algorithm_version='v4', golden_query_id IS NULL) 조합의 신규 INSERT 거부. 강제 해제는 SQL 직접 수정만 허용.

### REQ-V6-EVAL-005 (Unwanted) — RLS Deny for Non-Admin

IF 요청자가 `admin_profiles.status='approved'` 가 아닌 상태에서 `eval_golden_queries` / `eval_judgments` / `eval_runs` 에 SELECT/INSERT/UPDATE/DELETE 시도 시, THEN 시스템 SHALL NOT 해당 작업을 허용한다 (RLS deny via empty result set or PGRST error).

[HARD] 신규 3 테이블 모두 RLS 활성화 + admin_profiles JOIN 정책 필수.

---

## Acceptance Scenarios (Compressed Given/When/Then) — 총 14 시나리오

### REQ-001 (3건)
1. **GIVEN** approved admin + 30 row 존재 → **WHEN** "Golden Queries" 탭 진입 → **THEN** 30 쿼리 페이지네이션 + 편집/삭제 버튼 표시
2. **GIVEN** 탭 열림 → **WHEN** 신규 추가 (instagram_url, intent_note, created_by) → **THEN** POST /api/admin/eval/golden-queries → DB INSERT → 테이블 갱신
3. **GIVEN** instagram_url 중복 → **WHEN** 동일 URL 추가 시도 → **THEN** 409 Conflict + DB 보호

### REQ-002 (3건)
1. **GIVEN** golden_query_id+algorithm_version="v4" 선택 → **WHEN** "검색 실행" → **THEN** POST /api/admin/eval/run → /api/search-products 내부 호출 → eval_judgments 10 row upsert (grade=NULL) → UI 카드 그리드
2. **GIVEN** 10 카드 표시 grade=NULL, judgment id=J1 → **WHEN** 첫 카드 grade=3 선택 → **THEN** PATCH /api/admin/eval/judgments/J1 호출 → relevance_grade=3, labeled_at=now() 갱신 → 시각 표시
3. **GIVEN** 라벨링 UI, judgment id=J1 → **WHEN** 비정상 client 가 PATCH /api/admin/eval/judgments/J1 에 grade=5 전송 → **THEN** CHECK 위반 → 400 Bad Request → DB 미변경

### REQ-003 (4건)
1. **GIVEN** fixture top-10 모두 grade=3 → **WHEN** computeNdcg(j, 10) → **THEN** 1.0; fixture all grade=0 → 0.0
2. **GIVEN** fixture top-5 grade=[3,2,1,0,2] → **WHEN** computePrecisionAtK(j, 5, 2) → **THEN** 0.6
3. **GIVEN** 30 쿼리 v4 라벨링 완료 → **WHEN** POST /api/admin/eval/compute (algorithm_version="v4") → **THEN** eval_runs 새 row INSERT (query_count=30, judgment_count=300) → 대시보드 갱신
4. **GIVEN** 동일 Q1 에 v4+v6 judgment 모두 존재 → **WHEN** computeNdcg(v4 only) → **THEN** v6 grade 영향 없음

### REQ-004 (2건)
1. **GIVEN** v4 baseline row frozen=false → **WHEN** "Freeze Baseline" → **THEN** frozen=true + [BASELINE (locked)] 배지 표시 + 동일 조합 재 INSERT → 409
2. **GIVEN** v6 row → **WHEN** freeze 시도 → **THEN** 400 Bad Request ("v4 only") + DB 미변경

### REQ-005 (2건)
1. **GIVEN** anon-key client → **WHEN** SELECT eval_golden_queries / eval_judgments / eval_runs → **THEN** empty 결과 또는 PGRST 에러
2. **GIVEN** authenticated 비-approved user → **WHEN** INSERT eval_golden_queries → **THEN** RLS WITH CHECK 위반 → 거부

---

## Files to Create / Modify

### NEW (24 files)

**Migration (1):**
- `supabase/migrations/033_eval_v6_tables.sql`

**Lib (4):**
- `src/lib/eval/ndcg.ts`
- `src/lib/eval/precision.ts`
- `src/lib/eval/judgment-store.ts`
- `src/lib/eval/run-snapshot.ts`

**API routes (5):**
- `src/app/api/admin/eval/golden-queries/route.ts`
- `src/app/api/admin/eval/run/route.ts`
- `src/app/api/admin/eval/judgments/[id]/route.ts` (PATCH for relevance_grade/labeled_at update)
- `src/app/api/admin/eval/compute/route.ts`
- `src/app/api/admin/eval/freeze-baseline/route.ts`

**Components (3):**
- `src/components/admin/eval-golden-queries.tsx`
- `src/components/admin/eval-labeling-form.tsx`
- `src/components/admin/eval-runs-dashboard.tsx`

**Tests (11):**
- `src/lib/eval/ndcg.test.ts`
- `src/lib/eval/precision.test.ts`
- `src/lib/eval/judgment-store.test.ts`
- `src/app/admin/eval/__characterization__/queue.test.tsx`
- `src/app/admin/eval/__characterization__/golden.test.tsx`
- `src/app/api/admin/eval/run/route.test.ts`
- `src/app/api/admin/eval/golden-queries/route.test.ts`
- `src/app/api/admin/eval/judgments/[id]/route.test.ts` (PATCH 0~3 happy path / CHECK violation 400 / 404 / non-admin RLS deny)
- `src/app/api/admin/eval/compute/route.test.ts`
- `src/app/api/admin/eval/freeze-baseline/route.test.ts`
- `tests/integration/eval-rls.test.ts` (anon-key Supabase client; REQ-005 자동 검증)

### MODIFY (4 files)

- `src/app/admin/eval/page.tsx` — 기존 두 탭 PRESERVE + 신규 3 탭 추가
- `docs/features/search-engine.md` — "Evaluation Infrastructure (v6-EVAL)" 섹션 추가
- `docs/ARCHITECTURE.md` — eval_* 토폴로지 + admin/eval 모듈 갱신
- `docs/infra/data-model.md` — 3 신규 테이블 schema + RLS

**총 28 파일 (신규 24 + 수정 4)**

---

## Exclusions (NOT in scope)

- LLM-as-judge 자동 채점 → SPEC-V6-EVAL-V2 또는 V6-AUTOMATION
- v5 임베딩 풀배치 실행 → SPEC-V6-CORE
- 검색 알고리즘 변경 (rerank, fusion 가중치) → SPEC-V6-CORE
- 골든셋 100/300 확장 → V6-EVAL-V2
- 프로덕션 IG URL 자동 샘플링 → V6-AUTOMATION
- A/B 좌우 비교 UI → 별도 SPEC
- Vision API 재호출 캐싱 인프라 → 별도 SPEC (golden_query 생성 시 1회 호출만 허용)
