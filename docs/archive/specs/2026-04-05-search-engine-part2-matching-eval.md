# Part 2: 검색 엔진 리팩토링 + Eval 파이프라인

> **목표**: enum 기반 매칭으로 검색 엔진을 전면 교체하고, 자동 평가 파이프라인으로 품질을 지속 개선할 수 있는 구조를 만든다.
>
> **전제조건**: Part 1 (인프라 + 배치 분석) 완료 — `product_ai_analysis` 테이블에 데이터가 있어야 함.

---

## 배경

### Part 1 완료 후 상태
- `product_ai_analysis` 테이블에 ~15,000개 상품의 정규화된 enum 태그 존재
- 프론트 분석(`analysis_items`)도 동일 enum 체계 사용
- LiteLLM 게이트웨이 가동 중

### 현재 검색 로직의 문제 (변경 대상)

**현재** (`src/app/api/search-products/route.ts`):
```
1. products 테이블에서 100개 조회 (category, gender, in_stock 필터)
2. 한국어 키워드 → brand+name+description+color+material 텍스트 매칭 (0~1)
3. 노드 부스트: primary=0.3, secondary=0.15
4. Attr 부스트: 영어 키워드 ↔ brand attributes (0.08 × max 4)
5. totalScore = keywordScore + nodeBoost + attrBoost
6. 상위 5개, 브랜드당 max 2
```

**문제점**:
- 키워드 매칭이 products의 빈약한 텍스트에 의존 → 매칭률 저조
- 동의어 처리 없음 ("차콜" ≠ "grey")
- enum ↔ 자유텍스트 불일치

---

## 1. 검색 엔진 v2: Enum 매칭

### 1.1 새로운 검색 플로우

```
1. 프론트에서 받는 입력:
   - items[]: { category, subcategory, fit, fabric, color_family, style_node }
   - gender: "male" | "female" | "unisex"
   - styleNode: { primary, secondary }

2. product_ai_analysis JOIN products:
   - WHERE pai.version = (활성 버전)
   - AND products.in_stock = true
   - AND pai.category = item.category
   - [선택] AND products.gender 필터

3. Enum 매칭 스코어링:
   - category 일치: 필수 (WHERE 절)
   - subcategory 일치: +0.25
   - fit 일치: +0.15
   - fabric 일치: +0.15
   - color_family 일치: +0.20
   - style_node 일치 (primary): +0.30
   - style_node 일치 (secondary): +0.15
   - mood_tags 겹침: +0.05 × 겹치는 수 (max 3)

4. 보조 키워드 스코어 (선택 — Approach A에서 C로 확장 시):
   - keywords_ko 겹침 보너스

5. 상위 5개, 브랜드당 max 2
```

### 1.2 스코어 가중치 (초안 — 튜닝 대상)

| 매칭 항목 | 가중치 | 비고 |
|-----------|--------|------|
| category | 필수 (WHERE) | 일치하지 않으면 후보에서 제외 |
| subcategory | 0.25 | overcoat ↔ overcoat |
| color_family | 0.20 | GREY ↔ GREY |
| style_node (primary) | 0.30 | C ↔ C |
| style_node (secondary) | 0.15 | D ↔ D |
| fit | 0.15 | oversized ↔ oversized |
| fabric | 0.15 | wool ↔ wool |
| mood_tags 겹침 | 0.05 × N (max 3) | 미니멀 ∩ 미니멀 |
| **이론적 최대** | **~1.40** | |

> 가중치는 Eval 파이프라인으로 튜닝. 초기값은 직감 기반 시작.

### 1.3 프론트 분석 프롬프트 변경

`color_family` enum을 프론트 분석에도 추가:

```
// analyze.ts에 추가
color_family (pick one):
  BLACK, WHITE, GREY, NAVY, BLUE, BEIGE, BROWN, GREEN,
  RED, PINK, PURPLE, ORANGE, YELLOW, CREAM, KHAKI, MULTI
```

각 item에 `colorFamily` 필드 추가 → 검색 API로 전달.

### 1.4 검색 API 인터페이스 변경

**Request** (변경 후):
```json
{
  "queries": [
    {
      "id": "outer",
      "category": "Outer",
      "subcategory": "overcoat",
      "fit": "oversized",
      "fabric": "wool",
      "colorFamily": "GREY",
      "searchQuery": "oversized charcoal grey wool coat men",
      "searchQueryKo": "오버사이즈 차콜 울 코트 남성"
    }
  ],
  "gender": "male",
  "styleNode": { "primary": "C", "secondary": "D" },
  "moodTags": ["미니멀", "하이엔드"],
  "analysisVersion": "v1",
  "_logId": "uuid"
}
```

**Response** (기존과 동일한 형태 유지):
```json
{
  "results": [
    {
      "id": "outer",
      "products": [
        {
          "brand": "AURALEE",
          "title": "AURALEE Wool Cashmere Melton Chesterfield Coat",
          "price": "₩890,000",
          "imageUrl": "https://...",
          "link": "https://...",
          "platform": "shopamomento"
        }
      ]
    }
  ]
}
```

---

## 2. Eval 파이프라인

### 2.1 개요

```
골든셋 (기대 결과)
     ↓
자동 평가 스크립트 실행
     ↓                  ↓
precision/recall 계산    실패 케이스 수집
     ↓                  ↓
어드민 대시보드 표시     개선 포인트 식별
     ↓
가중치 조정 / 프롬프트 수정 → 재평가
```

### 2.2 골든셋 확장

기존 `eval_golden_set` 테이블 확장:

