# Prompt-First Search Design Spec

> 프롬프트 기반 검색 — 텍스트 필수, 이미지 선택. Daydream/Gemini 스타일 입력 UX.

## Overview

현재 "이미지 필수 → AI 전체 추론" 구조를 "프롬프트 필수 + 이미지 선택"으로 전환. 유저가 직접 뭘 찾는지 말해주면 검색 정확도가 근본적으로 올라감.

## 문제 (현재)

- 이미지만으로 "이 사람이 뭘 사고 싶은지" 추론하는 건 한계
- AI searchQuery(영어) ↔ 한국어 상품명 매칭 실패 (searchQueryKo 추가했으나 AI가 생성하는 한국어 키워드 품질 불안정)
- nodeBoost가 브랜드 단위라 같은 브랜드의 양말이 모자 자리에 뜨는 문제
- 유저 의도 없이 AI가 모든 아이템을 검색 → 관심 없는 아이템까지 결과 노출

## 해결

유저가 "데님 자켓 찾아줘"라고 직접 말하면:
- "데님 자켓"이 검색 키워드 1순위 → 양말이 뜰 수가 없음
- 이미지는 무드/스타일 맥락 제공 → 브랜드 부스트용

## UX 플로우

### 메인 화면 — 입력 바

기존 업로드 존을 **채팅 입력 바 스타일**로 교체. Google/Gemini/Daydream 레퍼런스.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                 portal.ai                       │
│           One photo. Every option.              │
│                                                 │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │                                         │    │
│  │  어떤 스타일을 찾고 있나요?              │    │
│  │                                         │    │
│  ├─────────────────────────────────────────┤    │
│  │  [📷]  [남성 ▾]                   [→]   │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│    💡 이미지를 첨부하면 더 정확한 결과를          │
│       받을 수 있어요                            │
│                                                 │
│    예시:                                        │
│    "캐주얼한 데님 자켓"                          │
│    "미니멀한 블랙 울 코트"                       │
│    "이 사진이랑 비슷한 룩 찾아줘"                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 입력 바 상세

- **텍스트 영역**: 멀티라인 textarea, placeholder "어떤 스타일을 찾고 있나요?"
- **이미지 버튼**: 📷 아이콘, 클릭 시 파일 선택 or 드래그앤드롭
- **이미지 첨부 시**: 텍스트 영역 위에 썸네일 미리보기 (제거 가능)
- **성별 선택**: 기존 GenderSelector 유지 (드롭다운)
- **검색 버튼**: → 화살표, 프롬프트 or 이미지 중 하나라도 있으면 활성화
- **Enter로 전송**: Shift+Enter는 줄바꿈

```
이미지 첨부 상태:
┌─────────────────────────────────────────┐
│  ┌──────┐                               │
│  │ 썸네일 │ ✕                            │
│  └──────┘                               │
│  캐주얼한 데님 자켓 찾아줘                │
├─────────────────────────────────────────┤
│  [📷 변경]  [남성 ▾]              [→]   │
└─────────────────────────────────────────┘
```

### 입력 조합별 처리

| 프롬프트 | 이미지 | AI 처리 | 검색 전략 |
|---------|--------|---------|----------|
| ✅ "데님 자켓" | ❌ | GPT 텍스트 분석 (Vision 안 씀) → 카테고리, 키워드 추출 | promptKeywords 기반 검색 |
| ✅ "이거랑 비슷한 룩" | ✅ | GPT Vision + 프롬프트 컨텍스트 | 이미지 분석 + 프롬프트로 포커스 |
| ✅ "데님 자켓 찾아줘" | ✅ | GPT Vision + 프롬프트 | 프롬프트 키워드 1순위 + 이미지 무드 부스트 |
| ❌ | ✅ | 기존 Vision 분석 | 기존 로직 (하위호환) |
| ❌ | ❌ | — | 검색 버튼 disabled |

### 로딩 상태

```
프롬프트만:
  입력 → [AI 키워드 추출 ~2초] → [상품 검색 ~1초] → 결과

프롬프트 + 이미지:
  입력 → [AI Vision 분석 ~30초] → [상품 검색 ~1초] → 결과
  (분석 중 기존 AnalyzingView 재활용)

이미지만:
  입력 → 기존 플로우 그대로
```

## API 변경

### POST /api/analyze

```
기존: FormData { image: File }
변경: FormData { image?: File, prompt?: string, gender: string }
```

