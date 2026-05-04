---
id: SPEC-V6-EVAL-V2
version: 0.1.1
status: draft
created: 2026-05-04
updated: 2026-05-04
author: MoAI orchestrator (manager-spec)
priority: high
issue_number: 0
---

# SPEC-V6-EVAL-V2 — Eval Labeling Unblock + Golden Set Seed

## HISTORY

- 2026-05-04 v0.1.1: Iter 2 revisions per plan-audit iter-1 (9 defects 처리). Frontmatter 8 fields 정규화 (D1). REQ-002 분리: 002a (mount→mapping/enable) + 002b (click→PATCH) (D2). Scenario 1.2 disjunction 제거 — judgmentRows 필드 omit 단일 contract (D3). onConflict target 명시: `(instagram_url, query_signature)` NULLS NOT DISTINCT — migration 033 line 33-34 직접 확인 (D4). Scenario 2a 의 weasel word 제거 (D5). DoD disjunction 단일화 — staging 옵션 제거 (D6). stdout 4 라인 canonical order 통일 (D7). Affected files 재정합 — package.json 별도 precondition 처리 (D8). tsx 의존성 검증: package.json 부재 확인 → Run-phase precondition 으로 명시 (D9). Total scenario 7 → 9.
- 2026-05-04 v0.1.0: Initial draft (Plan workflow). 사용자 결정 4종 (judgmentRows 응답 / labeling 활성화 / analyses 시드 / idempotency UPSERT) 을 EARS 3 REQ 로 박제. Phase 1B (labeling unblock) + Phase 2 (seed) 통합. Skip: 0.3.1 인터뷰 / 0.5 deep research / 1.25 디자인 (사용자 명시).

## Overview

부모 SPEC `SPEC-V6-EVAL` 머지 후 남은 두 갭을 unblock 하는 활성화 작업.

1. **Labeling 플로우 사용 가능화**: 현재 `eval-labeling-form.tsx` 가 `judgmentId` 미수령으로 grade 버튼 disabled. `/api/admin/eval/run` 응답에 judgment row id/productId 메타 추가 + 프론트가 그 매핑으로 PATCH 호출.
2. **30 골든셋 시드**: 기존 `analyses` 테이블 트래픽에서 `created_at DESC` 30 row 를 `eval_golden_queries` 로 변환하는 1회성 스크립트. UPSERT 로 idempotent.

스코프 경계는 명확하다 — **부모 SPEC 의 산출물을 사용 가능 상태로 진입시키는 활성화만**. 부모 SPEC 의 알고리즘 / 스키마 / RLS 정책 / NDCG·Precision 산식은 본 SPEC 에서 재서술하지 않는다 (단일 진실 원천 룰: 부모 `.moai/specs/SPEC-V6-EVAL/spec.md` 참조).

## Cross-Reference

- 부모 SPEC: `.moai/specs/SPEC-V6-EVAL/`
  - REQ-V6-EVAL-002 (Algorithm Run + Judgment Persistence) — 본 SPEC REQ-001/002a/002b 가 그 step 3 (`PATCH /api/admin/eval/judgments/{id}`) 의 호출 경로를 unblock
  - REQ-V6-EVAL-001 (Golden Set Admin CRUD) — 본 SPEC REQ-003 이 그 테이블에 시드 데이터 공급
- 부모 migration: `supabase/migrations/033_eval_v6_tables.sql` line 33-34 (UNIQUE INDEX 정의)

## Goals (EARS-format requirements)

총 4 REQ (REQ-002 분리: 002a mount-time mapping + 002b click-time PATCH).

### REQ-V6-EVAL-V2-001 (Event-driven) — `/api/admin/eval/run` 응답 확장

WHEN 어드민이 `POST /api/admin/eval/run` 에 valid body (`{ goldenQueryId, algorithmVersion }`) 를 전송하고 서버가 `requireApprovedAdmin()` 가드를 통과하며 `routeAlgorithmVersion` 검증을 통과하고 `/api/search-products` 내부 호출이 성공하여 top-10 product 의 upsertJudgment 가 적어도 1건 이상 성공할 때, 시스템 SHALL 응답 body 에 `judgmentRows: Array<{ id: string; productId: string; productKey: string }>` 필드를 포함하여 반환한다.

세부 contract:
- `judgmentRows` 의 각 entry 는 `upsertJudgment()` 가 반환한 `JudgmentLoaded.id` (uuid), `JudgmentLoaded.productId` (uuid), 그리고 호출 시점의 `productKey(p)` (= `p.link`, 안정 키) 를 가진다
- 기존 응답 필드 (`rankedProducts`, `judgmentRowsCreated`) 는 보존 — backward compatible
- `upsertJudgment` 실패 (예: products 미발견, unique 위반) row 는 `judgmentRows` 에서 제외 (현재 catch 블록과 정합)
- search-products 호출 실패 시 기존 502 응답 유지. **`judgmentRows` 필드 자체를 응답 객체에서 omit (빈 배열로 두지 않음)** — 502 contract 명시.

