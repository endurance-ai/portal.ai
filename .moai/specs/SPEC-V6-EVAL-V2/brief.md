# SPEC-V6-EVAL-V2 — Brief (manager-spec input)

생성일: 2026-05-04 (`/moai plan` 진입 정렬 단계)
작성자: MoAI orchestrator (사용자 4-question 답변 박제, Phase 1B + Phase 2 통합)
부모 SPEC: `.moai/specs/SPEC-V6-EVAL/`
다음 단계: `/moai plan SPEC-V6-EVAL-V2` → manager-spec 가 본 brief 기반으로 spec.md / plan.md / acceptance.md 작성

---

## 1. SPEC 미션 한 줄

SPEC-V6-EVAL 이 disable 상태로 남긴 **end-to-end 라벨링 플로우를 unblock** 하고, 기존 `analyses` 트래픽으로부터 **30 골든셋 쿼리를 시드**한다 (Phase 1B + Phase 2 통합 산출물).

## 2. 왜 V2 가 필요한가

부모 SPEC-V6-EVAL 머지 후 다음 두 갭이 남았다:

1. **labeling 사용 불가**: `eval-labeling-form.tsx` 가 `judgmentId` 를 받아오지 못해 grade 버튼이 모두 disabled. `/api/admin/eval/run` 응답에 judgment row 메타데이터가 빠져 있고, 폴백으로 시도한 GET 엔드포인트(`/api/admin/eval/judgments?goldenQueryId=...`) 는 미구현.
2. **golden set 비어 있음**: `eval_golden_queries` 테이블은 만들어졌으나 row 가 0개. CRUD UI 로 한 건씩 손으로 채우는 방식은 30개 시드를 위해 비효율.

이 둘을 해결해야 부모 SPEC 의 baseline freeze (REQ-V6-EVAL-004) 가 실제로 실행 가능. 따라서 V2 는 부모 SPEC 의 산출물이 사용 가능한 상태로 진입하는 **활성화 작업**.

## 3. 사용자 결정 (확정 — manager-spec 가 재질문 금지)

| 결정 항목 | 선택 |
|---|---|
| **Backend 응답 변경** | `/api/admin/eval/run` 에 `judgmentRows: Array<{id, productId, productKey}>` 추가 (~10 LOC) |
| **Frontend 활성화 방식** | run 응답의 judgmentRows 를 product 별로 매핑 → grade 버튼 활성화 → PATCH 시 그 id 사용. 기존 폴백 GET 코드 제거 |
| **시드 출처** | 기존 `analyses` 테이블 (`created_at DESC` 30건); intent_note 는 `prompt_text` 첫 200자 또는 `items[0].searchQuery` 로 자동 생성 |
| **시드 idempotency** | UPSERT on `instagram_url` (또는 query_signature 기반 ON CONFLICT DO NOTHING) — 재실행 안전 |
| **Skip 항목** | 0.3.1 사용자 인터뷰 / 0.5 deep research / 1.25 디자인 단계는 사용자 명시적으로 스킵 |

## 4. NOT in scope (이번 SPEC 에서 제외)

- LLM-as-judge 자동 채점 → SPEC-V6-AUTOMATION
- A/B 좌우 비교 UI → 별도 SPEC
- 골든셋 100/300 확장 → SPEC-V6-EVAL-V3
- v6 알고리즘 라우팅 unblock (`routeAlgorithmVersion('v6')` throw 유지) → SPEC-V6-CORE
- analyses 외 출처에서 시드 (프로덕션 IG URL 자동 샘플링) → SPEC-V6-AUTOMATION
- seed script 의 cron 화 → SPEC-V6-AUTOMATION
- Compute / Freeze 라우트 변경 (부모 SPEC 의 영역, 본 SPEC 은 unblock 만)

## 5. 예상 산출물

