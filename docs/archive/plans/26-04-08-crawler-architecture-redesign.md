# Crawler Architecture Redesign

> 플랫폼별 파서 분리 + Strategy Pattern + 크롤링 속도 개선

## 현재 구조 (AS-IS)

```
scripts/
  crawl.ts              (373L) — CLI 오케스트레이터
  import-products.ts    (321L) — JSON → Supabase 로더
  probe-reviews.ts      (165L) — 리뷰 테스트 하네스
  configs/
    platforms.ts        (709L) — 35개 플랫폼 설정 (26 active, 9 disabled)
  lib/
    types.ts            (144L) — 공유 인터페이스
    cafe24-engine.ts    (590L) — God Object: 카테고리 탐색 + 리스트 + 상세 + 리뷰
    shopify-engine.ts   (165L) — API 기반 크롤러
    detail-parser.ts    (151L) — 9개 셀렉터 폴백 체인 (공통)
    review-parser.ts    (350L) — 보드/인라인 2가지 전략 (공통, 중복 코드)
    product-analyzer.ts (146L) — LiteLLM 이미지 분석
```

### 핵심 문제

| 문제 | 위치 | 영향 |
|------|------|------|
| **God Object** | cafe24-engine.ts (590L) | 카테고리 탐색, 리스트 수집, 상세, 리뷰 4가지 책임 혼재 |
| **공통 파서 = 공통 장애** | detail-parser.ts, review-parser.ts | 플랫폼 A 맞춰 수정 → 플랫폼 B 깨짐 |
| **전략 중복** | review-parser.ts | 보드/인라인 전략에서 체형 regex 70줄+ 중복 |
| **셀렉터 하드코딩** | detail-parser.ts 19-35L | 새 플랫폼 = 코어 파일 수정 필요 |
| **매직 넘버 산재** | 전체 | timeout 15000/30000, delay 800/2000, PARALLEL_LIMIT=3 |
| **로깅 비구조화** | console.log 산재 | 디버깅/모니터링 어려움 |
| **리뷰 크롤 속도** | review-parser.ts | 상품당 30-60초 (순차 상세 페이지 방문) |

---

## 개선 구조 (TO-BE)

### 패키지 구조

```
scripts/
  crawl.ts                    — CLI 엔트리 (변경 최소화)
  import-products.ts          — JSON → Supabase (변경 없음)
  configs/
    platforms.ts              — SiteConfig 정의 (parserKey 필드 추가)
  lib/
    types.ts                  — 공유 인터페이스 + Strategy 인터페이스
    logger.ts                 — 구조화 로거 (NEW)
    body-info-extractor.ts    — 체형 정보 regex 유틸 (NEW, 중복 제거)
    engines/
      base-engine.ts          — 추상 크롤 엔진 (NEW)
      cafe24-engine.ts        — Cafe24 리스트 크롤 (리팩토링)
      shopify-engine.ts       — Shopify API 크롤 (이동)
    parsers/
      detail/
        types.ts              — IDetailParser 인터페이스 (NEW)
        base-detail-parser.ts — 기본 폴백 체인 (기존 로직)
        blankroom-parser.ts   — .product-description (NEW)
        visualaid-parser.ts   — .tab_wrap (NEW)
        adekuver-parser.ts    — .item.open .content (NEW)
        index.ts              — getDetailParser(platform) 팩토리 (NEW)
      review/
        types.ts              — IReviewParser 인터페이스 (NEW)
        board-review-parser.ts   — 보드 기반 (기존 로직 분리)
        inline-review-parser.ts  — 인라인 기반 (기존 로직 분리)
        composite-review-parser.ts — 보드 → 인라인 → WRITE 폴백 체인 (NEW)
        index.ts              — getReviewParser(platform) 팩토리 (NEW)
```

### 핵심 인터페이스

```typescript
// ─── Detail Parser Strategy ─────────────────────
interface IDetailParser {
  parse(page: Page, productUrl: string): Promise<DetailData>
}

// ─── Review Parser Strategy ─────────────────────
interface IReviewParser {
  parse(page: Page, maxReviews: number): Promise<ReviewData>
}

// ─── Crawl Engine (Template Method) ─────────────
abstract class BaseCrawlEngine {
  abstract discoverCategories(page: Page, config: SiteConfig): Promise<Category[]>
  abstract collectProducts(page: Page, category: Category): Promise<Product[]>

  // Template Method — 공통 오케스트레이션
  async crawl(config: SiteConfig): Promise<CrawlResult> {
    const browser = await this.launchBrowser()
    const page = await browser.newPage()
    const categories = await this.discoverCategories(page, config)

    const products: Product[] = []
    for (const cat of categories) {
      products.push(...await this.collectProducts(page, cat))
    }

    // 상세 + 리뷰는 주입된 파서가 담당
    if (config.crawlDetails) {
      const detailParser = getDetailParser(config.key)
      await this.enrichDetails(page, products, detailParser)
    }
    if (config.crawlReviews) {
      const reviewParser = getReviewParser(config.key)
      await this.enrichReviews(page, products, reviewParser)
    }

    await browser.close()
    return this.buildResult(config, products)
  }
}

// ─── SiteConfig 확장 ────────────────────────────
interface SiteConfig {
  // ... 기존 필드
  parserKey?: string           // 플랫폼별 파서 키 (없으면 key 사용)
  detailSelectors?: {          // 기존 유지 — base parser가 참조
    description?: string
    colorOptions?: string
    productCode?: string
  }
  timeouts?: {                 // 플랫폼별 타임아웃
    pageLoad?: number          // 기본 15000
    renderDelay?: number       // 기본 800
    reviewDelay?: number       // 기본 1500
  }
}
```

