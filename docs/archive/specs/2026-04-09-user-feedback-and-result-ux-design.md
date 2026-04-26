# User Feedback & Result UX 개선 디자인 스펙

> 결과 화면 UX 개선 + 대화형 리파인 + 유저 피드백 수집 + 어드민 User Voice 탭

## 개요

사용자가 분석 결과를 받은 후 (1) 상품 카드를 더 잘 탐색하고, (2) 컨텍스트를 유지하며 재질문하고, (3) 간편하게 피드백을 남기고, (4) 선택적으로 이메일을 등록할 수 있도록 한다. 수집된 피드백과 리파인 여정은 어드민 User Voice 탭에서 조회한다.

## 1. 데이터 모델

### 새 테이블

**`analysis_sessions`**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK, gen_random_uuid() |
| created_at | timestamptz | DEFAULT now() |
| initial_prompt | text | 최초 프롬프트 |
| initial_image_url | text | 최초 이미지 (R2 URL) |
| gender | text | 선택된 성별 |
| analysis_count | int | DEFAULT 1, 세션 내 분석 횟수 |
| last_analysis_id | uuid | 가장 최근 분석 FK |

**`user_feedbacks`**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK, gen_random_uuid() |
| session_id | uuid | FK → analysis_sessions |
| analysis_id | uuid | FK → analyses (피드백 시점의 분석) |
| rating | text | CHECK IN ('up', 'down') |
| tags | text[] | 👎 시 선택 태그 배열 |
| comment | text | 선택적 텍스트 |
| email | text | 선택적 이메일 |
| created_at | timestamptz | DEFAULT now() |

**피드백 태그 프리셋 (8종):**
- `style_mismatch` — 스타일이 달라요
- `price_high` — 가격대가 높아요
- `product_irrelevant` — 상품이 안 맞아요
- `few_results` — 결과가 너무 적어요
- `category_wrong` — 카테고리가 틀려요
- `color_off` — 색감이 달라요
- `brand_unfamiliar` — 브랜드가 낯설어요
- `other` — 기타

### 기존 테이블 변경: `analyses`

| 추가 컬럼 | 타입 | 설명 |
|-----------|------|------|
| session_id | uuid | FK → analysis_sessions, nullable |
| parent_analysis_id | uuid | 리파인 시 이전 분석 참조, nullable |
| refinement_prompt | text | 리파인 프롬프트, nullable (최초 분석은 null) |
| sequence_number | int | DEFAULT 1, 세션 내 순서 |

### 인덱스

- `analysis_sessions(created_at DESC)`
- `user_feedbacks(session_id)`, `user_feedbacks(rating)`, `user_feedbacks(created_at DESC)`
- `analyses(session_id)`, `analyses(parent_analysis_id)`

## 2. 대화형 리파인 엔진

### 클라이언트 흐름

```
[결과 화면]
  ↓ 스티키 바에 새 프롬프트 입력 (기존 이미지 유지 or 새 이미지)
  ↓ POST /api/analyze (+ context 파라미터)
  ↓ analyzing 상태 전환
  ↓ 새 결과로 교체
  ↓ 스티키 바 유지 → 반복 (최대 5회)
```

### 상태 관리 확장

```typescript
// page.tsx에 추가되는 state
sessionId: string | null
analysisHistory: AnalysisResult[]
currentSequence: number  // 1~5
```

### API 변경: POST /api/analyze

요청 body에 리파인 컨텍스트 추가:

```typescript
{
  // 기존 파라미터 유지...
  sessionId?: string
  parentAnalysisId?: string
  refinementPrompt?: string
  previousContext?: {
    items: { category: string; name: string; color: string; fit: string }[]
    styleNode: string
    moodTags: string[]
  }
}
```

응답에 세션 정보 추가:

```typescript
{
  // 기존 응답 유지...
  _sessionId: string
  _sequenceNumber: number
}
```

### GPT 프롬프트 리파인 컨텍스트 삽입

리파인 요청 시 시스템 프롬프트에 추가:

```
---
PREVIOUS ANALYSIS CONTEXT:
The user previously analyzed a look and got these results:
- Items: {items 요약}
- Style: {styleNode}
- Mood: {moodTags}

The user is now refining with: "{refinementPrompt}"
Adjust the analysis based on this feedback. Keep unchanged elements stable,
modify only what the user's refinement implies.
```

### 리파인 제한

- 세션당 최대 5회 리파인
- 5회 도달 시 스티키 바에: "Start a fresh analysis for new ideas"
- `analysis_sessions.analysis_count`를 매 리파인 시 INCREMENT

## 3. 상품 카드 UI 개선

### 카드 레이아웃

- 이미지: `aspect-ratio: 3/4`, `object-contain`으로 잘림 없이 전체 노출
- 이미지 아래: 브랜드(mono, uppercase) + 가격 + 상품명 (1줄 truncate)
- 별점 데이터 미표시 (데이터 없음)

