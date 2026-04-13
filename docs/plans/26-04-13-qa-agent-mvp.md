# Q&A Agent MVP — 1일 스프린트 플랜

> 작성일: 2026-04-13
> 목적: `26-04-13-product-direction-qa-synthesis.md`에서 결정된 "체계적 Q&A 에이전트" 방향을, 1일 안에 검증 가능한 MVP로 구현
> 기준: Daydream과 다른 메커니즘(자유 프롬프트 → 단계별 Q&A) 검증
> 범위: **신규 라우트 `/agent` 병렬 배포** — 기존 `/`는 유지

---

## 1. 핵심 결정 (스코프 락)

| 항목 | 결정 | 이유 |
|------|------|------|
| 라우트 | `/agent` (병렬) | 기존 `/` 영향 없음, 롤백 쉬움 |
| 단계 수 | **4단계** (문서 초안 7~8단계 → 압축) | 1일 안에 마칠 수 있는 최소 |
| 입력 방식 | 이미지 **또는** 텍스트 (택1) — 기존 SearchBar 재사용 | 가장 빠름. URL 입력은 v2 |
| 카테고리 제한 | 없음 (전 카테고리) | 유저가 1개 아이템을 선택하므로 카테고리 제한 불필요 |
| Lock 단위 | 유저가 **1개 primary item 선택 후 그 item의 속성을 1~2개 lock** | 송진우 유스케이스("발렌시아가 마이애미 더비 같은") = 1 아이템 중심 |
| 디자인 | 기존 B&W Minimal 토큰/컴포넌트 재사용 | UI/UX 딥 분석은 다른 세션에서 |
| DB 변경 | **없음** | `qa_sessions` 테이블, `analyses` 컬럼 추가 모두 v2 |
| AI 모델 | GPT-4o-mini 그대로 (LiteLLM 경유 가능) | Bedrock 이관은 별도 작업 |
| 로깅 | 기존 `analyses` 테이블 그대로 사용 | Q&A state는 클라이언트만, 추후 컬럼 추가 |

---

## 2. 4단계 플로우

```
Step 1: 레퍼런스 입력
  → SearchBar(이미지/텍스트) → /api/analyze → analysisId 받음

Step 2: AI 파싱 결과 + Primary Item + Lock 속성
  → 파싱된 look items 목록 표시 (이미지 + 카테고리/색/핏/소재/스타일)
  → 유저가 1개 item 선택
  → 해당 item의 속성 6개(subcategory, colorFamily, fit, fabric, season, pattern) 중 1~2개 체크 = strict match

Step 3: 톤 & 예산
  → 스타일 감도 슬라이더 (Tight ↔ Loose) — 결과 개수에 영향
  → 가격 범위 (min ~ max, 옵션)
  → "왜 대안이 필요한가요?" 1개 선택 (가격/사이즈/다양성/다른 브랜드 — MVP는 라벨만 저장)

Step 4: 결과
  → 선택한 primary item 1개에 대한 추천 상품 카드 그리드 (Top 7)
  → 각 카드에 "잠금 속성 일치율" 칩
  → "다시 좁혀보기" 버튼 → Step 3로 돌아가서 재탐색 (앞 단계 state 유지)
```

---

## 3. 기술 구현

### 3.1 신규 파일

| 파일 | 역할 |
|------|------|
| `src/app/agent/page.tsx` | 클라이언트 컴포넌트, 4단계 state machine |
| `src/app/agent/_components/step-input.tsx` | Step 1 — SearchBar 래핑 |
| `src/app/agent/_components/step-attributes.tsx` | Step 2 — item 카드 + lock 체크박스 |
| `src/app/agent/_components/step-refine.tsx` | Step 3 — 슬라이더 + 가격 + 이유 |
| `src/app/agent/_components/step-results.tsx` | Step 4 — 결과 카드 그리드 |
| `src/app/agent/_components/agent-progress.tsx` | 1/4 ~ 4/4 진행 표시 |