[HARD] `productKey` 와 `productId` 둘 다 응답에 포함되는 이유: 프론트엔드가 `rankedProducts` 의 `link` (productKey) 로 매핑할 수 있고, 향후 productId 직접 사용 경로 확장 시 호환.

### REQ-V6-EVAL-V2-002a (Event-driven) — Labeling Form Mount-time Mapping + Grade 버튼 Enable

WHEN `EvalLabelingForm` 컴포넌트가 마운트되거나 `executeRun` 이 트리거되어 `/api/admin/eval/run` 의 응답에서 `judgmentRows` 를 수신하면, 시스템 SHALL 각 product 카드의 `judgmentId` 와 `productId` 를 `judgmentRows` 의 `productKey === product.link` 매칭으로 채우고, 매핑된 모든 grade 버튼 (0/1/2/3) 의 `disabled` 속성을 `false` 로 설정한다.

세부 contract:
- 기존 `loadJudgments` 함수와 missing GET 시도 (`/api/admin/eval/judgments?goldenQueryId=...`) 및 index 매칭 fallback 코드는 제거
- 기존 graceful degrade 텍스트 ("judgment ID 없음 — 검색을 다시 실행해주세요" 토스트) 는 활용 가능 상태에서 제거
- judgmentRows 가 빈 배열인 경우 (예: 모든 upsert 실패) 사용자에게 "라벨링 가능한 상품이 없습니다" 안내 표시 + grade 버튼은 `disabled=true` 유지
- 기존 컴포넌트 외부 인터페이스 (`Props { goldenQueryId, algorithmVersion }`) 는 변경 금지

### REQ-V6-EVAL-V2-002b (Event-driven) — Grade 버튼 Click-time PATCH 호출

WHEN 사용자가 임의 product 카드의 grade 버튼 (0/1/2/3 중 하나) 을 클릭하면, 시스템 SHALL `PATCH /api/admin/eval/judgments/{judgmentId}` 를 매핑된 정확한 `judgmentId` (REQ-002a 에서 채워진 값) 와 `{ relevanceGrade: <0..3> }` body 로 호출한다.

세부 contract:
- 기존 optimistic update + revert-on-failure 로직은 보존
- 동일 카드의 grade 재변경 시 동일 `judgmentId` 로 PATCH (id 는 mount 후 변하지 않음)
- 다른 카드의 grade 클릭은 다른 `judgmentId` 로 PATCH (격리)
- PATCH 실패 (non-2xx) 시 grade 시각 표시 revert + 에러 토스트

### REQ-V6-EVAL-V2-003 (Event-driven) — Golden Queries Seed Script

WHEN 운영자가 `pnpm tsx scripts/seed-eval-golden-queries.ts` (또는 동등 npm script) 를 실행하면, 시스템 SHALL Supabase service-role 클라이언트로 `analyses` 테이블에서 `created_at DESC` 순 최대 30 row 를 SELECT 하고, 각 row 에 대해 `query_signature` (prompt_text 우선, items[0].searchQuery 차선) 와 `intent_note` (prompt_text 첫 200자 우선, items[0].searchQuery 차선) 를 derive 한 뒤, `eval_golden_queries` 테이블에 UPSERT 한다.

세부 contract:
- analyses 의 `instagram_url` 컬럼이 존재하지 않으므로 `eval_golden_queries.instagram_url` 은 NULL 로 INSERT (부모 SPEC dual identity 룰: instagram_url nullable + query_signature NOT NULL when instagram_url NULL)
- **onConflict target: `(instagram_url, query_signature)`** — migration 033 line 33-34 의 `CREATE UNIQUE INDEX eval_golden_queries_identity_unique ON eval_golden_queries (instagram_url, query_signature) NULLS NOT DISTINCT` 와 정확히 일치. PostgreSQL 15+ NULLS NOT DISTINCT 가 NULL instagram_url + 동일 query_signature 조합도 중복으로 처리.
- Supabase JS client 호출: `.upsert([...], { onConflict: 'instagram_url,query_signature', ignoreDuplicates: true })`
- 둘 다 derive 불가능한 row (prompt_text NULL && items 빈 배열) 는 skip + 에러 카운트 증가
- 표준 출력 4 라인 (canonical order):
  1. `total candidates: <n>`
  2. `seeded: <n>`
  3. `skipped (duplicate): <n>`
  4. `skipped (invalid): <n>`
