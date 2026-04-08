# HANDOFF — 프론트엔드 + 어드민 상세 데이터 표시 (2026-04-08)

## 배경
검색 엔진 v3 + 크롤러 상세/리뷰 수집이 완료된 후, 수집된 데이터를 프론트엔드와 어드민에서 보여줘야 함.

## 해야 할 것

### 1. 리뷰 테이블 마이그레이션 (019)
`product_reviews` 테이블 생성:
- product_id (FK → products), rating (1-5 nullable), text, author, review_date, photo_urls (TEXT[]), body_info (JSONB — {height, weight, usualSize, purchasedSize, bodyType})
- 인덱스: product_id

### 2. import-products.ts에 리뷰 import 로직 추가
- 크롤 JSON의 `reviews[]` → `product_reviews` 테이블에 insert
- `reviewCount`, `averageRating` → products 테이블에 컬럼 추가 or product_reviews에서 조인 쿼리

### 3. 상품 결과 화면 (`src/components/result/look-breakdown.tsx`)
- 상품 카드에 description 요약 표시 (truncate)
- material 뱃지
- 리뷰 요약 (평점 ★4.5, 리뷰 23건)
- 가격 null → 금액 미표시 (현재 로직 이미 OK: `p.price ? \`₩\${...}\` : ""`)

### 4. 어드민 상품 상세 페이지 (`src/app/admin/`, `src/components/admin/`)
- 상품 상세에 description/material/color 탭 추가
- 리뷰 목록 표시 (본문, 별점, 작성자, 날짜, 체형 정보)
- 크롤링 커버리지 대시보드 (플랫폼별 description/material/review 수집률)

## 참고

### 현재 DB 스키마 (products 테이블 — 상세 관련 컬럼)
```
description TEXT          -- 상세 페이지 설명 (max 2000자)
color TEXT                -- 색상 옵션 (max 500자)
material TEXT             -- 소재 (max 200자)
product_code TEXT         -- 상품 코드
images TEXT[]             -- 상세 이미지 URL 배열 (현재 미수집)
```

### 크롤 JSON의 리뷰 구조 (import 시 참고)
```json
{
  "reviewCount": 4,
  "averageRating": null,
  "reviews": [
    {
      "rating": null,
      "text": "너무 만족한 와플티입니다",
      "author": "최****",
      "date": "2026-04-08",
      "photoUrls": [],
      "body": null
    }
  ]
}
```
- `body`가 있을 때: `{ "height": "170cm", "weight": "65kg", "usualSize": "M", "purchasedSize": "L", "bodyType": "보통" }`

### 검색 API 응답에 추가 가능한 필드
현재 `/api/search-products` 응답:
```json
{ "brand", "price", "platform", "imageUrl", "link", "title" }
```
description/material/reviewCount 등을 추가하려면 `route.ts`의 select + 응답 매핑 수정 필요.
