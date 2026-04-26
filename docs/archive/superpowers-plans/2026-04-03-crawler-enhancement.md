# Crawler Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크롤러를 2단계(목록→상세) 크롤링으로 확장하여 description, color, material, subcategory 등을 수집하고 검색 매칭 품질을 개선한다.

**Architecture:** 기존 cafe24/shopify 엔진에 상세 페이지 크롤링 단계를 추가. Shopify는 `/products.json` API가 이미 body_html, tags, variants를 반환하므로 추가 요청 불필요. Cafe24는 product_url로 상세 페이지 진입 후 DOM 파싱. 새 필드는 크롤링 JSON에 포함되어 import-products.ts로 DB에 적재.

**Tech Stack:** Playwright (Cafe24 상세 페이지), Supabase PostgreSQL, TypeScript

---

## File Structure

| 파일 | 액션 | 역할 |
|------|------|------|
| `supabase/migrations/011_add_product_detail_columns.sql` | Create | products 테이블 컬럼 추가 + 인덱스 |
| `scripts/lib/types.ts` | Modify | Product, SiteConfig 인터페이스 확장 |
| `scripts/lib/detail-parser.ts` | Create | Cafe24 상세 페이지 파싱 (description, color, material, images, subcategory) |
| `scripts/lib/cafe24-engine.ts` | Modify | 상세 크롤링 단계 추가 |
| `scripts/lib/shopify-engine.ts` | Modify | products.json에서 body_html/tags/variants 추출 |
| `scripts/import-products.ts` | Modify | 새 필드 DB 적재 |
| `src/app/api/search-products/route.ts` | Modify | description/color/material 키워드 매칭 추가 |

---

### Task 1: DB Migration — products 테이블 컬럼 추가

**Files:**
- Create: `supabase/migrations/011_add_product_detail_columns.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 상품 상세 페이지 크롤링 데이터 컬럼 추가
-- Priority 1: 검색 품질 직결
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS material TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Priority 2: 데이터 품질
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS images TEXT[],
  ADD COLUMN IF NOT EXISTS size_info TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS product_code TEXT;

-- 전문 검색 인덱스 확장 (description, color, material 포함)
DROP INDEX IF EXISTS idx_products_search;
CREATE INDEX idx_products_search
  ON products USING gin (
    to_tsvector('simple',
      coalesce(brand, '') || ' ' ||
      coalesce(name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(color, '') || ' ' ||
      coalesce(material, '')
    )
  );

-- 서브카테고리 인덱스
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products (subcategory);

-- 색상 인덱스
CREATE INDEX IF NOT EXISTS idx_products_color ON products (color);
```

- [ ] **Step 2: Supabase에 마이그레이션 적용**

