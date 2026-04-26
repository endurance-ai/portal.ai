# 해외 디자이너 자사몰 크롤 POC (Shopify 기반)

**작성일**: 2026-04-23
**브랜치**: `feature/international-shopify-crawl`
**워크트리**: `/Users/hansangho/Desktop/fashion-ai-intl-crawl`

## 배경

- 국내 편집샵 22개(~26k SKU)만 수집된 상태 — 유저가 프롬프트/이미지로 원하는 "감도"가 해외 디자이너 브랜드 쪽에 더 많음
- 수익화 전 단계 + 법인 없음 → 어필리에이트 피드 경로 봉쇄, 무료/자체 개발만 가능
- SSENSE·Farfetch는 다층 봇가드(Cloudflare+PerimeterX / DataDome)로 무료 스크래핑 불가

## 조사 요약 (2026-04-23 probe)

- **END. Clothing 드롭**: Magento 2 + Next.js + Algolia 조합. Algolia 퍼블릭 키 메서드 제한, 자체 프록시 API `api2.endclothing.com` Akamai 봇가드로 차단 확인
- **해결책**: 감도 높은 디자이너 자사몰 다수가 **Shopify 기반**이라 `/products.json` 공개 엔드포인트로 공짜 수집 가능. 15개 후보 중 10개가 Shopify 확정

## 최종 대상 사이트 (10개)

| # | 브랜드 | URL | 확인 |
|---|---|---|---|
| 1 | Aimé Leon Dore | aimeleondore.com | ✅ USD, 풍부한 variants |
| 2 | Kith | kith.com | ✅ |
| 3 | Stüssy | stussy.com | ✅ |
| 4 | Noah NY | noahny.com | ✅ |
| 5 | Brain Dead | wearebraindead.com | ✅ |
| 6 | CPFM | cactusplantfleamarket.com | ✅ |
| 7 | Drake's | drakes.com | ✅ GBP 예상 |
| 8 | Bodega | bdgastore.com | ✅ |
| 9 | 032c | 032c.com | ✅ EUR 예상 |
| 10 | A.P.C. (US) | apc-us.com | ✅ |

**드롭**: Online Ceramics, Our Legacy, Awake NY, Carhartt WIP, Palace Skateboards (Shopify 아님)

## 기술 접근

### 크롤 방식
- 기존 `scripts/lib/shopify-engine.ts` 재활용
- 엔드포인트: `https://{domain}/products.json?page=N&limit=250`
- 봇가드 없음, 초당 1 req 페이싱으로 안전
- `vendor` / `title` / `product_type` / `tags` / `variants[].price` / `variants[].option1~3` / `images[].src` / `body_html` 모두 JSON에 포함

### 스키마 변경
- `Product` 인터페이스: `currency?: string` 추가 (원본 통화 ISO 코드)
- `SiteConfig` 인터페이스: `sourceCurrency?: "USD" | "EUR" | "GBP" | "KRW"` 추가
- `shopify-engine.ts`:
  - `priceFormatted` 하드코드된 `€` → config.sourceCurrency 기반
  - `price` 필드는 **KRW 환산값** 저장 (고정 환율: USD=1,430 / GBP=1,750 / EUR=1,560, 2026-04 기준)
  - `option1=size`, `option2=color` 구조적 매핑 (기존 variant.title join 방식 개선)

### DB 저장
- 기존 `products` 테이블 그대로 사용 (스키마 마이그 X)
- `platform` 필드로 브랜드 식별 (`ald`, `kith`, `stussy`, `brain-dead` 등)
- `price` = KRW 환산값, 원본 통화는 `tags` 배열에 `currency:usd` 같이 메타로 붙임 (POC 레벨 단순화)
- AI 분석(`product_ai_analysis`)은 샘플 성공 후 배치 돌림

## 일정

| Day | 작업 |
|---|---|
| 1 | 스키마 확장 (`Product.currency`, `SiteConfig.sourceCurrency`) + `shopify-engine.ts` 환율/display 수정 |
| 1 | Aimé Leon Dore 샘플 크롤 (1 페이지, ~250개) — 데이터 품질 확인 |
| 2 | 나머지 9개 브랜드 config 추가 |
| 2 | 10개 브랜드 풀 크롤 (백그라운드) |
| 3 | import-products로 DB 적재 |
| 4 | `product_ai_analysis` 배치 (신규 SKU 대상) |
| 4 | 검색 엔진에서 영문 프롬프트로 검색 테스트 |
| 5 | 측정 리포트 작성 → 리뷰 → PR |

## 측정 지표

- 브랜드별: 총 SKU 수, 필드 커버리지 (brand/price/color/images/description 각 %), 수집 소요 시간
- 합계: 전체 신규 SKU 수, 환산 가격 분포, 중복 제거 후 유니크 SKU
- 검색 품질: 영문 프롬프트 10개 샘플("minimalist black jacket", "90s oversized tee" 등)로 before/after 비교 — 결과 감도 체감

## 성공 기준

- 10개 중 **8개 이상** Shopify 크롤 성공 (403/차단 없이)
- 총 신규 SKU **15,000개 이상**
- 필드 커버리지: brand 100%, price 95%+, color 80%+, images 95%+
- 검색 품질: 영문 프롬프트 10개 중 절반 이상에서 해외 브랜드가 상위 10위 내 노출

## NOT in scope

- ❌ END / SSENSE / Farfetch 크롤링 (봇가드 뚫어야 함, 유료 프록시 필요)
- ❌ 어필리에이트 네트워크 연동 (법인 필요)
- ❌ `korean-vocab.ts` 영문 대응 전면 리팩토링 — POC에서 문제 체감 후 별도 작업
- ❌ 사이즈 시스템 정규화 (EU/UK/US → KR) — 원본 문자열 저장만
- ❌ 실시간 환율 API — 고정 환율로 처리
- ❌ 재고/가격 변동 추적 (크롤 시점 스냅샷만)
- ❌ 리뷰 수집 (자사몰 리뷰는 제각각, 별도 작업)

## Open items / 결정 지점

- **환율 고정값 OK?** 2026-04 기준 USD 1,430 / GBP 1,750 / EUR 1,560. POC 이후 실시간 환율 필요 시 별도 이슈
- **A.P.C.는 US 몰(apc-us.com)만** — 글로벌 apc.fr은 확인 안 함. 필요 시 추가
- **POC 이후 SSENSE 재도전 조건**: 풀 공짜로 안 되는 게 확정된 후, Scrapfly/ZenRows 월 $30 예산 허가 시 재개
