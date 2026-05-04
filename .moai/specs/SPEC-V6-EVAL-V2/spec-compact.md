---
id: SPEC-V6-EVAL-V2
version: 0.1.1
status: draft
created: 2026-05-04
updated: 2026-05-04
author: MoAI orchestrator (manager-spec)
priority: high
issue_number: 0
source: spec.md (auto-extracted compact view, regenerated for v0.1.1)
---

# SPEC-V6-EVAL-V2 — Compact

## HISTORY

- 2026-05-04 v0.1.1: Regenerated per iter-2 spec.md changes. REQ-002 → 002a + 002b. Total REQ=4, scenarios=9, files=7 (6 core + 1 precondition).

## Requirements (EARS) — 총 4 REQ

### REQ-V6-EVAL-V2-001 (Event-driven) — `/api/admin/eval/run` 응답 확장

WHEN 어드민이 `POST /api/admin/eval/run` 에 valid body (`{goldenQueryId, algorithmVersion}`) 를 전송하고 가드 + routeAlgorithmVersion + search-products 호출이 성공하여 upsertJudgment 가 적어도 1건 성공할 때, 시스템 SHALL 응답 body 에 `judgmentRows: Array<{id, productId, productKey}>` 필드를 포함한다.

[HARD] 기존 응답 필드 (`rankedProducts`, `judgmentRowsCreated`) 보존 — backward compatible.
[HARD] search-products 5xx 시 502 응답 + `judgmentRows` 키 자체를 응답 객체에서 omit (빈 배열 두지 않음).

### REQ-V6-EVAL-V2-002a (Event-driven) — Labeling Form Mount-time Mapping + Grade 버튼 Enable

WHEN `EvalLabelingForm` 이 마운트/`executeRun` 후 run 응답에서 `judgmentRows` 를 수신하면, 시스템 SHALL 각 product 카드의 `judgmentId`/`productId` 를 `productKey === product.link` 매칭으로 채우고 매핑된 grade 버튼 (0/1/2/3) 의 `disabled` 를 `false` 로 설정한다.

[HARD] judgmentRows 빈 배열 시 "라벨링 가능한 상품이 없습니다" 안내 + 모든 grade 버튼 `disabled=true` 유지.
[HARD] 기존 missing GET (`loadJudgments`) 폴백 + index 매칭 fallback + graceful degrade 토스트 제거.

### REQ-V6-EVAL-V2-002b (Event-driven) — Grade 버튼 Click-time PATCH 호출

WHEN 사용자가 grade 버튼 (0~3) 을 클릭하면, 시스템 SHALL `PATCH /api/admin/eval/judgments/{judgmentId}` 를 매핑된 정확한 id (REQ-002a 에서 채워진 값) 와 `{relevanceGrade: <0..3>}` body 로 호출한다.

[HARD] 동일 카드 재변경 시 동일 judgmentId 로 PATCH (mount 후 변하지 않음). 다른 카드 PATCH 미발생 (격리).
[HARD] 기존 optimistic update + revert-on-failure 보존.

### REQ-V6-EVAL-V2-003 (Event-driven) — Golden Queries Seed Script

WHEN 운영자가 `pnpm tsx scripts/seed-eval-golden-queries.ts` 를 실행하면, 시스템 SHALL service-role 클라이언트로 `analyses` (`created_at DESC LIMIT 30`) SELECT, query_signature (prompt_text 우선) + intent_note 를 derive, `eval_golden_queries` 에 UPSERT (`onConflict: 'instagram_url,query_signature'`, `ignoreDuplicates: true`) 한다.

[HARD] **onConflict target = `(instagram_url, query_signature)`** — migration 033 line 33-34 의 UNIQUE INDEX `eval_golden_queries_identity_unique ... NULLS NOT DISTINCT` 와 정확 일치.
[HARD] 콘솔 출력 4 라인 (canonical order):
1. `total candidates: <n>`
2. `seeded: <n>`
3. `skipped (duplicate): <n>`
4. `skipped (invalid): <n>`
[HARD] 빈 analyses → exit 0 + 모든 카운트 0. 환경변수 부재 → fail-fast exit 1. analyses 에 `instagram_url` 컬럼 없음 → eval_golden_queries.instagram_url=NULL. 1회성 시드 도구 (cron 금지).

---

## Acceptance Scenarios (Compressed Given/When/Then) — 총 9 시나리오

### REQ-001 (2건)
1. **GIVEN** approved admin + Q1 row + products P_A/P_B + search-products mock → **WHEN** POST /api/admin/eval/run → **THEN** 200 + `judgmentRows: [{id, productId: P_A, productKey: link_A}, ...]` + 기존 필드 보존
2. **GIVEN** search-products mock 503 → **WHEN** POST /api/admin/eval/run → **THEN** 502 + `{error, code: SEARCH_PRODUCTS_FAILED}` + **judgmentRows 키 omit (필드 부재)** + DB INSERT 0

### REQ-002a (2건)
1. **GIVEN** EvalLabelingForm 마운트 + fetch mock 이 judgmentRows: [{id:J_A, productKey:link_A}, ...] 응답 → **WHEN** 자동 executeRun → **THEN** 모든 grade 버튼 enabled + 첫 카드에 judgmentId="J_A"/productId="P_A" 매핑 + 안내 미표시
2. **GIVEN** EvalLabelingForm 마운트 + fetch mock 이 judgmentRows: [] 응답 → **WHEN** 자동 executeRun → **THEN** "라벨링 가능한 상품이 없습니다" 안내 표시 + 모든 grade 버튼 disabled=true 유지 + PATCH 호출 0

