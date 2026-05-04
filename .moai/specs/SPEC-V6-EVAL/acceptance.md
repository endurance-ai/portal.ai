---
spec_id: SPEC-V6-EVAL
version: 0.1.2
created: 2026-05-04
updated: 2026-05-04
---

# SPEC-V6-EVAL — Acceptance Criteria

각 REQ 별 최소 2개 Given/When/Then. 총 14 시나리오.

---

## REQ-V6-EVAL-001 — Golden Set Admin CRUD

### Scenario 1.1: 어드민이 "Golden Queries" 탭 접근 — 30 쿼리 표시

GIVEN 사용자가 `admin_profiles.status = 'approved'` 상태로 로그인되어 있고
AND `eval_golden_queries` 테이블에 30 row 가 존재하며
WHEN 사용자가 `/admin/eval` 페이지의 "Golden Queries" 탭으로 이동
THEN 30 쿼리가 instagram_url, query_signature, intent_note, created_by, created_at 컬럼을 가진 페이지네이션 테이블로 표시된다
AND 각 row 에 "편집" / "삭제" 액션 버튼이 존재한다
AND "신규 추가" 버튼이 페이지 상단에 노출된다

### Scenario 1.2: 신규 골든셋 쿼리 추가

GIVEN "Golden Queries" 탭이 열려 있고
WHEN 사용자가 "신규 추가" 버튼을 누르고 다이얼로그에서 instagram_url="https://www.instagram.com/p/ABC123/", intent_note="bone-white knit fit", created_by="admin@portal.ai" 를 입력하고 "저장"
THEN `POST /api/admin/eval/golden-queries` 가 호출되고
AND `eval_golden_queries` 테이블에 새 row 가 INSERT 되며 (query_signature 는 instagram_url 에서 derive)
AND 다이얼로그가 닫히고 테이블에 새 row 가 표시된다

### Scenario 1.3: dual identity unique 위반

GIVEN `eval_golden_queries` 에 instagram_url="https://www.instagram.com/p/ABC123/" 인 row 가 이미 존재하고
WHEN 사용자가 동일 instagram_url 로 신규 추가 시도
THEN API 가 409 Conflict 응답을 반환하고
AND UI 토스트로 "동일 IG URL 의 골든셋이 이미 존재합니다" 메시지 표시
AND DB 에 중복 row 가 INSERT 되지 않는다

---

## REQ-V6-EVAL-002 — Algorithm Run Trigger + Judgment Persistence

### Scenario 2.1: v4 알고리즘으로 검색 실행 → judgment row 생성

GIVEN 사용자가 "Labeling" 탭에서 골든셋 쿼리 1개 (golden_query_id=Q1) 와 algorithm_version="v4" 를 선택했고
WHEN 사용자가 "검색 실행" 버튼을 누름
THEN `POST /api/admin/eval/run` 이 `{ golden_query_id: "Q1", algorithm_version: "v4" }` body 로 호출되고
AND 서버가 내부적으로 `POST /api/search-products` 를 `_includeScoring: true` 로 호출하며
AND 응답의 top-10 product 가 `eval_judgments` 테이블에 10 row 로 upsert 된다 (golden_query_id=Q1, product_id=각 product, algorithm_version="v4", relevance_grade=NULL, search_rank=1..10)
AND UI 가 10 product 카드 그리드로 갱신되고 각 카드에 0~3 grade selector 가 표시된다

### Scenario 2.2: 사람 라벨링 → relevance_grade 저장

GIVEN Scenario 2.1 의 10 product 카드가 표시된 상태이고 모든 카드의 relevance_grade 가 NULL 이며 첫 번째 카드의 judgment row id 가 J1
WHEN 사용자가 첫 번째 product 카드의 grade=3 을 선택
THEN `PATCH /api/admin/eval/judgments/J1` 가 `{ relevance_grade: 3 }` body 로 호출되고
AND `eval_judgments` 의 id=J1 row 의 `relevance_grade=3`, `labeled_at=now()` 로 업데이트되며
AND UI 카드에 선택된 grade 가 시각적으로 표시된다 (예: 색상 배지)

### Scenario 2.3: 0~3 범위 외 입력 차단

GIVEN Labeling UI 에서 grade selector 가 표시된 상태이고 judgment row id=J1
WHEN 비정상 클라이언트가 `PATCH /api/admin/eval/judgments/J1` 에 `{ relevance_grade: 5 }` body 를 전송
THEN Postgres CHECK 제약 (`relevance_grade BETWEEN 0 AND 3`) 위반으로 UPDATE 실패
AND API 가 400 Bad Request 응답
AND DB 의 row 가 변경되지 않는다

---

## REQ-V6-EVAL-003 — Metric Calculation and Snapshot

### Scenario 3.1: NDCG@10 알려진 fixture 정확도

GIVEN `src/lib/eval/ndcg.test.ts` 에 fixture: judgments=[{rank:1,grade:3},{rank:2,grade:3},{rank:3,grade:3},{rank:4,grade:3},{rank:5,grade:3},{rank:6,grade:3},{rank:7,grade:3},{rank:8,grade:3},{rank:9,grade:3},{rank:10,grade:3}] (perfect ranking)
WHEN `computeNdcg(judgments, 10)` 호출
THEN 반환값이 `1.0` (소수점 4자리 정확도) 이다

AND fixture: judgments=[{rank:1,grade:0}, ...10개 모두 grade:0] 의 경우
WHEN `computeNdcg(judgments, 10)` 호출
THEN 반환값이 `0.0` (또는 NaN 처리 정의에 따라 0) 이다

### Scenario 3.2: Precision@5 threshold=2 정확도