### Backend (~10 LOC delta)
- `src/app/api/admin/eval/run/route.ts` 수정
  - 기존 `judgmentRowsCreated: number` 카운트 외에, `judgmentRows: Array<{id, productId, productKey}>` 누적 후 응답 포함
  - `productKey` 는 product.link (현재 stable key 로 사용 중)

### Frontend (~15 LOC delta)
- `src/components/admin/eval-labeling-form.tsx` 수정
  - `loadJudgments` 함수 제거 (missing GET 폴백 로직 + index 매칭 fallback)
  - run 응답에서 `judgmentRows` 받아 `productKey → judgmentId` Map 생성
  - 각 product 카드에 `judgmentId` 매핑 → grade 버튼 활성화
  - PATCH 호출 시 매핑된 `judgmentId` 사용 (기존 로직 그대로)

### Seed script (~50 LOC)
- `scripts/seed-eval-golden-queries.ts` 신규
  - Supabase service-role 클라이언트로 `analyses` 테이블 SELECT (`created_at DESC LIMIT 30`)
  - 컬럼 셀렉트: `id, image_filename, prompt_text, items, created_at`
  - 각 row 에서:
    - `query_signature`: prompt_text 가 있으면 prompt_text 의 normalized hash, 없으면 items[0].searchQuery 의 normalized 버전
    - `intent_note`: prompt_text 첫 200자 또는 items[0].searchQuery (둘 다 없으면 image_filename 기반 fallback)
    - `instagram_url`: NULL (analyses 에 IG URL 컬럼이 없음 — query_signature 단독 식별)
  - `eval_golden_queries` 에 UPSERT (ON CONFLICT (query_signature) DO NOTHING) — idempotent
  - 출력: 시드된 row 수 + skip 된 row 수 (이미 존재) + 에러 카운트
  - 실행: `pnpm tsx scripts/seed-eval-golden-queries.ts` (또는 `package.json` 의 `seed:eval` npm script)

### 신규 테스트 (3)
- `src/app/api/admin/eval/run/route.test.ts` — 기존 5개 + 신규 1개 (`judgmentRows` 응답 포함 검증)
- `src/components/admin/eval-labeling-form.test.tsx` — 신규 (RTL: 마운트 → grade 버튼 활성화 → PATCH 호출 검증)
- `scripts/seed-eval-golden-queries.test.ts` — 신규 (analyses fixture → eval_golden_queries 변환 검증, 빈/중복 케이스)

## 6. 의존성 / 전제

- 부모 SPEC-V6-EVAL 머지 완료: `eval_golden_queries` / `eval_judgments` / `eval_runs` 테이블 + `judgment-store.ts:upsertJudgment` 가 이미 존재
- `upsertJudgment` 가 `JudgmentLoaded` (id 포함) 를 반환 — 그대로 활용
- Supabase service-role 키가 환경변수에 존재 (`SUPABASE_SERVICE_ROLE_KEY`) — RLS bypass 용
- `analyses` 테이블에 최소 1 row 존재 (시드 가능 상태). 0 row 환경에서는 "0 시드 / 0 skip" 출력 후 정상 종료

## 7. 성공 기준 (Acceptance criteria 초안)

- [ ] `/api/admin/eval/run` 응답이 `judgmentRows: Array<{id, productId, productKey}>` 포함 (모든 successful upsert 에 대해 1 entry)
- [ ] `eval-labeling-form.tsx` 에서 검색 실행 직후 모든 product 카드의 grade 버튼이 활성화 (judgmentId 존재 & disabled=false)
- [ ] grade 버튼 첫 클릭 시 `PATCH /api/admin/eval/judgments/{judgmentId}` 가 정확한 id 와 함께 호출됨 (RTL spy 로 검증)
- [ ] `scripts/seed-eval-golden-queries.ts` 실행 시:
  - 빈 analyses → 0 시드 / 0 skip / exit 0
  - 30 row 이상 → 정확히 30 INSERT (이미 존재하면 skip 카운트로)
  - 동일 query_signature 두 번째 실행 → 0 INSERT / 30 skip
