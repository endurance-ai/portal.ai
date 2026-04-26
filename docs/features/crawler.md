# 크롤러

> 32개 자사몰에서 ~81k SKU + 697 브랜드를 수집하는 로컬 실행 배치. Cafe24(Playwright) + Shopify(`/products.json`) 두 엔진.

## 규모

| 지표 | 값 |
|---|---|
| 플랫폼 | 32개 (22 Cafe24 국내 + 10 Shopify 해외) |
| 누적 SKU | ~81,000 (45k 국내 + 35k 해외) |
| 누적 브랜드 | 697 |
| 실행 환경 | 로컬 (CI/스케줄러 없음) |

플랫폼 정의는 `scripts/configs/platforms.ts` 의 `PLATFORMS: SiteConfig[]` 한 배열. 새 사이트는 객체 한 개 추가로 끝. Cafe24는 대부분 기본 셀렉터로 동작 — 안 되면 `selectors` 오버라이드.

---

## 두 엔진

### Cafe24 — Playwright

`scripts/lib/cafe24-engine.ts`. 카테고리 트리를 파싱한 뒤 카테고리별 상품 목록 페이지를 페이지네이션 순회. 상세 페이지는 옵션으로 추가 진입.

| 항목 | 처리 |
|---|---|
| 카테고리 발견 | `manual` (configs/platforms.ts 에 cateNo 직접 명시) 또는 자동 |
| 페이지네이션 | URL `?page=N` |
| 가격 추출 | `pricePattern` regex (예: `/KRW\s*([\d,]+)/`) |
| 이미지 | `product-large` 셀렉터 (사이트별 오버라이드 가능) |
| 상세 | 옵션 `--detail` 시 진입 |
| 리뷰 | 옵션 `--reviews` 시 — board / inline / composite Strategy |

### Shopify — JSON

`scripts/lib/shopify-engine.ts`. `<host>/products.json?limit=250&page=N` 엔드포인트가 모든 Shopify 스토어에 표준 노출됨 → Playwright 없이 fetch만으로 빠름.

| 항목 | 처리 |
|---|---|
| 엔드포인트 | `/products.json?limit=250` 페이지네이션 |
| 가격 | `variants[].price` |
| 이미지 | `images[].src` |
| 옵션 | `variants[].option1/2/3` |
| 메타 | `vendor`, `product_type`, `tags` |

해외 디자이너 스토어 10개 (~35k SKU) 가 이 엔진으로 들어옴 — `feature/international-shopify-crawl` 브랜치에서 import 완료.

---

## Strategy Pattern 파서

`scripts/lib/parsers/` 아래 두 axis로 분리:

```
parsers/
  detail/
    base.ts              ← 기본 detail 파서
    adekuver.ts          ← 사이트별 오버라이드
    blankroom.ts
    visualaid.ts
  review/
    board-review-parser.ts      ← 게시판형 (페이지네이션 있음)
    inline-review-parser.ts     ← 인라인 (스크롤 로딩)
    composite-review-parser.ts  ← board + inline 합성
    noop-review-parser.ts
```

새 사이트가 표준 셀렉터에서 벗어나면 base를 상속해서 오버라이드만 추가. 가이드: `docs/guides/platform-parser-guide.md`.

---

## 실행 명령어

```bash
# 전체
pnpm tsx scripts/crawl.ts --all

# 특정 사이트
pnpm tsx scripts/crawl.ts --site=shopamomento

# 셀렉터 점검 (목록 1페이지만)
pnpm tsx scripts/crawl.ts --probe=<site_key>

# 상세 페이지 진입
pnpm tsx scripts/crawl.ts --site=<key> --detail

# 리뷰까지
pnpm tsx scripts/crawl.ts --site=<key> --detail --reviews
```

산출물: `scripts/output/<site_key>-<timestamp>.json`.

---

## 임포트 파이프라인

```bash
# 크롤링 JSON → Supabase products + product_reviews
pnpm tsx scripts/import-products.ts --file=<path>
```

자사몰의 경우 `brand` 컬럼 자동 채움.

| 임포트 스크립트 | 역할 |
|---|---|
| `scripts/import-products.ts` | 크롤 산출물 → `products` + `product_reviews` upsert |
| `scripts/import-brand-nodes.ts` | Fashion Genome v2 엑셀 → `brand_nodes` |
| `scripts/import-attributes.ts` | brand-db.json → `brand_nodes.attributes` |

---

## 어드민 모니터링

`/admin/crawl-coverage` — 플랫폼별 description / material / review 수집률 표시.
- API: `GET /api/admin/crawl-coverage`
- 새 플랫폼 추가 시 이 대시보드로 누락 필드 추적

---

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `scripts/crawl.ts` | CLI 진입점 (`--all`, `--site=`, `--probe=`, `--detail`, `--reviews`) |
| `scripts/configs/platforms.ts` | 32개 플랫폼 `SiteConfig` 정의 |
| `scripts/lib/cafe24-engine.ts` | Playwright 기반 Cafe24 크롤러 |
| `scripts/lib/shopify-engine.ts` | Shopify `/products.json` 페이지네이션 |
| `scripts/lib/parsers/detail/*` | Strategy Pattern 상세 파서 |
| `scripts/lib/parsers/review/*` | Strategy Pattern 리뷰 파서 |
| `scripts/lib/types.ts` | `SiteConfig`, `CrawlResult` 등 |
| `scripts/import-products.ts` | DB 임포트 |
| `docs/guides/platform-parser-guide.md` | 새 사이트 추가 가이드 |