Run: `npx supabase db push` (또는 Supabase Dashboard에서 SQL 실행)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_add_product_detail_columns.sql
git commit -m "feat: products 테이블 상세 크롤링 컬럼 추가 (description, color, material, subcategory 등)"
```

---

### Task 2: Product 타입 확장

**Files:**
- Modify: `scripts/lib/types.ts`

- [ ] **Step 1: Product 인터페이스에 상세 필드 추가**

`scripts/lib/types.ts`의 `Product` 인터페이스 끝에 optional 필드 추가:

```typescript
export interface Product {
  brand: string
  name: string
  category: string
  price: number | null
  originalPrice: number | null
  salePrice: number | null
  priceFormatted: string
  imageUrl: string
  productUrl: string
  inStock: boolean
  gender: string[]
  platform: string
  crawledAt: string
  // ── 상세 페이지 데이터 (Phase 2) ──
  description?: string
  color?: string
  material?: string
  subcategory?: string
  images?: string[]
  sizeInfo?: string
  tags?: string[]
  productCode?: string
}
```

- [ ] **Step 2: SiteConfig에 상세 페이지 셀렉터 추가**

`Cafe24Selectors` 인터페이스에 상세 페이지용 셀렉터 추가:

```typescript
export interface Cafe24DetailSelectors {
  /** 상품 설명 영역 (기본: .cont_detail, #prdDetail) */
  description?: string
  /** 색상 옵션 (기본: select[name*="option"] option) */
  colorOptions?: string
  /** 이미지 (기본: .product-detail img) */
  detailImages?: string
  /** 상품 코드 */
  productCode?: string
}
```

`SiteConfig` 인터페이스에 추가:

```typescript
export interface SiteConfig {
  // ... 기존 필드
  /** Cafe24 상세 페이지 셀렉터 오버라이드 */
  detailSelectors?: Cafe24DetailSelectors
  /** 상세 페이지 크롤링 활성화 (기본: false) */
  crawlDetails?: boolean
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/types.ts
git commit -m "feat: Product, SiteConfig 타입에 상세 크롤링 필드 추가"
```

---

### Task 3: Cafe24 상세 페이지 파서

**Files:**
- Create: `scripts/lib/detail-parser.ts`

- [ ] **Step 1: detail-parser.ts 작성**

```typescript
/**
 * Cafe24 상세 페이지 파싱 — description, color, material, images, subcategory 추출
 */

import type { Page } from "playwright"
import type { Cafe24DetailSelectors } from "./types"

export interface DetailData {
  description: string | null
  color: string | null
  material: string | null
  images: string[]
  sizeInfo: string | null
  productCode: string | null
}

// ─── 셀렉터 폴백 체인 ─────────────────────────────────

const DESCRIPTION_SELECTORS = [
  ".cont_detail",
  "#prdDetail",
  ".product-detail",
  ".xans-product-detaildesign",
  ".detail_cont",
  "#productDetail",
]

const COLOR_OPTION_SELECTORS = [
  'select[name*="option1"] option',
  'select[id*="option1"] option',
  ".opt_list li",
  ".product-option li",
]

const DETAIL_IMAGE_SELECTORS = [
  ".cont_detail img",
  "#prdDetail img",
  ".product-detail img",
  ".xans-product-detaildesign img",
  ".detail_cont img",
]

const PRODUCT_CODE_SELECTORS = [
  ".product_code",
  ".prd_code",
  'span:has-text("상품코드")',
]

// ─── 소재 키워드 ───────────────────────────────────────

const MATERIAL_KEYWORDS = [
  "소재", "원단", "Material", "Fabric", "Composition",
  "cotton", "polyester", "wool", "nylon", "linen",
  "면", "폴리에스터", "울", "나일론", "린넨", "실크", "캐시미어", "레이온", "비스코스",
]

const MATERIAL_PATTERN = new RegExp(
  `(?:소재|원단|Material|Fabric|Composition)\\s*[:：]?\\s*([^\\n<]{3,80})`,
  "i"
)

// ─── 메인 파서 ─────────────────────────────────────────

export async function parseDetailPage(
  page: Page,
  productUrl: string,
  selectors?: Cafe24DetailSelectors
): Promise<DetailData> {
  const result: DetailData = {
    description: null,
    color: null,
    material: null,
    images: [],
    sizeInfo: null,
    productCode: null,
  }

  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(1000) // lazy-load 대기

    result.description = await extractDescription(page, selectors?.description)
    result.color = await extractColor(page, selectors?.colorOptions)
    result.material = extractMaterial(result.description)
    result.images = await extractImages(page, selectors?.detailImages)
    result.productCode = await extractProductCode(page, selectors?.productCode)
  } catch (err) {
    // 개별 상품 실패는 skip, 에러 로그만
    console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
  }

  return result
}

// ─── 개별 추출 함수 ────────────────────────────────────

async function extractDescription(page: Page, override?: string): Promise<string | null> {
  const selectorChain = override ? [override, ...DESCRIPTION_SELECTORS] : DESCRIPTION_SELECTORS

  for (const sel of selectorChain) {
    try {
      const el = await page.$(sel)
      if (!el) continue
      const text = await el.innerText()
      const trimmed = text.trim()
      if (trimmed.length > 10) {
        // 너무 길면 앞 2000자만
        return trimmed.slice(0, 2000)
      }
    } catch { /* next selector */ }
  }
  return null
}