### REQ-002b (2건)
1. **GIVEN** Scenario 2a.1 상태 → **WHEN** 첫 카드 grade=2 클릭 → **THEN** PATCH /api/admin/eval/judgments/J_A body={relevanceGrade:2} + 첫 카드 grade=2 버튼에 [data-active='true'] + 두 번째 카드 PATCH 미발생
2. **GIVEN** Scenario 2b.1 후 → **WHEN** 동일 첫 카드 grade=3 클릭 → **THEN** PATCH /api/admin/eval/judgments/J_A body={relevanceGrade:3} (동일 id) + [data-active='true'] grade=3 으로 이동 + 두 번째 카드 PATCH 미발생 (누적 PATCH = 2 모두 J_A)

### REQ-003 (3건)
1. **GIVEN** env 정상 + analyses 빈 테이블 → **WHEN** seed script 실행 → **THEN** stdout (canonical 4 라인): `total candidates: 0` / `seeded: 0` / `skipped (duplicate): 0` / `skipped (invalid): 0` + exit 0 + DB INSERT 0
2. **GIVEN** env 정상 + analyses 30 valid row + eval_golden_queries 빈 테이블 → **WHEN** 첫 실행 → **THEN** `total candidates: 30` / `seeded: 30` / `skipped (duplicate): 0` / `skipped (invalid): 0` + DB row 30. **WHEN** 즉시 두 번째 실행 → **THEN** `total candidates: 30` / `seeded: 0` / `skipped (duplicate): 30` / `skipped (invalid): 0` + DB row 여전히 30
3. **GIVEN** env 정상 + analyses 5 row (3 valid + 2 invalid: prompt_text=NULL && items=[]) → **WHEN** seed 실행 → **THEN** `total candidates: 5` / `seeded: 3` / `skipped (duplicate): 0` / `skipped (invalid): 2` + DB INSERT 정확히 3 + exit 0 (abort 없음)

---

## Files to Create / Modify

### Core scope (6 files: 3 NEW + 3 MODIFY)

**NEW (3):**
- `scripts/seed-eval-golden-queries.ts` (~50 LOC)
- `src/components/admin/eval-labeling-form.test.tsx` (4 케이스: REQ-002a × 2 + REQ-002b × 2)
- `scripts/seed-eval-golden-queries.test.ts` (3 케이스: 빈/정상+idempotent/invalid 분기)

**MODIFY (3):**
- `src/app/api/admin/eval/run/route.ts` (~10 LOC delta — judgmentRows 응답 추가)
- `src/components/admin/eval-labeling-form.tsx` (~15 LOC delta — loadJudgments 제거 + judgmentRows 매핑 + grade 활성화 + 빈 배열 안내)
- `src/app/api/admin/eval/run/route.test.ts` (+1 신규 케이스, 기존 5 보존 → 총 6)

### Run-phase precondition (+1 MODIFY)

- `package.json` — D9 검증 결과 `tsx` 부재 → `pnpm add -D tsx` 실행 (`devDependencies.tsx` 추가, 1 LOC delta). 옵션: `seed:eval` npm script 추가.

**Total: 7 파일 (= 6 core + 1 precondition)**

---

## Exclusions (NOT in scope)

- LLM-as-judge 자동 채점 → SPEC-V6-AUTOMATION
- A/B 좌우 비교 UI → 별도 SPEC
- 골든셋 100/300 확장 → SPEC-V6-EVAL-V3
- v6 알고리즘 라우팅 unblock (`routeAlgorithmVersion('v6')` throw 유지) → SPEC-V6-CORE
- analyses 외 출처에서 시드 (프로덕션 IG URL 자동 샘플링) → SPEC-V6-AUTOMATION
- seed script 의 cron 화 / 스케줄링 → SPEC-V6-AUTOMATION
- compute / freeze-baseline 라우트 동작 변경 (부모 SPEC 영역)
- labeling-form 의 다른 UX 개선 (loading / error 디자인) — 본 SPEC 은 unblock 만
- run/route.ts 응답에 judgmentRows 외 다른 필드 추가
- 별도 GET `/api/admin/eval/judgments?goldenQueryId=...` 엔드포인트 신규 작성
- staging / 실제 배포 환경 통합 검증 (Vitest 통합 테스트로만 검증)

---

## Cross-Reference

- 부모 SPEC: `.moai/specs/SPEC-V6-EVAL/`
- 부모 REQ-V6-EVAL-002 step 3 (`PATCH /api/admin/eval/judgments/{id}`) → 본 REQ-001/002a/002b 가 호출 경로 unblock
- 부모 REQ-V6-EVAL-001 (Golden Set CRUD) → 본 REQ-003 이 시드 데이터 공급
- 부모 migration: `supabase/migrations/033_eval_v6_tables.sql` line 33-34 (UNIQUE INDEX `(instagram_url, query_signature) NULLS NOT DISTINCT`) — seed script onConflict target 의 sourcecode 위치
- 알고리즘 / 스키마 / RLS / NDCG·Precision 산식은 부모 SPEC 단일 진실 원천
