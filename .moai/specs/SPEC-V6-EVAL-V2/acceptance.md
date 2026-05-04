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

# SPEC-V6-EVAL-V2 — Acceptance Criteria

## HISTORY

- 2026-05-04 v0.1.1: Iter 2 revisions per plan-audit iter-1 (D1/D2/D3/D5/D6/D7 적용). Frontmatter 8 fields + `id` 통일. REQ-002 → 002a + 002b 분리에 따른 시나리오 재배치 (002a 2건 + 002b 2건). Scenario 1.2 disjunction 제거 — judgmentRows omit 단일 contract. Scenario 2a 의 weasel word "등" 제거 — 정확한 어설션 타겟 명시. DoD disjunction 단일화 (staging 옵션 제거). stdout canonical order 4 라인 통일. 총 시나리오 7 → 9.
- 2026-05-04 v0.1.0: Initial draft.

각 REQ 별 최소 2개 Given/When/Then. 총 9 시나리오 (REQ-001 2 + REQ-002a 2 + REQ-002b 2 + REQ-003 3).

---

## REQ-V6-EVAL-V2-001 — `/api/admin/eval/run` 응답 확장

### Scenario 1.1: judgmentRows 정상 응답 (happy path)

GIVEN approved admin 사용자가 인증되어 있고
AND `eval_golden_queries` 테이블에 id="Q1" 인 row 가 존재하며 (instagram_url=NULL, query_signature="bone-white knit", intent_note="Bone white knit fit reference")
AND products 테이블에 link 가 "https://shop.example.com/p/A", "https://shop.example.com/p/B" 인 두 row 가 존재하며 각 row 의 uuid 가 P_A, P_B
AND `/api/search-products` mock 이 두 product (link=A, link=B) 를 포함한 top 결과를 반환하도록 설정되어 있고
WHEN client 가 `POST /api/admin/eval/run` 에 `{ goldenQueryId: "Q1", algorithmVersion: "v4" }` body 로 호출
THEN 응답 status 가 200 이고
AND 응답 body 가 다음 필드를 포함:
- `rankedProducts: [...]` (기존 보존)
- `judgmentRowsCreated: 2` (기존 보존)
- `judgmentRows: [{id: <uuid>, productId: P_A, productKey: "https://shop.example.com/p/A"}, {id: <uuid>, productId: P_B, productKey: "https://shop.example.com/p/B"}]`
AND `judgmentRows` 의 각 entry 의 `id` 는 `eval_judgments` 테이블에 실제 INSERT 된 row 의 uuid 와 일치한다

### Scenario 1.2: search-products 5xx 시 502 + judgmentRows 필드 omit

GIVEN approved admin 사용자 인증 완료
AND golden_query Q1 존재
AND `/api/search-products` mock 이 status 503 을 반환하도록 설정
WHEN client 가 `POST /api/admin/eval/run` 호출
THEN 응답 status 가 502 이고
AND 응답 body 가 `{error: "search-products 호출 실패", code: "SEARCH_PRODUCTS_FAILED", status: 503}`
AND **응답 객체에 `judgmentRows` 키가 존재하지 않는다 (omitted, not empty array)** — spec.md REQ-001 detail 의 502 contract 와 일치
AND `eval_judgments` 테이블에 신규 row 가 INSERT 되지 않는다

---

## REQ-V6-EVAL-V2-002a — Labeling Form Mount-time Mapping + Grade 버튼 Enable

### Scenario 2a.1: 마운트 → judgmentRows 매핑 → 모든 grade 버튼 enabled

GIVEN `EvalLabelingForm` 컴포넌트가 props `{goldenQueryId: "Q1", algorithmVersion: "v4"}` 로 렌더링되고
AND `fetch` mock 이 `/api/admin/eval/run` 호출에 대해 다음 응답을 반환:
```json
{
  "rankedProducts": [
    {"brand": "B1", "title": "T1", "link": "https://shop/p/A", "imageUrl": "...", "price": "$10", "platform": "P1"},
    {"brand": "B2", "title": "T2", "link": "https://shop/p/B", "imageUrl": "...", "price": "$20", "platform": "P2"}
  ],
  "judgmentRowsCreated": 2,
  "judgmentRows": [
    {"id": "J_A", "productId": "P_A", "productKey": "https://shop/p/A"},
    {"id": "J_B", "productId": "P_B", "productKey": "https://shop/p/B"}
  ]
}
```
WHEN 컴포넌트가 마운트되어 `executeRun` 이 자동 트리거되고 응답이 처리됨
THEN 두 product 카드가 렌더링되고
AND 각 카드의 grade 버튼 (0/1/2/3 총 8개 버튼) 의 `disabled` attribute 가 모두 `false`
AND 첫 카드의 내부 데이터에 `judgmentId="J_A"`, `productId="P_A"` 가 매핑되어 있다 (data-attribute 또는 component state 검증)
AND "라벨링 가능한 상품이 없습니다" 안내 텍스트는 렌더링되지 않는다