### 3.2 기존 파일 수정

| 파일 | 변경 |
|------|------|
| `src/app/api/search-products/route.ts` | `lockedAttributes`(쿼리당) + `styleTolerance` 파라미터 추가. lockedAttributes는 hard filter. tolerance는 결과 개수(TARGET_RESULTS) 조절 (0=5개, 1=10개) |
| `src/components/layout/header.tsx` | (옵션) `/agent` 진입 링크 추가 — 시간 남으면 |

### 3.3 State Machine

```ts
type AgentStep = "input" | "attributes" | "refine" | "results"

type LockedAttribute = "subcategory" | "colorFamily" | "fit" | "fabric" | "season" | "pattern"

interface AgentState {
  step: AgentStep
  // Step 1 outputs
  analysisId: string | null
  imageUrl: string
  promptText: string
  items: AnalyzedItem[]  // /api/analyze 응답
  styleNode: { primary: string; secondary?: string } | null
  moodTags: string[]
  // Step 2 outputs
  selectedItemId: string | null
  lockedAttrs: LockedAttribute[]   // 1~2개
  // Step 3 outputs
  styleTolerance: number  // 0.0 ~ 1.0
  priceMin?: number
  priceMax?: number
  refineReason?: "price" | "size" | "variety" | "brand"
  // Step 4 outputs
  products: Product[]
  searching: boolean
}
```

### 3.4 API 흐름

```
Step 1 → POST /api/analyze (FormData: image, prompt, gender)
       ← { _logId, items, styleNode, moodTags, mood, palette }

Step 4 → POST /api/search-products
         body: {
           gender, styleNode, moodTags, _logId,
           priceFilter: { minPrice, maxPrice } | null,
           queries: [
             {
               id, category, subcategory, fit, fabric, colorFamily,
               searchQuery, searchQueryKo, season, pattern,
               // 신규 (선택한 item 1개)
               lockedAttributes: { [key]: value }   // 신규
             }
           ],
           styleTolerance: 0.5   // 신규
         }
       ← { results: [{ id, products: [...] }] }
```

### 3.5 검색 엔진 변경 (search-products/route.ts)

**최소 변경 원칙**:

```ts
// 신규 타입
type QueryWithLock = SearchQuery & {
  lockedAttributes?: Partial<{
    subcategory: string
    colorFamily: string
    fit: string
    fabric: string
    season: string
    pattern: string
  }>
}

// 신규 파라미터
type SearchRequest = { ... existing ..., styleTolerance?: number }

// 매칭 로직 안에서:
if (query.lockedAttributes) {
  for (const [attr, val] of Object.entries(query.lockedAttributes)) {
    const productVal = product[attr === "colorFamily" ? "color_family" : attr]
    if (productVal !== val) {
      return null  // hard filter — 락된 속성 불일치 시 제외
    }
  }
}

// TARGET_RESULTS 동적 조절
const targetCount = Math.round(5 + (styleTolerance ?? 0.5) * 5)  // 5~10
```

### 3.6 결과 카드 일치율 칩

기존 `ProductCard`의 `matchReasons` 활용. 추가:

```tsx
{lockedAttrs.map(attr => (
  <span className="lock-chip">🔒 {attrLabel(attr)} 일치</span>
))}
```

`_includeScoring=true`로 호출하면 `_scoring` 응답이 옴. 각 lock된 속성의 점수가 풀로 나오는지 확인 표시.

---

## 4. 작업 순서 (8h 기준)