### 오버레이 인터랙션 (호버/탭)

카드에 호버(데스크탑) 또는 탭(모바일) 시:

- 이미지 위로 그라디언트 오버레이가 아래서 올라옴 (`linear-gradient(transparent 0%, rgba(9,9,11,0.85) 20%, rgba(9,9,11,0.95))`)
- 오버레이 내용:
  1. **"Why this pick"** 라벨 (turquoise, mono, uppercase)
  2. **매칭 이유 칩** — 검색 엔진에서 매칭된 축만 표시 (turquoise pill 스타일)
     - Color: colorFamily (Black, Navy...)
     - Fit: fit (Oversized, Regular...)
     - Fabric: fabric (Cotton, Wool...)
     - Style: styleNode 라벨 (Minimal Clean, Avant-Garde...)
     - Season: season (Spring, F/W...)
     - Pattern: pattern (Solid, Stripe...)
     - 매칭 스코어가 있는 축만 → 상품마다 2~5개
  3. **설명 snippet** (있으면, 2줄 line-clamp)
  4. **"View ↗" CTA 버튼** → 외부 링크

- framer-motion으로 오버레이 slide-up 애니메이션 (duration: 0.2s)
- 리뷰: 있으면 설명 아래에 담백하게 표시 ("리뷰 N건"), 없으면 미표시

### 매칭 칩 데이터 소스

`/api/search-products` 응답에 상품별 매칭 정보 추가:

```typescript
interface ProductWithMatch extends Product {
  matchReasons: {
    field: string   // "colorFamily" | "fit" | "fabric" | "styleNode" | "season" | "pattern"
    value: string   // "Black", "Oversized", etc.
  }[]
}
```

검색 엔진 v3에서 각 상품의 score_breakdown을 기반으로, 스코어가 0보다 큰 축의 쿼리 값을 matchReasons로 반환.

## 4. 스티키 리파인 바

### 위치 및 구조

- 결과 화면 하단에 `position: sticky; bottom: 0` 고정
- 배경: 상단 transparent → `#09090B` 그라디언트로 컨텐츠와 자연스럽게 연결
- 바 자체: `bg-card border border-border rounded-xl` 스타일, 내부 `flex` 레이아웃

### 구성 요소 (좌→우)

1. **세션 인디케이터**: turquoise 도트 + "2/5" 카운터 (mono)
2. **구분선**: 1px vertical divider
3. **텍스트 입력**: placeholder가 컨텍스트에 맞게 순환 ("좀 더 캐주얼하게", "가격 낮춰서", "다른 색상으로")
4. **이미지 첨부 버튼**: 📎 아이콘, 새 이미지 교체 가능
5. **전송 버튼**: ↑ 아이콘, `bg-primary text-background` 스타일

### 하단 힌트

바 아래에 작은 텍스트: "Refine your look — previous context preserved" (mono, muted)

### 5회 도달 시

입력 disabled, placeholder: "Start a fresh analysis for new ideas", 전송 버튼 → 리셋 아이콘으로 변경 (클릭 시 upload 화면으로)

## 5. 빈 결과 UX

### 카테고리 내 상품 0개일 때

현재: "No matching products found in our database." (단순 텍스트)

변경:
- 중앙 정렬 ∅ 아이콘 (원형 배경)
- **"No exact matches yet"** 타이틀
- **"We couldn't find products matching this item. Try refining your search below."** 설명
- **제안 칩 2개**: "비슷한 스타일 다른 색", "가격대 넓혀서"
  - 칩 탭 → 스티키 바에 해당 텍스트 자동 입력 + 포커스

### 전체 카테고리가 다 빈 경우

결과 섹션 전체를 빈 상태 메시지로 교체:
- "We're still growing our catalog"
- "Try describing your style differently — we might find something close."
- 제안 칩 3개 제공

## 6. 피드백 플로우

### 위치

결과 화면 하단, 스티키 바 위에 배치. 아코디언 목록과 스티키 바 사이.

### Step 1: Thumbs (항상 노출)

- "How was this analysis?" (mono, muted)
- 👍 / 👎 버튼 2개 (56×56px, rounded-xl, bg-card border)
- 탭 시 선택된 쪽에 border-turquoise 하이라이트
- 👍 탭 → Step 3로 건너뜀 (태그 불필요)
- 👎 탭 → Step 2 펼쳐짐

### Step 2: 태그 칩 (👎 시 AnimatePresence로 펼쳐짐)

- "What could be better?" 타이틀 + "Select all that apply" 서브
- 8개 태그 칩 (pill 스타일, 멀티 셀렉트)
- 선택 시: turquoise 배경+보더 + ✓ 표시
- 미선택: bg-card border-border

### Step 3: 텍스트 + 이메일 (선택, AnimatePresence로 펼쳐짐)

