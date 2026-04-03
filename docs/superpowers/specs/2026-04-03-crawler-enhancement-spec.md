# Crawler Enhancement Spec

> 크롤러 데이터 보강 — 상품 상세 페이지 크롤링 + 누락 필드 수집

## 문제

현재 크롤러는 **목록 페이지만** 긁고 있어서 수집 가능한 정보가 제한적. 상품 상세 페이지에 있는 색상, 소재, 설명, 서브카테고리 등이 빠져 있어 검색 매칭 품질이 낮음.

## 현재 수집 필드

| 필드 | 수집 | 출처 | 비고 |
|------|------|------|------|
| brand | ✅ | 목록 페이지 | visualaid 브랜드=상품명 이슈 있음 |
| name | ✅ | 목록 페이지 | adekuver/iamshop "상품명 :" 접두어 |
| price | ✅ | 목록 페이지 | |
| original_price | ✅ | 목록 페이지 | |
| sale_price | △ | 목록 페이지 | 대부분 null |
| image_url | ✅ | 목록 페이지 | 대표 이미지 1장만 |
| product_url | ✅ | 목록 페이지 | |
| in_stock | ✅ | 목록 페이지 | |
| gender | ✅ | 플랫폼 설정 | 카테고리별 하드코딩 |
| category | ✅ | 플랫폼 설정 | Outer/Top/Bottom 등 대분류만 |
| platform | ✅ | 플랫폼 설정 | |
| crawled_at | ✅ | 크롤링 시각 | |

## 추가 수집 대상

### Priority 1 — 검색 품질 직결

| 필드 | 타입 | 출처 | 기대 효과 |
|------|------|------|----------|
| **description** | text | 상세 페이지 | 상품 설명 텍스트. 소재, 핏, 디테일 정보 포함. 검색 키워드 풀 대폭 확장 |
| **color** | text | 상세 페이지 옵션 or 상품명 파싱 | "블랙 코트" 검색 시 실제 블랙 상품만 매칭 |
| **material** | text | 상세 페이지 상세정보 | "울 코트" 검색 시 실제 울 소재 매칭 |
| **subcategory** | text | 상세 페이지 or 상품명 파싱 | "Outer" 안에서 코트/자켓/가디건 구분. 양말≠모자 문제 해결 |

### Priority 2 — 데이터 품질

| 필드 | 타입 | 출처 | 기대 효과 |
|------|------|------|----------|
| **images** | text[] | 상세 페이지 | 다중 이미지 (정면/후면/디테일). 나중에 상품 이미지 AI 분석 시 활용 |
| **size_info** | text | 상세 페이지 | 사이즈 가이드 텍스트 |
| **tags** | text[] | 상세 페이지 | 편집샵이 붙인 태그 (있는 경우) |
| **product_code** | text | 상세 페이지 | 브랜드 자체 품번 (정확한 상품 식별) |

### Priority 3 — 부가 정보

| 필드 | 타입 | 출처 | 비고 |
|------|------|------|------|
| **season** | text | 상세 페이지 or 카테고리 | 2026 SS, 2025 FW 등 |
| **fit_info** | text | 상세 페이지 | 오버핏/레귤러핏 등 |
| **origin** | text | 상세 페이지 | 제조국 |

## DB 스키마 변경

```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS material TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS images TEXT[],
  ADD COLUMN IF NOT EXISTS size_info TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS product_code TEXT;

-- 전문 검색 인덱스 확장 (설명 포함)
DROP INDEX IF EXISTS idx_products_search;
CREATE INDEX idx_products_search
  ON products USING gin (to_tsvector('simple', brand || ' ' || name || ' ' || coalesce(description, '') || ' ' || coalesce(color, '') || ' ' || coalesce(material, '')));

-- 서브카테고리 인덱스
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products (subcategory);

-- 색상 인덱스
CREATE INDEX IF NOT EXISTS idx_products_color ON products (color);
```

## 크롤러 구현 방향

### 2단계 크롤링