async function extractColor(page: Page, override?: string): Promise<string | null> {
  const selectorChain = override ? [override, ...COLOR_OPTION_SELECTORS] : COLOR_OPTION_SELECTORS

  for (const sel of selectorChain) {
    try {
      const options = await page.$$(sel)
      if (options.length === 0) continue

      const colors: string[] = []
      for (const opt of options) {
        const text = (await opt.innerText()).trim()
        // "선택" 같은 placeholder 제외
        if (text && !text.includes("선택") && !text.includes("Select") && text !== "*") {
          colors.push(text)
        }
      }
      if (colors.length > 0) {
        return colors.join(", ")
      }
    } catch { /* next selector */ }
  }
  return null
}

function extractMaterial(description: string | null): string | null {
  if (!description) return null

  const match = description.match(MATERIAL_PATTERN)
  if (match?.[1]) {
    return match[1].trim()
  }

  // fallback: 소재 키워드 주변 텍스트
  const lines = description.split("\n")
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (MATERIAL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
      const cleaned = line.replace(/^\s*[-·•]\s*/, "").trim()
      if (cleaned.length > 3 && cleaned.length < 200) {
        return cleaned
      }
    }
  }
  return null
}

async function extractImages(page: Page, override?: string): Promise<string[]> {
  const selectorChain = override ? [override, ...DETAIL_IMAGE_SELECTORS] : DETAIL_IMAGE_SELECTORS

  for (const sel of selectorChain) {
    try {
      const imgs = await page.$$(sel)
      if (imgs.length === 0) continue

      const urls: string[] = []
      for (const img of imgs) {
        const src = await img.getAttribute("src") || await img.getAttribute("data-src") || await img.getAttribute("ec-data-src")
        if (src && src.startsWith("http") && !src.includes("/icon_") && !src.includes("/logo_")) {
          urls.push(src)
        }
      }
      if (urls.length > 0) {
        // 최대 10장
        return [...new Set(urls)].slice(0, 10)
      }
    } catch { /* next selector */ }
  }
  return []
}