| # | 작업 | 시간 | 의존성 |
|---|------|------|--------|
| 1 | 플랜 문서 작성 (이 파일) | 30분 | — |
| 2 | `/agent` 라우트 + AgentState reducer + 4단계 라우팅 셸 | 1h | 1 |
| 3 | Step 1 (input) — SearchBar 재사용, /api/analyze 호출 | 1h | 2 |
| 4 | Step 2 (attributes) — item 카드 + lock 체크박스 (max 2) | 1.5h | 3 |
| 5 | search-products API 확장 (lockedAttributes hard filter + tolerance) | 1.5h | — (병렬) |
| 6 | Step 3 (refine) — 슬라이더 + 가격 + 이유 | 1h | 2 |
| 7 | Step 4 (results) — 카드 그리드 + lock 칩 + 재탐색 버튼 | 1h | 4, 5, 6 |
| 8 | 진행 표시(1/4) + lint + smoke test (브라우저 1회 확인) | 30분 | 7 |

---

## 5. NOT in scope (v2/v3 이관 — 별도 백로그)

다음은 **의도적으로 뺀 것들**. 추후 별도 스프린트로 구현.

### v2 (다음 스프린트)
1. **속성 수정 UI** — Step 2에서 AI 파싱 결과를 유저가 직접 수정 (현재는 체크만)
2. **AI 추천 lock 속성** — 카테고리 분포 기반 "이 속성이 정체성" 자동 추천
3. **원본 vs 추천 비교 뷰** (Step 8) — side-by-side, 속성별 매칭률 바 차트 전용 페이지
4. **재탐색 이유 → 검색 로직 반영** — 현재는 라벨만 저장, 추후 가중치 조정에 사용
5. **`qa_sessions` DB 테이블** — 단계별 이탈률 tracking
6. **단계별 funnel 어드민 대시보드**
7. **URL 입력 진입점** — Step 1에 "쇼핑몰 URL 붙여넣기" 추가
8. **제품명 텍스트 진입점** — "발렌시아가 마이애미 더비"처럼 텍스트로 시작
9. **Skip 옵션** — Step별 건너뛰기

### v3 (중기)
10. **AI 파싱 정확도 개선** — Step 2 수정률 높은 속성 식별 후 프롬프트 튜닝
11. **A/B 테스트 인프라** — 단계 수, 질문 문구, 옵션 구성 튜닝
12. **fine-grained 속성 도입** — 신발 (toe_shape, sole_type), 하의 (rise, taper) 등
13. **Bedrock 모델 라우팅** — Vision은 Nova Lite, 텍스트는 Haiku로 비용 절감
14. **다중 item lock** — 룩 전체에서 여러 item 동시 검색 (현재는 1 item만)

### v4 (장기 — Phase 2~5)
15. **찜 기반 연쇄 추천** — Q&A 결과 누적 → 유저 취향 프로필
16. **자동 옷장 축적** (영수증 메일 연동)
17. **맥락 기반 추천** (날씨/일정)
18. **핏/사이즈 개인화** (True Fit MCP)

---

## 6. 검증 기준 (1일 끝나고 보는 것)

- [ ] `/agent` 진입 후 4단계를 끝까지 완주 가능
- [ ] Step 1에서 이미지 업로드 → /api/analyze 정상 응답
- [ ] Step 2에서 lock 속성 1~2개 선택 가능
- [ ] Step 3에서 슬라이더/가격 입력 가능
- [ ] Step 4에서 lock된 속성을 100% 충족하는 상품만 나옴
- [ ] "다시 좁혀보기" 클릭 시 Step 3로 돌아가고 state 유지
- [ ] B&W 디자인 일관성 (회색 톤, mono 폰트)
- [ ] lint 통과
- [ ] 기존 `/`와 `/result/[id]` 동작 무손상

## 7. 다음 단계

1. 이 플랜 기반 `feature-finalize` 워크플로우로 PR
2. 별도 세션에서 GABI UI/UX 딥 분석 → 본 MVP 위에 디자인 개선 (Step별 화면 카피, 아이콘, 마이크로 인터랙션)
3. 베타 유저 5명(송진우 포함) 테스트 → 단계별 이탈/만족도
4. v2 스프린트 (위 NOT in scope의 1~9) 우선순위 결정