- exit code: 정상 종료 0, fatal Supabase 에러 시 1
- 재실행 안전: 동일 dataset 두 번째 실행 시 INSERT 0 / `skipped (duplicate): N` (idempotent)
- service-role 키 (`SUPABASE_SERVICE_ROLE_KEY`) 부재 시 fail-fast (clear error message)
- analyses 가 빈 테이블이면 정상 종료 (`seeded: 0`, exit 0)

[HARD] 본 스크립트는 1회성 시드 도구. cron / scheduling / 자동 실행 코드 금지 (NOT in scope — V6-AUTOMATION).

## Acceptance Criteria

상세 Given/When/Then 시나리오는 `acceptance.md` 참고. 최소 커버리지:

- REQ-V6-EVAL-V2-001: 2건 (judgmentRows 정상 응답 1 + search-products 5xx 시 502 + judgmentRows 필드 omit 1)
- REQ-V6-EVAL-V2-002a: 2건 (마운트 → judgmentRows 매핑 → 모든 grade 버튼 enabled 1 + 빈 judgmentRows → 안내 + 버튼 disabled 유지 1)
- REQ-V6-EVAL-V2-002b: 2건 (첫 클릭 PATCH 정확 호출 1 + 재클릭 grade 변경 시 동일 id 로 PATCH 1)
- REQ-V6-EVAL-V2-003: 3건 (빈 analyses → 0 INSERT 1 + 30 row → 30 INSERT + idempotent 재실행 → 0 INSERT 1 + invalid row 분리 1)

총 9 시나리오 (사양 floor: 8 = 4 REQ × ≥2).

## What NOT to Build (Exclusions)

- LLM-as-judge 자동 채점 → SPEC-V6-AUTOMATION
- A/B 좌우 비교 UI → 별도 SPEC
- 골든셋 100/300 확장 → SPEC-V6-EVAL-V3
- v6 알고리즘 라우팅 unblock (`routeAlgorithmVersion('v6')` throw 유지) → SPEC-V6-CORE
- analyses 외 출처에서 시드 (프로덕션 IG URL 자동 샘플링) → SPEC-V6-AUTOMATION
- seed script 의 cron 화 / 스케줄링 → SPEC-V6-AUTOMATION
- compute / freeze-baseline 라우트 동작 변경 (부모 SPEC 영역)
- labeling-form 의 다른 UX 개선 (loading skeleton 변경, error toast 디자인 변경) — 본 SPEC 은 unblock 만
- run/route.ts 응답에 judgmentRows 외 다른 필드 추가
- 별도 GET `/api/admin/eval/judgments?goldenQueryId=...` 엔드포인트 신규 작성 (응답 확장으로 해결)
- staging / 실제 배포 환경에서의 통합 검증 (Run phase 통합 테스트로만 검증)

## Affected Files

**Core scope: 6 파일 (3 NEW + 3 MODIFY)**
**Run-phase precondition: +1 MODIFY (package.json — tsx devDependency 추가, D9 검증 결과 부재)**
**총 7 파일 (= 6 core + 1 precondition)**

### [MODIFY] src/app/api/admin/eval/run/route.ts (~10 LOC delta)

- `upsertJudgment()` 호출 결과 (`JudgmentLoaded`) 를 누적
- 응답 body 에 `judgmentRows: Array<{ id, productId, productKey }>` 추가
- 기존 `rankedProducts`, `judgmentRowsCreated` 필드 보존
- 기존 `@MX:WARN` (search-products 호출 부하) 유지

### [MODIFY] src/components/admin/eval-labeling-form.tsx (~15 LOC delta)

- `loadJudgments` 함수 제거 (missing GET 폴백)
- `executeRun` 내부에서 run 응답의 `judgmentRows` 를 `Map<productKey, {id, productId}>` 로 변환
- 각 product 카드 렌더링 시 매핑된 `judgmentId` / `productId` 주입
- grade 버튼의 `disabled={!row.judgmentId}` 가 정상 동작 (judgmentId 가 항상 존재)
- 기존 외부 props 인터페이스 (`goldenQueryId`, `algorithmVersion`) 보존

### [MODIFY] src/app/api/admin/eval/run/route.test.ts (+1 신규 케이스)

- 기존 5 케이스 보존
- 신규 1 케이스: happy path 응답에 `judgmentRows` 가 포함되는지 + 각 entry 가 `{id, productId, productKey}` shape 인지 검증

### [NEW] scripts/seed-eval-golden-queries.ts (~50 LOC)