async function extractProductCode(page: Page, override?: string): Promise<string | null> {
  const selectorChain = override ? [override, ...PRODUCT_CODE_SELECTORS] : PRODUCT_CODE_SELECTORS

  for (const sel of selectorChain) {
    try {
      const el = await page.$(sel)
      if (!el) continue
      const text = (await el.innerText()).trim()
      // "상품코드 : ABC123" 형태에서 코드만 추출
      const codeMatch = text.match(/[:：]\s*(.+)/)
      return codeMatch ? codeMatch[1].trim() : text
    } catch { /* next selector */ }
  }
  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/detail-parser.ts
git commit -m "feat: Cafe24 상세 페이지 파서 (description, color, material, images)"
```

---

### Task 4: Cafe24 엔진 — 상세 크롤링 단계 추가

**Files:**
- Modify: `scripts/lib/cafe24-engine.ts`

- [ ] **Step 1: detail-parser import 추가**

파일 상단에 추가:

```typescript
import { parseDetailPage } from "./detail-parser"
```

- [ ] **Step 2: crawlCafe24 함수에 상세 크롤링 단계 추가**

`crawlCafe24` 함수에서 모든 카테고리 크롤링이 끝난 후 (products 배열 완성 후), `config.crawlDetails === true`일 때 상세 크롤링 실행:

```typescript
// ── 상세 페이지 크롤링 (2단계) ──
if (config.crawlDetails) {
  console.log(`\n   🔍 상세 크롤링 시작 — ${allProducts.length}개 상품`)
  let detailCount = 0

  for (const product of allProducts) {
    try {
      const detail = await parseDetailPage(page, product.productUrl, config.detailSelectors)

      if (detail.description) product.description = detail.description
      if (detail.color) product.color = detail.color
      if (detail.material) product.material = detail.material
      if (detail.images.length > 0) product.images = detail.images
      if (detail.productCode) product.productCode = detail.productCode

      detailCount++
      if (detailCount % 20 === 0) {
        process.stdout.write(`\r   📖 ${detailCount}/${allProducts.length}`)
      }
    } catch {
      // 개별 실패는 skip
    }

    // rate limit
    await page.waitForTimeout(config.crawlDelay || 1500)
  }

  console.log(`\r   ✅ 상세 크롤링 완료 — ${detailCount}/${allProducts.length}`)
}
```

> **Note:** 이 코드의 정확한 삽입 위치는 `crawlCafe24` 함수에서 `return { platform, products: allProducts, stats, errors }` 바로 전. 현재 엔진 코드의 실제 변수명(`allProducts` 등)에 맞춰 조정 필요.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/cafe24-engine.ts
git commit -m "feat: Cafe24 엔진에 2단계 상세 크롤링 추가"
```

---

### Task 5: Shopify 엔진 — products.json에서 상세 데이터 추출

**Files:**
- Modify: `scripts/lib/shopify-engine.ts`

Shopify `/products.json` API는 이미 `body_html`, `tags`, `variants[].option1` 등을 반환하므로 추가 HTTP 요청 불필요.

- [ ] **Step 1: 상품 매핑에 상세 필드 추가**

기존 product 매핑 로직에서 body_html, tags, variants를 추출:

```typescript
// body_html → description (HTML 태그 제거)
const bodyHtml = (shopifyProduct.body_html || "") as string
const description = bodyHtml
  .replace(/<[^>]*>/g, " ")     // HTML 태그 제거
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 2000) || undefined

// tags → tags 배열
const tags = shopifyProduct.tags
  ? (shopifyProduct.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean)
  : undefined

// variants → color (option1이 주로 색상)
const variants = shopifyProduct.variants || []
const colorOptions = [...new Set(
  variants
    .map((v: { option1?: string }) => v.option1)
    .filter(Boolean)
)]
const color = colorOptions.length > 0 ? colorOptions.join(", ") : undefined

// 다중 이미지
const images = (shopifyProduct.images || [])
  .map((img: { src?: string }) => img.src)
  .filter(Boolean)
  .slice(0, 10)
```

Product 객체에 추가:

```typescript
return {
  // ... 기존 필드
  description: description || undefined,
  color: color || undefined,
  tags: tags || undefined,
  images: images.length > 0 ? images : undefined,
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/shopify-engine.ts
git commit -m "feat: Shopify 엔진 — products.json에서 description, color, tags 추출"
```

---

### Task 6: import-products.ts — 새 필드 DB 적재

**Files:**
- Modify: `scripts/import-products.ts`

- [ ] **Step 1: CrawledProduct 인터페이스 확장**

```typescript
interface CrawledProduct {
  brand: string
  name: string
  price: number | null
  priceFormatted: string
  imageUrl: string
  productUrl: string
  inStock: boolean
  gender: string[]
  platform: string
  crawledAt: string
  // 상세 페이지 데이터
  description?: string
  color?: string
  material?: string
  subcategory?: string
  images?: string[]
  sizeInfo?: string
  tags?: string[]
  productCode?: string
}
```

- [ ] **Step 2: rows 매핑에 새 필드 추가**

`rows = raw.map(...)` 안의 return 객체에 추가:

```typescript
return {
  // ... 기존 필드
  description: p.description || null,
  color: p.color || null,
  material: p.material || null,
  subcategory: p.subcategory || null,
  images: p.images || null,
  size_info: p.sizeInfo || null,
  tags: p.tags || null,
  product_code: p.productCode || null,
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/import-products.ts
git commit -m "feat: import-products에 상세 크롤링 필드 적재 추가"
```

---

### Task 7: 검색 스코어링 — description/color/material 매칭 추가

**Files:**
- Modify: `src/app/api/search-products/route.ts`

- [ ] **Step 1: select 쿼리에 새 컬럼 추가**

`searchProducts` 함수의 `.select()` 에 description, color, material 추가:

```typescript
.select("brand, name, price, image_url, product_url, platform, category, style_node, description, color, material, subcategory")
```

- [ ] **Step 2: 키워드 매칭 텍스트 풀 확장**

스코어링 로직에서 `text` 변수 확장:

```typescript
// 기존
const text = `${p.brand} ${p.name}`.toLowerCase()

// 변경 — description, color, material도 매칭 대상
const text = `${p.brand} ${p.name} ${p.description || ""} ${p.color || ""} ${p.material || ""}`.toLowerCase()
```

- [ ] **Step 3: subcategory 필터링 추가 (optional)**

CATEGORY_MAP에 subcategory 매핑 추가하고, subcategory가 있는 상품은 더 정밀하게 필터:

```typescript
// Accessories 카테고리일 때 subcategory 힌트가 있으면 필터링
// 이 부분은 분석 API가 subcategory를 보내줄 때 활성화
// 현재는 DB에 데이터가 쌓이면 활용 가능
```

> **Note:** subcategory 필터링은 분석 API가 아이템별 subcategory를 쿼리에 포함해야 완전히 작동. 현재 단계에서는 keywordScore 텍스트 풀 확장만 적용.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/search-products/route.ts
git commit -m "feat: 검색 스코어링에 description/color/material 키워드 매칭 추가"
```

---

### Task 8: CLI에 --detail 플래그 추가

**Files:**
- Modify: `scripts/crawl.ts`

- [ ] **Step 1: --detail 플래그 파싱**

CLI 플래그 파싱 부분에 추가:

```typescript
const detailFlag = process.argv.includes("--detail")
```

- [ ] **Step 2: runCrawl에서 crawlDetails 활성화**

크롤 실행 시 config에 `crawlDetails` 주입:

```typescript
if (detailFlag) {
  for (const config of configs) {
    config.crawlDetails = true
  }
  console.log("📖 상세 페이지 크롤링 활성화")
}
```

- [ ] **Step 3: help 텍스트에 --detail 추가**

```
--detail           상세 페이지 크롤링 (description, color, material 수집)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/crawl.ts
git commit -m "feat: crawl CLI에 --detail 플래그 추가"
```

---

### Task 9: 파일럿 테스트 — sculpstore

- [ ] **Step 1: sculpstore 1개로 상세 크롤링 파일럿**

```bash
npx tsx scripts/crawl.ts --site=sculpstore --detail
```

Expected: 기존 목록 크롤링 후 상세 페이지 순회, description/color 추출 로그 출력

- [ ] **Step 2: 크롤링 결과 확인**

```bash
# data/sculpstore-products.json에서 상세 필드 확인
node -e "const d=require('./data/sculpstore-products.json'); const withDesc=d.filter(p=>p.description); console.log('description:', withDesc.length, '/', d.length); const withColor=d.filter(p=>p.color); console.log('color:', withColor.length, '/', d.length)"
```

- [ ] **Step 3: DB 적재 테스트**

```bash
npx dotenv -e .env.local -- npx tsx scripts/import-products.ts --site=sculpstore
```

- [ ] **Step 4: 결과에 따라 셀렉터 조정**

파일럿 결과를 보고 description/color 추출률이 낮으면 `detail-parser.ts`의 셀렉터 체인을 조정하거나 `scripts/configs/platforms.ts`에 플랫폼별 `detailSelectors` 오버라이드 추가.

---

## NOT in scope

- 상품 이미지 AI 분석 (별도 태스크)
- 가격 변동 추적
- 신상품 알림
- 크롤링 스케줄링 자동화
- season, fit_info, origin (Priority 3 — 이번에 안 함)
- 분석 API에서 subcategory 전달 (검색 API만 준비)