### Scenario 2a.2: 빈 judgmentRows → 안내 표시 + grade 버튼 disabled 유지

GIVEN `EvalLabelingForm` 컴포넌트가 props `{goldenQueryId: "Q1", algorithmVersion: "v4"}` 로 렌더링되고
AND `fetch` mock 이 `/api/admin/eval/run` 호출에 대해 다음 응답을 반환:
```json
{
  "rankedProducts": [
    {"brand": "B1", "title": "T1", "link": "https://shop/p/A", "imageUrl": "...", "price": "$10", "platform": "P1"}
  ],
  "judgmentRowsCreated": 0,
  "judgmentRows": []
}
```
WHEN 컴포넌트 마운트되어 응답 처리
THEN "라벨링 가능한 상품이 없습니다" 안내 텍스트가 화면에 렌더링되고
AND product 카드의 모든 grade 버튼 (0/1/2/3) 의 `disabled` attribute 가 `true` 유지
AND PATCH 호출은 발생하지 않는다 (fetch spy 호출 카운트 = 1, 즉 run 호출만)

---

## REQ-V6-EVAL-V2-002b — Grade 버튼 Click-time PATCH 호출

### Scenario 2b.1: 첫 grade 클릭 → 정확한 judgmentId 로 PATCH

GIVEN Scenario 2a.1 의 상태 (두 카드 렌더링, grade 버튼 enabled, judgmentId 매핑 완료)
WHEN 사용자가 첫 카드 (link="https://shop/p/A", judgmentId="J_A") 의 grade=2 버튼을 클릭
THEN 두 번째 fetch 호출이 다음 contract 로 발생:
- URL: `/api/admin/eval/judgments/J_A` (encodeURIComponent 적용)
- method: `PATCH`
- body (JSON): `{relevanceGrade: 2}`
AND fetch mock 이 status 200 응답 시 첫 카드의 grade=2 버튼에 `[data-active='true']` 속성이 셋되며 (다른 grade 버튼은 `[data-active='false']`)
AND 두 번째 카드의 PATCH 호출은 발생하지 않는다 (fetch spy 호출 인자 검증)

### Scenario 2b.2: 동일 카드 grade 변경 → 동일 judgmentId 로 재 PATCH

GIVEN Scenario 2b.1 후 첫 카드의 grade=2 가 이미 저장된 상태
WHEN 사용자가 동일 첫 카드의 grade=3 버튼을 클릭
THEN 새로운 fetch 호출이:
- URL: `/api/admin/eval/judgments/J_A` (동일 id, mount 후 변하지 않음)
- method: `PATCH`
- body: `{relevanceGrade: 3}`
AND 두 번째 카드 (J_B) 의 PATCH 호출은 발생하지 않으며 (격리 검증 — 누적 PATCH 호출 카운트 = 2, 모두 J_A)
AND optimistic update 로 첫 카드의 `[data-active='true']` 속성이 grade=3 버튼으로 즉시 이동

---

## REQ-V6-EVAL-V2-003 — Golden Queries Seed Script

### Scenario 3.1: 빈 analyses → 0 INSERT, exit 0

GIVEN 환경변수 `NEXT_PUBLIC_SUPABASE_URL` 와 `SUPABASE_SERVICE_ROLE_KEY` 가 모두 설정되어 있고
AND `analyses` 테이블이 빈 상태 (0 row)
WHEN 운영자가 `pnpm tsx scripts/seed-eval-golden-queries.ts` 실행
THEN 표준 출력에 다음 4 라인이 canonical order 로 포함:
1. `total candidates: 0`
2. `seeded: 0`
3. `skipped (duplicate): 0`
4. `skipped (invalid): 0`
AND process exit code 가 0
AND `eval_golden_queries` 테이블에 신규 row 가 INSERT 되지 않는다

### Scenario 3.2: 30 row → 30 INSERT, idempotent 재실행 시 0 INSERT / 30 skip

