---
id: SPEC-V6-EVAL-V2
version: 0.1.1
status: draft
created: 2026-05-04
updated: 2026-05-04
author: MoAI orchestrator (manager-spec)
priority: high
issue_number: 0
methodology: Brownfield TDD (3 atomic tasks, small delta — RED-GREEN-REFACTOR fits all 3)
---

# SPEC-V6-EVAL-V2 — Implementation Plan

## HISTORY

- 2026-05-04 v0.1.1: Iter 2 revisions per plan-audit iter-1 (9 defects 처리). Frontmatter 8 fields 정규화 + `spec_id` → `id` 통일 (D1). REQ-002 분리에 따른 V2-T-002 task 갱신 (2a + 2b 합쳐 4 케이스) (D2). seed script onConflict target 정확화: `(instagram_url, query_signature)` NULLS NOT DISTINCT (D4). stdout canonical order 통일 (D7). Affected files 재정합 — package.json precondition (D8). tsx 의존성 확인: 부재 → Run-phase precondition `pnpm add -D tsx` 명시 (D9). hedging 문구 ("또는 동등 부모 SPEC unique 제약 기준") 삭제.
- 2026-05-04 v0.1.0: Initial plan draft. 3 atomic tasks (V2-T-001 backend / V2-T-002 frontend / V2-T-003 seed script). 순서: T-001 → T-002 (의존), T-003 독립 (병렬 가능). 신규 의존성 없음.

## Tech Stack (현행 portal.ai 스택 유지)

- 프레임워크: Next.js 16 App Router + React 19 (`src/app/api/admin/eval/run/route.ts`, `src/components/admin/eval-labeling-form.tsx`)
- 테스트: Vitest 4 + @testing-library/react (jsdom env, vitest.config.ts 그대로)
- DB: Supabase Postgres (`@supabase/supabase-js` 기존 클라이언트)
- Script runtime: `tsx` — **D9 검증: package.json line 39-57 확인 결과 부재**. Run-phase precondition: `pnpm add -D tsx` (package.json 1 LOC delta — 1 MODIFY 로 카운트)
- Auth: 기존 `requireApprovedAdmin()` (route 가드 유지)
- 신규 npm 패키지: 1 (tsx — devDependency)

## Methodology Selection — Brownfield TDD (3 atomic tasks)

3 deliverable 모두 신규 추가 또는 작은 delta (~10-50 LOC). pure function 성격 (seed 변환 함수, response shape 확장) 이 강하고 외부 의존성은 mock 으로 격리 가능. 따라서 RED-GREEN-REFACTOR 가 자연스럽다.

| Task | Methodology | 이유 |
|---|---|---|
| V2-T-001 (run/route.ts) | Brownfield TDD | 응답 shape 확장 (1 신규 케이스) — RED 로 실패 케이스 작성 후 GREEN |
| V2-T-002 (eval-labeling-form.tsx) | Brownfield TDD | RTL 로 grade 활성화 + PATCH 호출 검증 — fetch mock 으로 격리. REQ-002a (2 케이스) + REQ-002b (2 케이스) = 4 신규 케이스 |
| V2-T-003 (seed script) | Brownfield TDD | analyses fixture → 변환 결과 검증 (pure 변환 + Supabase upsert mock) |

부모 SPEC 의 DDD ANALYZE-PRESERVE-IMPROVE 는 본 SPEC 의 작은 delta 에는 과대 (page.tsx 등 대형 파일 수정 없음). characterization tests 는 부모 SPEC 이 이미 Phase B 에서 작성.

## Task Decomposition (3 atomic, priority-ordered)

### V2-T-000 (Precondition) — tsx devDependency 추가

**Priority: High** (V2-T-003 가 의존)

수행 사항:
1. `pnpm add -D tsx` 실행
2. package.json `devDependencies` 에 `"tsx": "^<version>"` 추가 확인 (1 LOC delta)
3. (옵션) `scripts` 섹션에 `"seed:eval": "tsx scripts/seed-eval-golden-queries.ts"` 추가