- [ ] 기존 부모 SPEC 의 5 REQ 회귀 없음 (특히 RLS, freeze-baseline, compute 라우트 동작 보존)
- [ ] 신규 3 테스트 파일 모두 통과 + run/route.test.ts 의 기존 5 케이스 통과

## 8. 회피해야 할 함정

- **스코프 크리프**: judgmentRows 외에 다른 응답 필드 추가 금지. labeling-form 의 다른 UX 개선 (loading skeleton, error toast 변경 등) 금지. seed script 에 cron / scheduling 코드 금지
- **idempotency 누락**: seed script 가 매 실행마다 중복 INSERT 하면 골든셋이 더러워짐 → ON CONFLICT 처리 필수
- **service-role 키 누출**: seed script 는 `import "server-only"` 또는 `scripts/` 경로 (Next.js 빌드 미포함) 에서만 실행. 클라이언트 번들 진입 금지
- **테스트 격리**: labeling-form RTL 테스트는 `fetch` mock 으로 격리; 실제 Supabase 호출 금지
- **부모 SPEC 의 알고리즘/스키마 디테일 복제 금지**: dual identity, RLS 정책, NDCG/Precision 산식 등은 부모 SPEC 참조만, 본 SPEC 에 재서술 금지

## 9. Risks

| Risk | Mitigation |
|---|---|
| `upsertJudgment` 가 동일 product 중복 호출 시 같은 judgmentId 반환하지 않을 가능성 | upsertJudgment 의 onConflict (`golden_query_id, product_id, algorithm_version`) 로 단일 row 보장 (judgment-store.ts 검증됨) |
| analyses 의 `prompt_text` 가 NULL 인 row (image-only 분석) | items[0].searchQuery fallback → 그것도 없으면 image_filename → 그것도 없으면 skip + 에러 카운트 |
| seed script 가 production DB 에 잘못 실행 | service-role 키 환경변수 확인 + 실행 시 환경 명시 (`SUPABASE_URL` 출력) + 사용자 확인 프롬프트 (선택적) |
| run/route.ts 의 `judgmentRows` 응답 추가가 기존 클라이언트 (이전 버전 frontend) 에 영향 | 기존 응답 필드 (`rankedProducts`, `judgmentRowsCreated`) 보존, 추가 필드만 적용 — backward compatible |

## 10. manager-spec 에 전달할 추가 컨텍스트

- 코드베이스: `/Users/hansangho/Desktop/portal/app`
- 부모 SPEC 참조 doc:
  - `.moai/specs/SPEC-V6-EVAL/spec.md` (REQ-002 의 step 3 `PATCH /api/admin/eval/judgments/{id}` contract)
  - `.moai/specs/SPEC-V6-EVAL/research.md` (admin/eval 모듈 + judgment-store 패턴)
- 수정 대상:
  - `src/app/api/admin/eval/run/route.ts` (현재 응답 shape: `{ rankedProducts, judgmentRowsCreated }`)
  - `src/components/admin/eval-labeling-form.tsx` (현재 missing GET 폴백 + graceful degrade)
- 참조:
  - `src/lib/eval/judgment-store.ts` (upsertJudgment 가 `JudgmentLoaded` 반환 — id 포함)
  - `supabase/migrations/001_create_analyses.sql`, `002_normalize_tables.sql`, `003_add_style_node_columns.sql`, `011_add_prompt_text.sql` (analyses 스키마)
- 테스트 패턴: `src/app/api/admin/eval/run/route.test.ts` (이미 5 케이스 존재) — RTL + Vitest

---

> 이 brief 는 `/moai plan SPEC-V6-EVAL-V2` 의 input 입니다. manager-spec 가 spec.md / plan.md / acceptance.md / spec-compact.md 4 산출물을 `.moai/specs/SPEC-V6-EVAL-V2/` 에 작성합니다.