GIVEN 환경변수 정상 설정되어 있고
AND `analyses` 테이블에 30 row 존재 (각 row 에 prompt_text 또는 items[0].searchQuery 둘 중 하나 이상 존재)
AND `eval_golden_queries` 테이블이 빈 상태
WHEN 운영자가 `pnpm tsx scripts/seed-eval-golden-queries.ts` 첫 실행
THEN 표준 출력에 canonical order 4 라인:
1. `total candidates: 30`
2. `seeded: 30`
3. `skipped (duplicate): 0`
4. `skipped (invalid): 0`
AND `eval_golden_queries` 테이블에 30 row 가 INSERT 되어 있다 (각 row 의 instagram_url=NULL, query_signature 비어있지 않음, intent_note 비어있지 않음)
AND exit code 0

WHEN 동일 운영자가 즉시 두 번째 실행
THEN 표준 출력에 canonical order 4 라인:
1. `total candidates: 30`
2. `seeded: 0`
3. `skipped (duplicate): 30`
4. `skipped (invalid): 0`
AND `eval_golden_queries` 의 row 카운트는 여전히 30 (변경 없음 — migration 033 line 33-34 의 UNIQUE INDEX `(instagram_url, query_signature) NULLS NOT DISTINCT` 가 NULL instagram_url + 동일 query_signature 조합도 중복 처리)
AND exit code 0

### Scenario 3.3: prompt_text NULL && items 빈 row → invalid 카운트 증가, 정상 row 만 시드

GIVEN 환경변수 정상 설정되어 있고
AND `analyses` 테이블에 5 row 존재:
- 3 row: prompt_text="valid prompt", items=[{searchQuery: "Q"}]
- 2 row: prompt_text=NULL, items=[]
WHEN 운영자가 시드 스크립트 실행
THEN 표준 출력에 canonical order 4 라인:
1. `total candidates: 5`
2. `seeded: 3`
3. `skipped (duplicate): 0`
4. `skipped (invalid): 2`
AND `eval_golden_queries` 에 정확히 3 row 가 INSERT
AND invalid 처리된 2 row 는 신규 INSERT 되지 않으며 추가 에러로 process 가 abort 되지 않는다 (exit 0)

---

## Quality Gate Criteria (Definition of Done)

- [ ] 신규 3 테스트 파일 모두 통과:
  - `src/components/admin/eval-labeling-form.test.tsx` (4 케이스: 002a × 2 + 002b × 2)
  - `scripts/seed-eval-golden-queries.test.ts` (3 케이스)
  - `src/app/api/admin/eval/run/route.test.ts` (1 신규 케이스 추가, 기존 5 케이스 보존 → 총 6)
- [ ] 부모 SPEC-V6-EVAL 의 11 테스트 파일 회귀 없음 (`pnpm test src/lib/eval src/app/api/admin/eval src/app/admin/eval`)
- [ ] `pnpm build` 성공 (TypeScript 컴파일 + Next.js 빌드)
- [ ] `pnpm lint` 0 에러
- [ ] `eval-labeling-form.tsx` 의 `loadJudgments` 함수 + missing GET 폴백 코드가 완전히 제거됨 (grep 검증: `loadJudgments` 키워드 부재)
- [ ] `/api/admin/eval/run` 응답에 `judgmentRows` 필드가 정상적으로 포함됨 (**통합 테스트 1회 실행** — staging 옵션은 V2 scope 외)
- [ ] `scripts/seed-eval-golden-queries.ts` 가 통합 테스트 환경 (Vitest mock) 에서 1회 실행 검증 (빈 analyses 또는 fixture 환경 — exit 0 + canonical 4 라인 stdout 확인)
- [ ] MX 태그 추가: `@MX:NOTE` × 2 (seed deriveSignature, run/route.ts judgmentRows 누적 블록)
- [ ] 부모 SPEC 의 5 REQ (특히 RLS, freeze-baseline, compute) 동작 보존 — 부모 SPEC integration test (`tests/integration/eval-rls.test.ts`) 통과
- [ ] TRUST 5 게이트 통과 (Tested 신규 8 케이스 + 회귀 0 / Readable 변수명 명확 / Unified pnpm lint / Secured service-role 키 fail-fast / Trackable conventional commit)
- [ ] backward compatibility 검증: 이전 버전 frontend (judgmentRows 미인지) 가 호출해도 200 응답 + 기존 필드 정상
- [ ] precondition 충족: `pnpm tsx --version` 정상 응답 (T-000 완료 — package.json `devDependencies.tsx` 존재)
- [ ] seed script onConflict target 검증: migration 033 line 33-34 와 정확 일치 (`(instagram_url, query_signature)`)