```sql
-- 013_extend_golden_set.sql

ALTER TABLE eval_golden_set
  ADD COLUMN IF NOT EXISTS expected_products JSONB,
  -- [{"brand": "AURALEE", "category": "Outer", "subcategory": "overcoat"}]
  ADD COLUMN IF NOT EXISTS expected_color_family TEXT,
  ADD COLUMN IF NOT EXISTS expected_fit TEXT,
  ADD COLUMN IF NOT EXISTS expected_fabric TEXT,
  ADD COLUMN IF NOT EXISTS test_type TEXT DEFAULT 'image'
  -- 'image': 이미지 기반 테스트, 'prompt': 프롬프트 기반 테스트
;
```

### 2.3 자동 평가 스크립트

```bash
npx tsx scripts/eval-search.ts --version v1
```

**평가 메트릭**:
- **Hit Rate**: 골든셋 기대 상품이 상위 5개에 포함되는 비율
- **Category Accuracy**: 올바른 카테고리 상품이 반환되는 비율
- **Style Node Precision**: 반환된 상품의 style_node가 기대와 일치하는 비율
- **Empty Rate**: 결과가 0개인 쿼리 비율 (낮을수록 좋음)

### 2.4 매칭 실패 로깅

```sql
-- 014_search_quality_logs.sql

CREATE TABLE search_quality_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES analyses(id),
  item_id TEXT NOT NULL,                    -- "outer", "top", etc.
  query_category TEXT,
  query_subcategory TEXT,
  query_color_family TEXT,
  query_style_node TEXT,
  result_count INT NOT NULL,                -- 반환된 상품 수
  top_score NUMERIC,                        -- 최고 스코어
  avg_score NUMERIC,                        -- 평균 스코어
  score_breakdown JSONB,                    -- 상세 스코어
  is_empty BOOLEAN DEFAULT false,           -- 결과 0개 여부
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sql_empty ON search_quality_logs (is_empty) WHERE is_empty = true;
CREATE INDEX idx_sql_category ON search_quality_logs (query_category);
CREATE INDEX idx_sql_created ON search_quality_logs (created_at DESC);
```

### 2.5 어드민 대시보드 연동

어드민 `/admin/eval` 페이지에 추가:

1. **검색 품질 대시보드**
   - 일별 Hit Rate / Empty Rate 트렌드 차트
   - 카테고리별 매칭 성공률
   - 최다 실패 쿼리 유형 목록

2. **골든셋 관리**
   - 골든셋 추가/수정 UI
   - 일괄 평가 실행 버튼
   - 버전별 비교 (v1 vs v2 결과 나란히)

3. **가중치 튜닝 (선택)**
   - 어드민에서 가중치 슬라이더 조정
   - 실시간 골든셋 재평가 미리보기

---

## 3. Enum 사전 관리

### 3.1 구조

enum은 `src/lib/enums/product-enums.ts`에서 중앙 관리. 향후 DB나 config로 이동 고려.

```typescript
// src/lib/enums/product-enums.ts
export const CATEGORIES = ["Outer", "Top", "Bottom", "Shoes", "Bag", "Dress", "Accessories"] as const
export const SUBCATEGORIES = { Outer: ["overcoat", ...], ... } as const
export const FITS = ["oversized", "relaxed", ...] as const
export const FABRICS = ["cotton", "wool", ...] as const
export const COLOR_FAMILIES = ["BLACK", "WHITE", ...] as const

// 유효성 검증 함수
export function isValidCategory(v: string): v is Category { ... }
export function isValidFit(v: string): v is Fit { ... }
// ...
```

### 3.2 프롬프트 자동 생성

기존 `buildNodeReference()`처럼, enum에서 프롬프트 텍스트를 자동 생성:

```typescript
export function buildEnumReference(): string {
  return `category: ${CATEGORIES.join(", ")}
subcategory by category:
${Object.entries(SUBCATEGORIES).map(([k, v]) => `  ${k}: ${v.join(", ")}`).join("\n")}
fit: ${FITS.join(", ")}
...`
}
```

→ `analyze.ts`와 `analyze-prompt.ts` 양쪽에서 이 함수를 사용하여 enum 동기화 보장.

---

## 4. 실행 계획

### Phase 1: 검색 엔진 v2 (1.5일)
1. `src/lib/enums/product-enums.ts` 완성 (Part 1에서 시작, 여기서 마무리)
2. `analyze.ts` 프롬프트에 `color_family` 추가
3. `search-products/route.ts` enum 매칭으로 전면 교체
4. 프론트 `page.tsx` → 검색 API 호출 시 enum 필드 전달
5. 수동 테스트: 5개 이상 시나리오로 결과 확인

### Phase 2: 매칭 로깅 (0.5일)
1. `014_search_quality_logs.sql` 마이그레이션
2. 검색 API에 품질 로깅 추가
3. 어드민 `/admin/search-quality` 간단 뷰

### Phase 3: Eval 파이프라인 (1일)
1. `013_extend_golden_set.sql` 마이그레이션
2. 골든셋 10-20개 수동 생성
3. `scripts/eval-search.ts` 구현
4. 첫 평가 실행 + 결과 분석

### Phase 4: 튜닝 (0.5일+)
1. 가중치 조정 → 재평가 반복
2. 프롬프트 튜닝 (필요 시 배치 재분석)
3. 목표 Hit Rate 설정 및 달성

---

## NOT in scope (이번에 안 하는 것)

- 벡터 유사도 검색 (Qdrant)
- 실시간 가중치 A/B 테스트
- 유저 피드백 기반 자동 튜닝
- 어드민 가중치 슬라이더 (수동 코드 조정으로 시작)
- 검색 결과 캐싱
- 다국어 검색 (한국어 중심, 영어는 보조)