GIVEN `src/lib/eval/precision.test.ts` 에 fixture: judgments top-5 grade=[3,2,1,0,2]
WHEN `computePrecisionAtK(judgments, 5, 2)` 호출 (threshold=2 = relevant)
THEN 반환값이 `0.6` (3개 relevant / 5) 이다

### Scenario 3.3: Compute Run → eval_runs row 생성

GIVEN 골든셋 30 쿼리 모두에 대해 v4 algorithm 의 top-10 judgment 가 모두 라벨링 완료 (relevance_grade NOT NULL)
WHEN 사용자가 "Runs" 탭에서 "Compute Run (v4 전체)" 액션 트리거 → `POST /api/admin/eval/compute` 가 `{ algorithm_version: "v4" }` 로 호출
THEN `eval_runs` 테이블에 새 row 가 INSERT 된다 (algorithm_version="v4", golden_query_id=NULL, ndcg_at_10=계산값, precision_at_5=계산값, query_count=30, judgment_count=300, frozen=false, computed_at=now())
AND "Runs" 탭 대시보드가 갱신되어 새 row 가 표시된다

### Scenario 3.4: algorithm_version 분리 — v4 와 v6 의 judgment 가 독립

GIVEN 동일 golden_query_id=Q1 에 대해 v4 judgment 10 row 와 v6 judgment 10 row 가 모두 존재 (UNIQUE (golden_query_id, product_id, algorithm_version) 가 분리 보장)
WHEN `computeNdcg` 가 algorithm_version="v4" 의 judgment 만 필터링하여 호출
THEN v6 judgment 의 grade 가 결과에 영향을 미치지 않으며 v4 결과만 반영된 점수 반환

---

## REQ-V6-EVAL-004 — v4 Baseline Freeze

### Scenario 4.1: baseline freeze → 동일 조합 신규 INSERT 차단

GIVEN `eval_runs` 에 (algorithm_version="v4", golden_query_id=NULL, frozen=false) row 가 존재
WHEN 사용자가 "Runs" 탭에서 해당 row 의 "Freeze Baseline" 버튼을 누르고 → `POST /api/admin/eval/freeze-baseline` 호출
THEN 해당 row 의 `frozen=true` 로 업데이트되고
AND UI 에 frozen 배지 (예: "[BASELINE (locked)]") 표시되며 "Freeze Baseline" 버튼이 사라지고
AND 이후 동일 (algorithm_version="v4", golden_query_id=NULL) 조합으로 `POST /api/admin/eval/compute` 시도 시 trigger 또는 partial unique index 가 INSERT 차단 → 409 응답

### Scenario 4.2: v6 algorithm 은 freeze 불가

GIVEN `eval_runs` 에 (algorithm_version="v6") row 가 존재
WHEN 사용자가 해당 row 의 freeze 시도 → `POST /api/admin/eval/freeze-baseline` 호출
THEN API 가 400 Bad Request 응답 ("baseline freeze 는 v4 에만 허용") 반환
AND DB 의 frozen 값이 변경되지 않는다

---

## REQ-V6-EVAL-005 — RLS Deny for Non-Admin

### Scenario 5.1: anon-key 로 SELECT 시도 → empty 결과

GIVEN Supabase anon-key 로 초기화된 client (admin_profiles row 없음 또는 status≠'approved')
WHEN client 가 `SELECT * FROM eval_golden_queries`, `SELECT * FROM eval_judgments`, `SELECT * FROM eval_runs` 각각 실행
THEN 세 쿼리 모두 빈 결과셋 반환 (RLS 가 모든 row 필터링) 또는 PGRST 권한 에러
AND 어떤 row 도 응답에 포함되지 않는다

### Scenario 5.2: 비-approved authenticated user 의 INSERT 시도 차단

GIVEN authenticated user (auth.uid() 존재) 이지만 `admin_profiles.status='pending'` 인 client
WHEN client 가 `INSERT INTO eval_golden_queries (instagram_url, query_signature, ...) VALUES (...)` 시도
THEN RLS WITH CHECK 정책 위반으로 INSERT 거부 (PGRST 에러 또는 0 row affected)
AND DB 에 row 가 추가되지 않는다

---

## Quality Gate Criteria (Definition of Done)

- [ ] 신규 11 테스트 파일 모두 통과 + 85%+ coverage on `src/lib/eval/*` AND `src/app/api/admin/eval/*` AND `src/components/admin/eval-*.tsx` (`pnpm test --coverage`)
- [ ] 기존 테스트 전체 통과 (회귀 없음)
- [ ] migration 033 적용 후 `pnpm build` 성공
- [ ] `eval_golden_queries`, `eval_judgments`, `eval_runs` 3 테이블 모두 RLS 활성화 확인 (`SELECT relrowsecurity FROM pg_class WHERE relname IN (...)`)
- [ ] `tests/integration/eval-rls.test.ts` 통과 (REQ-005 자동 verification, CI 게이트 — Scenario 5.1, 5.2 모두 자동화)
- [ ] `docs/features/search-engine.md`, `docs/ARCHITECTURE.md`, `docs/infra/data-model.md` 3 doc 갱신 (필수 동기화 doc 3종)
- [ ] characterization tests (queue, golden) 통과로 기존 두 탭 회귀 없음 입증
- [ ] MX 태그 추가 완료: `@MX:NOTE` × 3 (ndcg.ts, precision.ts, 033 migration), `@MX:WARN` × 1 (run route), `@MX:TODO` × 1 (judgment-store v6 routing)
- [ ] TRUST 5 게이트 모든 5 차원 통과 (Tested/Readable/Unified/Secured/Trackable)