### Strategy 패턴 적용

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  crawl.ts   │────▶│ BaseCrawlEngine  │────▶│   IDetailParser    │
│  (CLI)      │     │ (Template Method)│     ├────────────────────┤
└─────────────┘     │                  │     │ BaseDetailParser   │ ← 9셀렉터 폴백
                    │ discoverCateg()  │     │ BlankroomParser    │ ← .product-description
                    │ collectProducts()│     │ VisualalidParser   │ ← .tab_wrap
                    │ enrichDetails()  │     │ AdekuverParser     │ ← .item.open
                    │ enrichReviews()  │     └────────────────────┘
                    └──────────────────┘
                            │
                            ▼
                    ┌────────────────────┐
                    │  IReviewParser     │
                    ├────────────────────┤
                    │ BoardReviewParser  │ ← /board/product/list
                    │ InlineReviewParser │ ← /article/review/
                    │ CompositeParser    │ ← 보드→인라인→WRITE 체인
                    └────────────────────┘
```

### Factory 등록

```typescript
// parsers/detail/index.ts
const DETAIL_PARSERS: Record<string, () => IDetailParser> = {
  blankroom:  () => new BlankroomDetailParser(),
  visualaid:  () => new VisualalidDetailParser(),
  adekuver:   () => new AdekuverDetailParser(),
  // 등록 안 된 플랫폼 → BaseDetailParser (기존 폴백 체인)
}

export function getDetailParser(platformKey: string): IDetailParser {
  const factory = DETAIL_PARSERS[platformKey]
  return factory ? factory() : new BaseDetailParser()
}
```

**새 플랫폼 추가 시:**
1. `parsers/detail/newsite-parser.ts` 파일 생성
2. `IDetailParser` 구현 (셀렉터 지정)
3. `index.ts` 팩토리에 등록
4. **코어 코드 수정 0줄**

---

## 중복 코드 제거

### body-info-extractor.ts (체형 정보 공통 유틸)

현재 review-parser.ts에서 보드/인라인 양쪽에 동일 regex 70줄+ 중복.

```typescript
// lib/body-info-extractor.ts
export function extractBodyInfo(text: string): ReviewerBody | null {
  const height = text.match(/(?:키|신장|Height)\s*[:：]?\s*(\d{2,3}\s*(?:cm|CM)?)/i)
  const weight = text.match(/(?:몸무게|체중|Weight)\s*[:：]?\s*(\d{2,3}\s*(?:kg|KG)?)/i)
  const usualSize = text.match(/(?:평소\s*사이즈|보통\s*사이즈)\s*[:：]?\s*([^\n,]{1,10})/i)
  const purchasedSize = text.match(/(?:구매\s*사이즈|선택\s*사이즈)\s*[:：]?\s*([^\n,]{1,10})/i)
  const bodyType = text.match(/(?:체형|Body\s*Type)\s*[:：]?\s*([^\n,]{1,20})/i)

  if (!height && !weight && !usualSize && !purchasedSize && !bodyType) return null

  return {
    height: height?.[1]?.trim() || null,
    weight: weight?.[1]?.trim() || null,
    usualSize: usualSize?.[1]?.trim() || null,
    purchasedSize: purchasedSize?.[1]?.trim() || null,
    bodyType: bodyType?.[1]?.trim() || null,
  }
}
```

→ BoardReviewParser, InlineReviewParser 양쪽에서 `extractBodyInfo(content)` 호출.

### 셀렉터 유틸 (detail parser 공통)

```typescript
// parsers/detail/base-detail-parser.ts
export class BaseDetailParser implements IDetailParser {
  protected descriptionSelectors = [
    ".cont_detail", "#prdDetail", ".product-detail",
    ".xans-product-detaildesign", ".detail_cont",
    "#productDetail", ".prd_detail_box",
  ]

  async parse(page: Page, url: string): Promise<DetailData> {
    // 기존 폴백 체인 로직 (변경 없음)
  }
}

