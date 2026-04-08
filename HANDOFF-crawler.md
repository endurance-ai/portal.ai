# HANDOFF — 크롤러 계속 진행 (2026-04-08)

## 현재 상태
- 브랜치: `feature/search-engine-v3` (PR #16 → dev)
- 아데쿠베 상세 크롤링 진행 중 (3718개, 별도 터미널)
- 러프사이드 상세+리뷰 크롤 완료 (`data/roughside-products.json`, 535개, 리뷰 824건)

## 즉시 할 것

### 1. 아데쿠베 크롤 완료 후 import
```bash
npx dotenv -e .env.local -- npx tsx scripts/import-products.ts --site=adekuver
npx dotenv -e .env.local -- npx tsx scripts/import-products.ts --site=roughside
```

### 2. 나머지 플랫폼 상세+리뷰 크롤링
```bash
npx tsx scripts/crawl.ts --all --detail --reviews
```
- 24개 플랫폼, 3 병렬, ~5-6시간
- Mac Air에서 돌릴 때: `caffeinate -s npx tsx scripts/crawl.ts --all --detail --reviews`

### 3. AI 재분석 (v2 프롬프트)
```bash
npx dotenv -e .env.local -- npx tsx scripts/analyze-products.ts --version=v2
```
- 개선된 프롬프트: 상품명/카테고리 힌트 + season/pattern 추출

### 4. eval 재실행 → pass rate 확인

## 사이트별 상세 데이터 현황

| 사이트 | 설명 | 소재 | 리뷰 | 비고 |
|--------|------|------|------|------|
| roughside | X (상품명+가격만) | 3.4% | **O (824건)** | 리뷰가 핵심 |
| adekuver | **O** (아코디언 패턴) | **O** | X (시스템 없음) | 설명이 핵심 |
| etcseoul | X | X | X (시스템 없음) | 상세 가치 낮음 |
| 나머지 21개 | 미확인 | 미확인 | 미확인 | 크롤 후 확인 필요 |

## 크롤러 커맨드 정리
```bash
# 단일 플랫폼
npx tsx scripts/crawl.ts --site=roughside --detail --reviews

# 전체
npx tsx scripts/crawl.ts --all --detail --reviews

# 리스트만 (상세 없이)
npx tsx scripts/crawl.ts --all

# 플랫폼 목록
npx tsx scripts/crawl.ts --list

# 프로브 (상품 안 긁음)
npx tsx scripts/crawl.ts --probe=roughside

# 리뷰 테스트
npx dotenv -e .env.local -- npx tsx scripts/probe-reviews.ts --site=roughside --count=3
```

## 주의사항
- `detail-parser.ts`: 상세 이미지 수집 제거됨 (썸네일 1장으로 충분)
- `cafe24-engine.ts`: price ₩1,000 미만 → null (상품명 숫자 오파싱 방지)
- 색상 필드에 사이즈 옵션이 잡히는 사이트 있음 (아데쿠베 등) — 영향 적음
- `import-products.ts`는 description/color/material/productCode 지원, **리뷰는 미지원**

## 검색 엔진 v3 가중치
```
subcategory: 0.25 | colorFamily: 0.20 | colorAdjacent: 0.10
stylePrimary: 0.30 | styleSecondary: 0.15
fit: 0.15 | fabric: 0.15 | season: 0.15 | pattern: 0.15
moodTags: 0.05×3 | keywords: 0.05×3
MAX_PER_BRAND: 2 | MAX_PER_PLATFORM: 3
```