DoD:
- `pnpm tsx --version` 정상 응답
- pnpm-lock.yaml 갱신
- package.json diff 1-2 LOC

### V2-T-001 — Backend: `/api/admin/eval/run` 응답에 judgmentRows 추가

**Priority: High** (V2-T-002 가 의존)

대상 파일:
- `src/app/api/admin/eval/run/route.ts` (modify, ~10 LOC delta)
- `src/app/api/admin/eval/run/route.test.ts` (extend, +1 case)

수행 사항:
1. **RED**: `route.test.ts` 에 신규 케이스 추가 — happy path 응답이 `judgmentRows` 배열을 포함하고 각 entry 가 `{id: string, productId: string, productKey: string}` shape 인지 expect. 502 케이스에서는 `judgmentRows` 필드가 응답 객체에서 omit 되는지 (key 부재) expect. 현재 코드는 누락 → 실패.
2. **GREEN**: `route.ts` 의 for 루프에서 `upsertJudgment()` 결과 (`JudgmentLoaded`) 를 capture, `judgmentRows` 배열에 `{id: result.id, productId: result.productId, productKey: productKey(p)}` push. 응답에 추가. 502 응답 객체에서는 `judgmentRows` key 자체를 추가하지 않음.
3. **REFACTOR**: 기존 `judgmentRowsCreated` 카운트는 `judgmentRows.length` 로 derive 가능하지만 backward compat 위해 보존. 가독성 향상 목적의 변수명 정리만.
4. 기존 5 테스트 케이스 통과 재확인 (`pnpm test src/app/api/admin/eval/run/route.test.ts`)

DoD:
- 6 케이스 모두 통과
- 응답 schema 변경: `{ rankedProducts, judgmentRowsCreated, judgmentRows }` (200) / `{ error, code, status }` (502, judgmentRows 필드 omit)

### V2-T-002 — Frontend: eval-labeling-form mount mapping (002a) + click PATCH (002b)

**Priority: High** (V2-T-001 응답 변경에 의존)

대상 파일:
- `src/components/admin/eval-labeling-form.tsx` (modify, ~15 LOC delta)
- `src/components/admin/eval-labeling-form.test.tsx` (NEW)

수행 사항:
1. **RED**: `eval-labeling-form.test.tsx` 에 4 케이스 작성:
   - 케이스 A1 (REQ-002a happy): 컴포넌트 마운트 → fetch mock 이 `judgmentRows` 포함 응답 반환 → 모든 grade 버튼이 enabled (`disabled` attribute false) 확인. 현재 코드는 `loadJudgments` 가 404 폴백 → 실패.
   - 케이스 A2 (REQ-002a empty): fetch mock 이 `judgmentRows: []` 응답 → "라벨링 가능한 상품이 없습니다" 안내 텍스트 렌더링 + 모든 grade 버튼 `disabled=true` 유지.
   - 케이스 B1 (REQ-002b first click): A1 상태에서 첫 카드 grade=2 버튼 클릭 → 두 번째 fetch 호출이 `PATCH /api/admin/eval/judgments/{기대-id}` 에 `{relevanceGrade: 2}` body 로 발생.
   - 케이스 B2 (REQ-002b re-click): B1 후 동일 카드 grade=3 클릭 → 동일 judgmentId 로 PATCH 재호출 (fetch spy 호출 인자 검증) + 다른 카드의 PATCH 호출 0건.
2. **GREEN**: `eval-labeling-form.tsx` 수정:
   - `loadJudgments` 함수 + 호출부 제거
   - `executeRun` 의 `setProducts` 단계에서 run 응답의 `judgmentRows` 를 productKey (= `product.link`) 로 indexed Map 으로 변환
   - `ranked.map` 에서 매핑된 `judgmentId` / `productId` 주입
   - judgmentRows 빈 배열 시 안내 메시지 분기 추가
   - JudgmentRow / JudgmentLoaded import 정리