- 상단 메시지 블록: "Your voice shapes portal.ai" + "We're building this together — every bit of feedback helps us get better." (turquoise left-border accent)
- 텍스트 입력: "Tell us more (optional)..." placeholder
- 이메일 입력: "your@email.com" placeholder
- Early adopter 넛지: ✦ 아이콘 + "Be among the first to know when we launch." + "Early supporters get priority access & exclusive updates." (turquoise 배경 박스)
- "Send Feedback" 버튼 (bg-primary text-background, full-width)

### Step 4: 감사 토스트

- 피드백 전송 후 토스트 알림 (3초 자동 닫힘)
- ✦ 아이콘 + "Thanks for shaping portal.ai" + "Your feedback makes the next result better."
- turquoise border accent

### API: POST /api/feedback

```typescript
// Request
{
  sessionId: string
  analysisId: string
  rating: "up" | "down"
  tags?: string[]     // 👎 시
  comment?: string
  email?: string
}

// Response
{ success: true, feedbackId: string }
```

## 7. 어드민 User Voice 탭

### 사이드바

기존 4개 탭에 5번째 추가:
- 아이콘: `MessageCircle` (lucide-react)
- 라벨: "유저 보이스"
- 설명: "피드백 & 리파인 여정"
- 경로: `/admin/user-voice`

### 대시보드 구성

#### 상단 메트릭 카드 (4열 그리드)

| 카드 | 값 | 서브 |
|------|-----|------|
| 총 피드백 | count | +N this week |
| 긍정률 | up/(up+down) % | 프로그레스 바 |
| 리파인 세션 | analysis_count > 1인 세션 수 | avg turns |
| 이메일 수집 | email이 있는 피드백 수 | 전환율 % |

#### 부정 피드백 태그 분포

- 수평 바 차트
- 태그명 (mono, 110px 고정폭) + 바 (turquoise 30% opacity) + 비율 %
- 상위 4개 + "기타 N개 태그" 그룹

#### 피드백 리스트

- 필터 탭: 전체 / 👍 / 👎 / 💬 텍스트 / 📧 이메일
- 각 항목: 👍/👎 아이콘 + 태그 칩(👎시) + 텍스트 + 이메일(마스킹) + 시간
- 세션 여정 (expandable): "1차 질문 → 2차 리파인 → 3차 리파인 → 👎" 흐름
  - session_id로 analyses 조회, sequence_number 순 정렬
  - 각 단계: prompt_text 또는 refinement_prompt 표시
- 페이지네이션: 20개씩

### API: GET /api/admin/user-voice

```typescript
// Query params
{
  filter?: "all" | "up" | "down" | "text" | "email"
  page?: number  // default 1
}

// Response
{
  metrics: {
    totalFeedbacks: number
    positiveRate: number
    refineSessions: number
    avgTurns: number
    emailCount: number
    emailConversion: number
    weeklyDelta: number
  }
  tagDistribution: { tag: string; count: number; percentage: number }[]
  feedbacks: {
    id: string
    rating: "up" | "down"
    tags: string[]
    comment: string | null
    email: string | null  // 마스킹 처리
    createdAt: string
    session: {
      id: string
      analysisCount: number
      journey: { sequence: number; prompt: string }[]
    }
  }[]
  pagination: { page: number; totalPages: number; totalCount: number }
}
```

## 8. Eval 파이프라인 연동

유저 피드백을 기존 eval 파이프라인에 활용하는 방안:

- **👎 + 태그 = 자동 플래그**: 👎 피드백이 달린 분석은 `analyses.is_pinned = true` 자동 설정 → 기존 eval 큐에서 우선 검토 대상
- **리파인 패턴 분석**: 같은 태그가 반복되면 (e.g., `price_high` 30% 이상) 해당 축의 검색 로직 검토 알림
- **골든셋 후보**: 👍 + 텍스트 피드백이 있는 세션 = 골든셋 후보로 제안 (어드민에서 원클릭 추가)

## NOT in scope

- 개별 상품 카드 단위 피드백 (전체 분석 단위만)
- 유저 계정/로그인 시스템 (피드백은 익명, 이메일은 선택)
- 피드백 기반 자동 프롬프트 튜닝 (수동 검토 후 반영)
- 이메일 발송 시스템 (수집만, 발송은 추후)
- A/B 테스트 프레임워크
- 피드백 기반 자동 이메일 알림/뉴스레터 발송
- 리파인 시 이미지 자동 재분석 (텍스트 컨텍스트만 GPT에 전달. 단, 스티키 바에서 새 이미지를 첨부하면 해당 이미지로 새 Vision 분석 수행)

## 기존 UI 제거 대상

- 결과 하단 "Try Another Look" / "Save This Look" 버튼 → 스티키 리파인 바 + 피드백 플로우로 대체
- 아이템별 disabled 상태의 refine capsules ("cheaper", "different color" 등) → 제거 (스티키 바가 리파인 역할 대체)