// parsers/detail/blankroom-parser.ts
export class BlankroomDetailParser extends BaseDetailParser {
  protected descriptionSelectors = [".product-description"]
  // 나머지는 부모 로직 그대로 사용
}
```

→ 플랫폼별 파서는 **셀렉터만 오버라이드**, 파싱 로직은 상속.

---

## 크롤링 속도 개선

### 현재 병목

| 구간 | 현재 | 소요 시간 |
|------|------|----------|
| 리스트 크롤 | 카테고리 순차 + 페이지 순차 | ~2분/사이트 |
| 상세 크롤 | 상품 순차 (800ms 딜레이) | ~N×1.5초 |
| 리뷰 크롤 | 상품 순차 → 리뷰 순차 | ~N×30초 |
| 전체 (26사이트) | 3 병렬 | ~5-6시간 |

### 개선안

#### 1. 상세 크롤: 브라우저 컨텍스트 병렬화

현재 1개 page에서 순차 방문. **3개 page를 동시에 열어** 상세 크롤을 병렬화.

```typescript
// 현재: 순차
for (const product of products) {
  await parseDetailPage(page, product.productUrl)
}

// 개선: 3-way 병렬
const DETAIL_CONCURRENCY = 3
for (let i = 0; i < products.length; i += DETAIL_CONCURRENCY) {
  const batch = products.slice(i, i + DETAIL_CONCURRENCY)
  await Promise.all(batch.map(async (p) => {
    const ctx = await browser.newContext()
    const pg = await ctx.newPage()
    await detailParser.parse(pg, p.productUrl)
    await ctx.close()
  }))
}
```

**예상 효과**: 상세 크롤 시간 ~1/3 (3배 속도)

#### 2. 리뷰 크롤: 리뷰 보드 직접 접근 + 상세 방문 최소화

현재 리뷰 1건마다 상세 페이지 방문 (1.5초). 보드 목록에서 뽑을 수 있는 데이터는 보드에서 처리하고, **체형 정보가 있는 리뷰만** 상세 방문.

```typescript
// 보드에서 기본 데이터 한번에 추출
const boardReviews = await parseBoardList(page)

// 체형 정보가 필요한 리뷰만 상세 방문 (50% 이상 줄어듦)
const needDetail = boardReviews.filter(r => r.detailUrl && !r.text.includes("키:"))
```

**예상 효과**: 리뷰 크롤 시간 ~1/2

#### 3. 불필요한 리소스 차단

이미지/CSS/폰트 로딩 차단으로 페이지 로드 속도 개선.

```typescript
await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2}', route => route.abort())
```

**예상 효과**: 페이지 로드 시간 ~40% 감소

#### 4. 병렬 사이트 수 증가 (PARALLEL_LIMIT 3→5)

Mac Air 8GB 기준 브라우저 3개가 한계였지만, 리소스 차단 적용 시 메모리 사용량 감소 → 5개까지 가능.

**예상 효과**: 전체 시간 ~40% 감소

#### 총합 개선 효과

| 구간 | 현재 | 개선 후 | 배수 |
|------|------|---------|------|
| 상세 크롤 (1사이트) | ~N×1.5초 | ~N×0.5초 | **3x** |
| 리뷰 크롤 (1사이트) | ~N×30초 | ~N×15초 | **2x** |
| 전체 (26사이트) | ~5-6시간 | ~1.5-2시간 | **3x** |

---

## 삭제/정리 대상

| 파일/코드 | 이유 |
|-----------|------|
| detail-parser.ts 내 `.product-description` (방금 추가) | 플랫폼별 파서로 이동 |
| review-parser.ts 내 `parseInlineReviewDetails()` 체형 regex | body-info-extractor.ts로 추출 |
| review-parser.ts 내 `parseBoardReviewsWithDetail()` 체형 regex | 동일 |
| cafe24-engine.ts 내 `page.evaluate()` 151줄 블록 | 유틸 함수 분리 (테스트 가능) |
| 매직 넘버 전체 | `SiteConfig.timeouts` + 상수 파일로 이동 |

---

## NOT in scope

- Shopify 엔진 리팩토링 (현재 165줄, 단순, 문제 없음)
- 새 플랫폼 추가 (리팩토링 완료 후 별도 작업)
- product-analyzer.ts 변경 (AI 분석은 별도 파이프라인)
- UI/프론트엔드 변경
- DB 스키마 변경 (019 마이그레이션은 이미 적용)

---

## 구현 순서

1. **인터페이스 정의** — `IDetailParser`, `IReviewParser`, types 정리
2. **공통 유틸 추출** — `body-info-extractor.ts`, `logger.ts`
3. **Detail Parser 분리** — base + 플랫폼별 (blankroom, visualaid, adekuver)
4. **Review Parser 분리** — board + inline + composite
5. **Factory 등록** — `getDetailParser()`, `getReviewParser()`
6. **cafe24-engine 리팩토링** — Template Method, 파서 주입
7. **속도 개선** — 리소스 차단, 상세 병렬화, 리뷰 최적화
8. **기존 사이트 검증** — roughside, adekuver, blankroom 으로 회귀 테스트