**프롬프트만 (이미지 없음):**
```
GPT-4o-mini (텍스트 모드, Vision 안 씀)

시스템 프롬프트:
"유저가 패션 아이템을 찾고 있어. 프롬프트에서 검색에 필요한 정보를 추출해."

입력: "캐주얼한 데님 자켓"
출력:
{
  "intent": "specific_item",
  "items": [
    {
      "category": "Outer",
      "subcategory": "denim-jacket",
      "searchQuery": "casual denim jacket",
      "searchQueryKo": "캐주얼 데님 자켓",
      "fit": "relaxed",
      "fabric": "denim",
      "color": null
    }
  ],
  "styleNode": null,
  "mood": null
}
```

- 토큰: ~200 (Vision 대비 1/150 비용)
- 소요시간: ~1-2초

**프롬프트 + 이미지:**
```
기존 Vision 분석 시스템 프롬프트에 유저 프롬프트 추가:

messages: [
  { role: "system", content: ANALYZE_SYSTEM_PROMPT },
  { role: "user", content: [
    { type: "text", text: "유저 요청: 캐주얼한 데님 자켓 찾아줘\n\n" + ANALYZE_USER_PROMPT },
    { type: "image_url", image_url: { url: base64 } }
  ]}
]
```

- AI가 프롬프트 맥락을 알고 분석 → searchQuery/searchQueryKo가 프롬프트에 맞게 생성
- styleNode, mood 등은 이미지에서 추출 (기존 그대로)

**이미지만:**
- 기존 로직 100% 동일

### POST /api/search-products

변경 없음. 기존 API 그대로 사용. 다만 호출 시:

```
프롬프트가 있는 경우:
  queries: [
    {
      id: "prompt_0",
      category: "Outer",
      searchQuery: "casual denim jacket",
      searchQueryKo: "캐주얼 데님 자켓",
      _fromPrompt: true    ← 프롬프트 유래 표시
    }
  ]

이미지가 있는 경우:
  기존 items 그대로 + styleNode + 기타
```

## 검색 스코어링 변경

### 프롬프트 있을 때

```ts
const SCORE_WEIGHTS = {
  // 기존
  PRIMARY_NODE_BOOST: 0.3,
  SECONDARY_NODE_BOOST: 0.15,
  ATTR_BOOST_PER_MATCH: 0.08,
  ATTR_BOOST_MAX: 4,
  // 프롬프트 관련은 별도 가중 없음
  // → promptKeywords가 koKeywords로 들어오므로 기존 keywordScore가 자동으로 높아짐
}
```

실제로 프롬프트 키워드는 유저가 직접 쓴 한국어라 상품명과 매칭률이 높아서 별도 가중치 없이도 keywordScore가 올라감. 추후 필요하면 가중치 조정.

## 결과 화면 변경

### 프롬프트만 (이미지 없음)

```
┌─────────────────────────────────────────┐
│  🔍 "캐주얼한 데님 자켓"                 │
│                                         │
│  [상품 카드] [상품 카드] [상품 카드] ...   │
│                                         │
│  (이미지 없으므로 룩 분해/핫스팟 없음)      │
│  (무드 분석 없음)                         │
│  (단순 상품 그리드)                       │
└─────────────────────────────────────────┘
```

### 프롬프트 + 이미지

```
┌─────────────────────────────────────────┐
│  🔍 "캐주얼한 데님 자켓"                 │
│                                         │
│  기존 look-breakdown 그대로              │
│  + 프롬프트 관련 아이템이 상단에 하이라이트  │
│                                         │
└─────────────────────────────────────────┘
```

### 이미지만

기존 그대로. 변경 없음.

## 파일 변경 목록

### 신규
- `src/lib/prompts/prompt-search.ts` — 프롬프트 전용 시스템 프롬프트

### 수정
- `src/app/page.tsx` — 메인 UI 교체 (업로드존 → 입력 바)
- `src/app/api/analyze/route.ts` — prompt 파라미터 처리 분기
- `src/components/upload/upload-zone.tsx` → `src/components/search/search-bar.tsx` 리네이밍 or 교체
- `src/components/result/look-breakdown.tsx` — 프롬프트 전용 결과 뷰 추가

### 삭제 가능
- `src/components/upload/style-chips.tsx` — 더 이상 사용 안 하면

## 단계적 구현

### Phase 1 (다음 세션)
- 메인 화면 입력 바 UI
- 프롬프트 + 이미지 조합 API 처리
- 기존 결과 화면 유지

### Phase 2
- 프롬프트 전용 결과 뷰 (이미지 없을 때)
- 프롬프트 키워드 하이라이트

### Phase 3
- 대화형 리파인 ("더 저렴한 거", "다른 브랜드로")
- 검색 히스토리

## NOT in scope

- 회원가입/로그인 (메인 서비스는 비로그인)
- 프롬프트 자동완성/추천
- 음성 입력
- 멀티 이미지 업로드