- Supabase service-role 클라이언트 초기화 (env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- analyses SELECT (`created_at DESC LIMIT 30`)
- query_signature / intent_note derive 함수
- eval_golden_queries UPSERT (`onConflict: 'instagram_url,query_signature'`, `ignoreDuplicates: true`)
- 콘솔 출력 4 라인 (canonical order: total candidates / seeded / skipped duplicate / skipped invalid)
- exit code handling

### [NEW] src/components/admin/eval-labeling-form.test.tsx

- RTL + Vitest + jsdom
- 신규 케이스 4 (REQ-002a 2 + REQ-002b 2):
  - 케이스 A1 (002a): 마운트 → run fetch mock (judgmentRows 포함) → 모든 grade 버튼 enabled (disabled=false 검증)
  - 케이스 A2 (002a): 마운트 → run fetch mock (judgmentRows 빈 배열) → "라벨링 가능한 상품이 없습니다" 안내 표시 + grade 버튼 disabled=true 유지
  - 케이스 B1 (002b): grade 버튼 클릭 → PATCH `/api/admin/eval/judgments/{id}` 가 정확한 judgmentId 와 body 로 호출되는지 (fetch spy)
  - 케이스 B2 (002b): 동일 카드 재클릭 grade 변경 → 동일 judgmentId 로 PATCH 재호출 + 다른 카드 PATCH 미발생

### [NEW] scripts/seed-eval-golden-queries.test.ts

- Vitest 단위 테스트 (Supabase 클라이언트 mock)
- 케이스 3:
  - 케이스 A: analyses fixture 30 row → 변환 결과가 query_signature 포함 30 entry
  - 케이스 B: prompt_text 와 items 모두 NULL 인 row → skip + invalid 카운트 증가
  - 케이스 C: 동일 (instagram_url=NULL, query_signature) 중복 → 두 번째 실행 시 INSERT 0 (UPSERT skip)

### [MODIFY] package.json (Run-phase precondition)

- D9 검증 결과: `tsx` 가 현재 devDependencies 에 부재 (line 39-57 확인)
- Run phase 시작 시 `pnpm add -D tsx` 실행 → package.json `devDependencies.tsx` 추가 (1 LOC delta)
- 옵션: `"seed:eval": "tsx scripts/seed-eval-golden-queries.ts"` npm script 추가 (편의용; acceptance 는 `pnpm tsx` 직접 실행 형태로 정의됨)

## MX Tag Plan

- `@MX:NOTE` — `scripts/seed-eval-golden-queries.ts:deriveSignature` (analyses → query_signature 변환 의도; pure function, fan_in=1)
- `@MX:NOTE` — `src/app/api/admin/eval/run/route.ts` 의 judgmentRows 누적 블록 (기존 `@MX:WARN` 은 유지) — "[AUTO] V2 추가: judgmentRows 응답 확장. SPEC-V6-EVAL-V2 REQ-001 ref."
- 신규 `@MX:WARN` / `@MX:ANCHOR` 추가 없음 (delta 가 작고 fan_in 변화 없음)
- 부모 SPEC 의 `@MX:TODO` (judgment-store routeAlgorithmVersion v6) 는 본 SPEC 범위 외 — 유지

## Reference Implementations

- 부모 SPEC research.md (admin/eval 모듈 패턴, Supabase service-role 사용 패턴)
- `src/lib/eval/judgment-store.ts:upsertJudgment` — 반환 타입 `JudgmentLoaded` 의 `id` 필드 직접 활용
- `src/app/api/admin/eval/run/route.ts` 현재 구조 — 응답 shape 확장 패턴
- 기존 admin route 테스트 패턴 (run/route.test.ts 의 5 케이스가 fetch / Supabase mock 예시 제공)
- `supabase/migrations/001_create_analyses.sql` + `011_add_prompt_text.sql` — analyses 컬럼 (image_filename, prompt_text, items, created_at)
- `supabase/migrations/033_eval_v6_tables.sql` line 33-34 — UNIQUE INDEX 정확한 컬럼 셋 (`instagram_url, query_signature` NULLS NOT DISTINCT)

## Risks (요약)

| Risk | Mitigation |
|---|---|
| `judgmentRows` 추가가 기존 클라이언트 호출 (이전 frontend) 에 영향 | 기존 응답 필드 보존, 추가 필드만 적용 — backward compatible |
| analyses 의 prompt_text NULL row (image-only 분석) | items[0].searchQuery fallback → 그것도 없으면 skip + invalid 카운트 |
| seed script 가 production DB 에 잘못 실행 | service-role 키 환경변수 필수, 부재 시 fail-fast. SUPABASE_URL 출력으로 환경 가시화 |
| upsertJudgment 의 onConflict 동작이 동일 product 재시도 시 새 id 부여 | judgment-store.ts 가 onConflict update 로 동일 row 보장 (기존 검증됨) |
| labeling-form 테스트의 fetch mock 누락으로 실제 네트워크 호출 | RTL + vi.spyOn(global, 'fetch') 또는 MSW 로 격리 보장 |
| seed script 의 onConflict target 이 migration 033 와 mismatch | migration 033 line 33-34 직접 확인 — `(instagram_url, query_signature) NULLS NOT DISTINCT` 정확 일치 적용 |
