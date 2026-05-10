# 크롤러

> **2026-05-05 부로 별도 리포로 분리됨** → [`endurance-ai/crawler`](https://github.com/endurance-ai/crawler)

이 kiko.ai 리포는 크롤러가 적재한 데이터의 **소비자**다. 검색·추천·어드민에서 Supabase 의 `products`, `brands`, `product_images` 등을 read-only 로 사용한다.

## 데이터 흐름

```
endurance-ai/crawler (EC2 batch)
   ↓ Supabase write  (products, brands, product_images, ...)
   ↓ R2 write        (이미지 바이너리)
Supabase + R2
   ↓
endurance-ai/kiko.ai-app (Vercel)  ← 이 리포
   - 검색 / 추천 / 어드민
```

크롤러와 kiko.ai 사이에 **직접 호출 / API / 이벤트버스 없음.** DB 가 유일한 계약.

## DB 스키마 owner

`supabase/migrations/` 는 kiko.ai 가 owner. 스키마 변경 시:

1. kiko.ai 에서 마이그레이션 작성 / 적용
2. crawler 리포에서 `supabase gen types` 재실행 후 PR

## 분리 시점 규모 (참고)

| 지표 | 값 |
|---|---|
| 플랫폼 | 32개 (22 Cafe24 KR + 10 Shopify global) |
| SKU | ~81,000 (45k KR + 35k global) |
| 브랜드 | 697 |

확장 로드맵 (ZARA, H&M, 29CM, 무신사, 유니클로, 후르츠 등) 은 crawler 리포에서 진행.

## 분리 배경

상세는 `docs/archive/plans/26-05-05-crawler-separation.md` 참고.
