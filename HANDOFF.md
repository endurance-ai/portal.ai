# HANDOFF — 2026-04-08

> 검색 품질 개선 (eval pass rate 14% → 40%+ 목표)
> 2개 세션으로 분리: **크롤러 계속** + **프론트엔드/어드민 상세 데이터 표시**

---

## 세션 A: 크롤러 계속 진행

### 현재 상태
- 브랜치: `feature/search-engine-v3` (PR #16 → dev)
- 아데쿠베 상세 크롤링 진행 중 (3718개, 별도 터미널)
- 러프사이드 상세+리뷰 크롤 완료 (`data/roughside-products.json`)

### 즉시 할 것

#### 1. 아데쿠베 크롤 완료 후 import
```bash
npx dotenv -e .env.local -- npx tsx scripts/import-products.ts --site=adekuver
npx dotenv -e .env.local -- npx tsx scripts/import-products.ts --site=roughside
```

#### 2. 나머지 플랫폼 상세+리뷰 크롤링
```bash
npx tsx scripts/crawl.ts --all --detail --reviews
```
- 24개 플랫폼, 3 병렬, ~5-6시간
- Mac Air (8GB RAM)에서 돌릴 때: `caffeinate -s` 필수
- 사이트별 상세 데이터 품질이 다름 (아래 표 참고)

#### 3. AI 재분석 (v2 프롬프트)
상세 데이터 import 후, 개선된 프롬프트(힌트+시즌+패턴)로 재분석:
```bash
npx dotenv -e .env.local -- npx tsx scripts/analyze-products.ts --version=v2
```

#### 4. eval 재실행 → pass rate 확인

### 사이트별 상세 데이터 현황

| 사이트 | 설명 | 소재 | 리뷰 | 비고 |
|--------|------|------|------|------|
| roughside | X (상품명+가격만) | 3.4% | **O (824건)** | 리뷰가 핵심 |
| adekuver | **O** (아코디언 패턴) | **O** | X (시스템 없음) | 설명이 핵심 |
| etcseoul | X (상품명+가격만) | X | X (시스템 없음) | 상세 가치 낮음 |
| 나머지 21개 | 미확인 | 미확인 | 미확인 | 크롤 후 확인 필요 |

### 크롤러 주의사항
- `detail-parser.ts`: 상세 이미지 수집 제거됨 (썸네일 1장으로 충분)
- `cafe24-engine.ts`: price ₩1,000 미만 → null (상품명 숫자 오파싱 방지)
- 색상 필드에 사이즈 옵션이 잡히는 사이트 있음 (아데쿠베 등) — 알려진 이슈, 영향 적음

---

## 세션 B: 프론트엔드 + 어드민 상세 데이터 표시

### 해야 할 것

#### 1. 리뷰 테이블 마이그레이션 (019)
```sql
CREATE TABLE product_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating INTEGER,              -- 1-5 별점 (null 가능)
  text TEXT,                   -- 리뷰 본문
  author TEXT,                 -- 작성자
  review_date TEXT,            -- 작성일
  photo_urls TEXT[],           -- 사진 URL 배열
  body_info JSONB,             -- {height, weight, usualSize, purchasedSize, bodyType}
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_pr_product ON product_reviews (product_id);
```

#### 2. import-products.ts에 리뷰 import 로직 추가
- JSON의 `reviews[]` → `product_reviews` 테이블에 insert
- `reviewCount`, `averageRating` → `products` 테이블에 컬럼 추가 or 조인 쿼리

#### 3. 상품 결과 화면 (`look-breakdown.tsx`)
- 상품 카드에 description 요약 표시
- material 뱃지 (소재)
- 리뷰 요약 (평점 ★, 리뷰 수)
- 가격 null → 금액 미표시 (현재 로직 OK)

#### 4. 어드민 상품 상세 페이지
- description/material/reviews 탭 추가
- 크롤링 커버리지 대시보드 (플랫폼별 수집률)

---

## 이번 세션에서 완료한 것 (2026-04-08)

### 검색 엔진 v3
- 한국어 어휘 매핑 70+ (`korean-vocab.ts`)
- 색상 인접 매칭 16색 (`color-adjacency.ts`)
- 플랫폼 다양성 `MAX_PER_PLATFORM: 3`
- 시즌/패턴 속성 (`season-pattern.ts`) + DB 마이그레이션 017
- 모델샷 오분류 방지 (AI 힌트 + sanitize)
- 프론트 연동 (`page.tsx`에서 season/pattern 전달)
- price null 상품 검색 포함 (`price.is.null OR price.gte`)

### 리뷰 파서
- `review-parser.ts`: Cafe24 보드 페이지 기반, 체형 정보 추출
- `cafe24-engine.ts`에 Step 4로 통합 (`--reviews` 플래그)
- URL 검증 (SSRF 방지)

### 상세 크롤링 최적화
- 단일 `page.evaluate()` IPC 최소화
- 상세 이미지 수집 제거
- crawlDelay 1500→800ms
- 매 상품 상세 로그 출력

### DB
- 마이그레이션 017 (season/pattern) — 적용 완료
- 마이그레이션 018 (data cleansing) — 적용 완료

### 검색 스코어링 가중치 (v3)
```
subcategory: 0.25 | colorFamily: 0.20 | colorAdjacent: 0.10
stylePrimary: 0.30 | styleSecondary: 0.15
fit: 0.15 | fabric: 0.15 | season: 0.15 | pattern: 0.15
moodTags: 0.05×3 | keywords: 0.05×3
MAX_PER_BRAND: 2 | MAX_PER_PLATFORM: 3
```

### eval 현황 (개선 전)
- 72건 리뷰: pass 10 (13.9%), partial 12, fail 50
- 주요 실패: 데이터 부족, 색상 매칭, 어휘 매핑, 플랫폼 편중, 계절감, 무늬