3. **REFACTOR**: 사용되지 않는 graceful degrade 토스트 ("judgment ID 없음 — 검색을 다시 실행해주세요") 제거. judgmentRows 가 빈 배열인 경우 안내 추가 (REQ-002a contract).
4. 기존 외부 props (`{goldenQueryId, algorithmVersion}`) 변경 금지 검증

DoD:
- 신규 4 케이스 통과 (REQ-002a 2 + REQ-002b 2)
- 회귀 없음 (linter / 기존 admin/eval 페이지 빌드)
- grade 버튼 disabled 가 단지 `judgmentRows` 미응답 (빈 배열) 시에만 발동

### V2-T-003 — Seed script: analyses → eval_golden_queries

**Priority: Medium** (T-001/T-002 와 독립, 병렬 가능. T-000 precondition 필요)

대상 파일:
- `scripts/seed-eval-golden-queries.ts` (NEW, ~50 LOC)
- `scripts/seed-eval-golden-queries.test.ts` (NEW)

수행 사항:
1. **RED**: `scripts/seed-eval-golden-queries.test.ts` 에 3 케이스 작성:
   - 케이스 A: analyses fixture 30 row (각 row 에 prompt_text 또는 items[0].searchQuery 존재) → 변환 결과 30 entry, 모두 query_signature 비어있지 않음 검증
   - 케이스 B: prompt_text NULL && items 빈 row → invalid 카운트 +1
   - 케이스 C: 동일 (instagram_url=NULL, query_signature) 가진 fixture 두 번째 호출 → UPSERT mock 이 INSERT 0 / `skipped (duplicate): 30` 보고