```
[현재] 목록 페이지만 → 기본 정보
[변경] 목록 페이지 → 기본 정보 → 상세 페이지 → 추가 정보
```

```
Step 1: 목록 페이지 크롤링 (기존 그대로)
  → brand, name, price, image_url, product_url, in_stock

Step 2: 상세 페이지 크롤링 (신규)
  → product_url로 진입
  → description, color, material, subcategory, images, tags 추출
```

### Cafe24 상세 페이지 공통 패턴

```
상품 설명: .cont_detail, #prdDetail, .product-detail, .xans-product-detaildesign
색상 옵션: select[name*="option"] option, .opt_list li
소재 정보: 상세 설명 내 "소재", "원단", "Material" 텍스트 파싱
이미지: .product-detail img, #prdDetail img (다중)
사이즈: 상세 설명 내 테이블 or "사이즈", "Size" 섹션
```

### 성능 고려

- 상세 페이지 크롤링은 상품당 1 request 추가 → 15,000개면 15,000 페이지
- rate limit 필요: 페이지당 1-2초 딜레이
- 병렬 처리: 동시 3-5개 (편집샵 서버 부하 고려)
- 예상 소요시간: 플랫폼당 30분-2시간 (상품 수에 따라)
- **증분 크롤링**: product_url 기준으로 이미 상세 크롤링한 상품은 스킵

### 구현 위치

```
scripts/lib/
  cafe24-engine.ts     ← 기존 목록 크롤링 + 상세 크롤링 추가
  shopify-engine.ts    ← 동일
  detail-parser.ts     ← 신규: 상세 페이지 파싱 로직 (색상/소재/설명 추출)
  
scripts/lib/types.ts   ← Product 인터페이스 필드 추가
scripts/import-products.ts ← 새 필드 임포트 로직 추가
```

## 플랫폼별 상세 페이지 구조 조사 필요

각 편집샵의 상세 페이지 DOM 구조를 probe해야 함:

| 플랫폼 | 상품 수 | 상세 페이지 조사 |
|--------|---------|----------------|
| sculpstore | 5,819 | 미조사 |
| etcseoul | 2,629 | 미조사 |
| fr8ight | 2,551 | 미조사 |
| adekuver | 1,792 | 미조사 |
| slowsteadyclub | 1,648 | 미조사 |
| shopamomento | 612 | 미조사 |
| iamshop | 204 | 미조사 |
| visualaid | 161 | 미조사 (브랜드 추출도 수정 필요) |
| 8division | 45 | 미조사 |

다음 세션에서 `--probe` 모드로 각 사이트 상세 페이지 DOM을 조사하고 셀렉터 매핑하는 것부터 시작.

## 검색 로직 연동

상세 데이터가 들어오면 검색 스코어링도 개선:

```
[현재]
keywordScore: 한국어 키워드 ↔ brand + name

[변경]
keywordScore: 한국어 키워드 ↔ brand + name + description + color + material
→ 검색 대상 텍스트가 대폭 확장되어 매칭률 상승
```

서브카테고리가 있으면:
```
[현재] category = "Accessories" → 양말, 모자, 벨트, 반지 전부 조회
[변경] subcategory = "hat" → 모자만 조회
```

## 단계별 실행

### Phase 1: 조사 + 파일럿
- 9개 플랫폼 상세 페이지 DOM 조사 (probe)
- sculpstore 1개로 파일럿 (가장 상품 많음)
- description, color, images 추출 확인

### Phase 2: 전체 적용 + DB 반영
- 나머지 8개 플랫폼 적용
- DB 마이그레이션 + 재임포트
- 검색 로직에 description/color/material 추가

### Phase 3: 검색 품질 검증
- 어드민 eval에서 매칭률 비교 (before/after)
- Golden Set으로 회귀 테스트

## NOT in scope

- 상품 이미지 AI 분석 (별도 태스크)
- 가격 변동 추적
- 신상품 알림
- 크롤링 스케줄링 자동화