2. **GREEN**: `scripts/seed-eval-golden-queries.ts` 구현:
   - env 검증 (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`) — 부재 시 fail-fast
   - `createClient(url, serviceRoleKey)` 로 client 초기화
   - `from("analyses").select("id, image_filename, prompt_text, items, created_at").order("created_at", {ascending: false}).limit(30)`
   - `deriveSignature(row)` pure function — prompt_text 우선, items[0].searchQuery 차선
   - `deriveIntentNote(row)` pure function — prompt_text 첫 200자 우선
   - `from("eval_golden_queries").upsert([...], { onConflict: 'instagram_url,query_signature', ignoreDuplicates: true })` — migration 033 line 33-34 의 UNIQUE INDEX `(instagram_url, query_signature) NULLS NOT DISTINCT` 와 정확히 일치
   - 콘솔 출력 (canonical order 4 라인):
     1. `total candidates: <n>`
     2. `seeded: <n>`
     3. `skipped (duplicate): <n>`
     4. `skipped (invalid): <n>`
   - exit code (정상 0, fatal 1)
3. **REFACTOR**: deriveSignature / deriveIntentNote 함수 export (테스트에서 import 가능하도록). main 함수와 분리.
4. 통합 테스트 1회 실행 검증 (Vitest 단위 + Supabase mock — staging 환경 검증은 V2 scope 외)

DoD:
- 3 케이스 통과
- 빈 analyses → exit 0, 4 라인 stdout 모두 0 으로 출력
- 환경변수 부재 → exit 1, clear error 메시지
- idempotent 검증 (동일 데이터셋 두 번 실행 → 두 번째는 0 시드)

## Phase Ordering Summary

```
V2-T-000 (precondition: pnpm add -D tsx) → V2-T-001 (backend) → V2-T-002 (frontend, T-001 응답에 의존)
                                          ↘ V2-T-003 (seed script, T-001/T-002 와 독립)
```

권장 실행:
1. T-000 (precondition, 가장 빠름)
2. T-001 완료 후
3. T-002, T-003 병렬

단일 세션 진행 시 T-000 → T-001 → T-003 → T-002 순도 가능 (T-002 가 가장 위험도 높음 — RTL + 컴포넌트 렌더링).

## Risk Mitigation

| Risk | Mitigation | 검증 방법 |
|---|---|---|
| run/route.ts 응답 변경이 다른 클라이언트 (이전 빌드된 frontend) 에 영향 | 기존 필드 (`rankedProducts`, `judgmentRowsCreated`) 보존 + 추가 필드만 — backward compatible | 6 테스트 케이스 (5 기존 + 1 신규) 모두 통과 |
| upsertJudgment 가 동일 (golden_query_id, product_id, algorithm_version) 재호출 시 새 id 반환 가능성 | judgment-store.ts 의 onConflict 로 단일 row 보장 (이미 검증됨); 본 SPEC 은 동일 호출 1회만 발생 | route.test.ts 신규 케이스에서 동일 productKey 두 번 upsert → 같은 id 검증 (옵션) |
| analyses 의 prompt_text NULL + items 빈 row | invalid 카운트로 분리 + skip 처리. 콘솔 출력에 명시 | seed test 케이스 B |
| seed script 가 production DB 에 잘못 실행 | service-role 키 부재 시 fail-fast. 실행 시 SUPABASE_URL 출력. README 또는 script 상단 주석에 "1회성 시드 도구, 환경 확인 필수" 경고 | 환경변수 부재 케이스 (manual 검증) |
| labeling-form 테스트가 실제 fetch 호출 → 네트워크 fail | `vi.spyOn(global, 'fetch')` 로 mock; MSW 가 프로젝트에 도입되지 않은 경우 spy 패턴 사용 | 기존 route.test.ts 의 fetch mock 패턴 참조 |
| seed script 의 onConflict target 이 migration 033 의 UNIQUE INDEX 와 mismatch | migration 033 line 33-34 직접 확인 — `(instagram_url, query_signature) NULLS NOT DISTINCT`. Supabase upsert 옵션 `onConflict: 'instagram_url,query_signature'` 정확 적용 | 통합 테스트 (Vitest mock) 케이스 C |
| tsx devDependency 부재 → `pnpm tsx` 실행 실패 | T-000 precondition 으로 `pnpm add -D tsx` 선행 | `pnpm tsx --version` 정상 응답 확인 |

## Estimated Scope (file count)

| 카테고리 | 신규 | 수정 | 합계 |
|---|---|---|---|
| API routes | 0 | 1 (run/route.ts) | 1 |
| 컴포넌트 | 0 | 1 (eval-labeling-form.tsx) | 1 |
| Scripts | 1 (seed-eval-golden-queries.ts) | 0 | 1 |
| 테스트 | 2 (eval-labeling-form.test.tsx, seed-eval-golden-queries.test.ts) | 1 (run/route.test.ts +1 case) | 3 |
| **Core 합계** | **3** | **3** | **6** |
| package.json (precondition: tsx 추가) | 0 | 1 | 1 |
| **Total 합계** | **3** | **4** | **7** |

(부모 SPEC 산출물 28 파일 대비 매우 작음 — 활성화/언블록 작업 성격 반영. package.json 은 precondition 으로 분리 카운트.)

## Dependencies on Parent SPEC

- `eval_golden_queries`, `eval_judgments` 테이블 존재 (부모 SPEC migration 033)
- `upsertJudgment()` 함수가 `JudgmentLoaded` (id 포함) 반환 (`src/lib/eval/judgment-store.ts`)
- `requireApprovedAdmin()` 가드 운용 중
- `routeAlgorithmVersion()` v4 통과 / v6 throw (부모 SPEC 그대로 유지)
- migration 033 line 33-34 의 UNIQUE INDEX `eval_golden_queries_identity_unique ON eval_golden_queries (instagram_url, query_signature) NULLS NOT DISTINCT` — seed script 의 onConflict target 의 정확한 sourcecode 위치
