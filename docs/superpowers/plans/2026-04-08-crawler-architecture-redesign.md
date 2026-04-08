# Crawler Architecture Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크롤러를 플랫폼별 Strategy Pattern으로 리팩토링하여 새 플랫폼 추가 시 코어 코드 수정 0줄을 달성하고, 크롤링 속도를 3배 개선한다.

**Architecture:** Detail/Review 파서를 인터페이스로 추상화하고 플랫폼별 구현체를 Factory에 등록. cafe24-engine에서 파서를 주입받아 사용. 체형 정보 추출 등 중복 로직은 공통 유틸로 추출.

**Tech Stack:** TypeScript, Playwright, Supabase

---

## File Map

### 신규 파일
| 파일 | 역할 |
|------|------|
| `scripts/lib/parsers/detail/types.ts` | IDetailParser 인터페이스 |
| `scripts/lib/parsers/detail/base-detail-parser.ts` | 기본 폴백 체인 (기존 로직 이전) |
| `scripts/lib/parsers/detail/blankroom-parser.ts` | .product-description |
| `scripts/lib/parsers/detail/visualaid-parser.ts` | .tab_wrap |
| `scripts/lib/parsers/detail/adekuver-parser.ts` | .item.open .content |
| `scripts/lib/parsers/detail/index.ts` | getDetailParser() 팩토리 |
| `scripts/lib/parsers/review/types.ts` | IReviewParser 인터페이스 |
| `scripts/lib/parsers/review/board-review-parser.ts` | 보드 기반 리뷰 파서 |
| `scripts/lib/parsers/review/inline-review-parser.ts` | 인라인 리뷰 파서 |
| `scripts/lib/parsers/review/composite-review-parser.ts` | 보드→인라인 폴백 체인 |
| `scripts/lib/parsers/review/index.ts` | getReviewParser() 팩토리 |
| `scripts/lib/body-info-extractor.ts` | 체형 정보 regex 공통 유틸 |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `scripts/lib/types.ts` | Product.averageRating 제거 (linter가 삭제), SiteConfig.timeouts 추가 |
| `scripts/lib/cafe24-engine.ts` | Step 3/4에서 주입된 파서 사용, 상세 크롤 병렬화, 리소스 차단 |
| `scripts/crawl.ts` | 파서 팩토리 import, 엔진에 파서 전달 |
| `scripts/configs/platforms.ts` | blankroom/visualaid detailSelectors 제거 (파서 클래스로 이동) |

### 삭제 파일
| 파일 | 이유 |
|------|------|
| `scripts/lib/detail-parser.ts` | `parsers/detail/` 로 분리 |
| `scripts/lib/review-parser.ts` | `parsers/review/` 로 분리 |

---

### Task 1: body-info-extractor 공통 유틸 추출

**Files:**
- Create: `scripts/lib/body-info-extractor.ts`

- [ ] **Step 1: 체형 정보 추출 유틸 작성**

```typescript
// scripts/lib/body-info-extractor.ts
export interface BodyInfo {
  height: string | null
  weight: string | null
  usualSize: string | null
  purchasedSize: string | null
  bodyType: string | null
}

/**
 * 텍스트에서 체형 정보를 추출한다.
 * 리뷰 본문(content) 범위 텍스트를 전달할 것 — 페이지 전체 body를 넣으면 오매칭됨.
 */
export function extractBodyInfo(text: string): BodyInfo | null {
  const height = text.match(/(?:키|신장|Height)\s*[:：]?\s*(\d{2,3}\s*(?:cm|CM)?)/i)
  const weight = text.match(/(?:몸무게|체중|Weight)\s*[:：]?\s*(\d{2,3}\s*(?:kg|KG)?)/i)
  const usualSize = text.match(/(?:평소\s*사이즈|보통\s*사이즈|Usual\s*Size)\s*[:：]?\s*([^\n,]{1,10})/i)
  const purchasedSize = text.match(/(?:구매\s*사이즈|선택\s*사이즈|Purchased\s*Size|주문\s*사이즈)\s*[:：]?\s*([^\n,]{1,10})/i)
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

/** page.evaluate() 내부에서 사용할 수 있는 순수 문자열 버전 (직렬화 가능) */
export const BODY_INFO_PATTERNS = {
  height: String.raw`(?:키|신장|Height)\s*[:：]?\s*(\d{2,3}\s*(?:cm|CM)?)`,
  weight: String.raw`(?:몸무게|체중|Weight)\s*[:：]?\s*(\d{2,3}\s*(?:kg|KG)?)`,
  usualSize: String.raw`(?:평소\s*사이즈|보통\s*사이즈|Usual\s*Size)\s*[:：]?\s*([^\n,]{1,10})`,
  purchasedSize: String.raw`(?:구매\s*사이즈|선택\s*사이즈|Purchased\s*Size|주문\s*사이즈)\s*[:：]?\s*([^\n,]{1,10})`,
  bodyType: String.raw`(?:체형|Body\s*Type)\s*[:：]?\s*([^\n,]{1,20})`,
}

/**
 * page.evaluate() 내부에서 체형 정보를 추출하는 함수 문자열.
 * evaluate에 patterns를 전달하고 이 함수를 호출한다.
 */
export function extractBodyInfoInBrowser(
  text: string,
  patterns: typeof BODY_INFO_PATTERNS
): BodyInfo | null {
  const height = text.match(new RegExp(patterns.height, "i"))
  const weight = text.match(new RegExp(patterns.weight, "i"))
  const usualSize = text.match(new RegExp(patterns.usualSize, "i"))
  const purchasedSize = text.match(new RegExp(patterns.purchasedSize, "i"))
  const bodyType = text.match(new RegExp(patterns.bodyType, "i"))

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

- [ ] **Step 2: TS 컴파일 확인**

Run: `npx tsx --eval "import './scripts/lib/body-info-extractor'"`
Expected: 정상 종료 (출력 없음)

- [ ] **Step 3: 커밋**

```bash
git add scripts/lib/body-info-extractor.ts
git commit -m "refactor: extract body-info-extractor utility from review parser"
```

---

### Task 2: Detail Parser 인터페이스 + Base 구현

**Files:**
- Create: `scripts/lib/parsers/detail/types.ts`
- Create: `scripts/lib/parsers/detail/base-detail-parser.ts`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p scripts/lib/parsers/detail scripts/lib/parsers/review
```

- [ ] **Step 2: IDetailParser 인터페이스 정의**

```typescript
// scripts/lib/parsers/detail/types.ts
import type { Page } from "playwright"

export interface DetailData {
  description: string | null
  color: string | null
  material: string | null
  productCode: string | null
}

export interface IDetailParser {
  parse(page: Page, productUrl: string): Promise<DetailData>
}
```

- [ ] **Step 3: BaseDetailParser 작성 — 기존 detail-parser.ts 로직 이전**

```typescript
// scripts/lib/parsers/detail/base-detail-parser.ts
import type { Page } from "playwright"
import type { DetailData, IDetailParser } from "./types"

const MATERIAL_PATTERN_SRC = String.raw`(?:소재|원단|Material|Fabric|Composition)\s*[:：]?\s*([^\n<]{3,80})`

const MATERIAL_KEYWORD_LIST = [
  "소재", "원단", "Material", "Fabric", "Composition",
  "cotton", "polyester", "wool", "nylon", "linen",
  "면", "폴리에스터", "울", "나일론", "린넨", "실크", "캐시미어", "레이온", "비스코스",
]

export class BaseDetailParser implements IDetailParser {
  protected descriptionSelectors = [
    ".cont_detail",
    "#prdDetail",
    ".product-detail",
    ".xans-product-detaildesign",
    ".detail_cont",
    "#productDetail",
    ".item.open .content",
    ".prd_detail_box",
  ]

  protected colorSelectors = [
    'select[name*="option1"] option',
    'select[id*="option1"] option',
    ".opt_list li",
    ".product-option li",
  ]

  protected codeSelectors = [
    ".product_code",
    ".prd_code",
  ]

  async parse(page: Page, productUrl: string): Promise<DetailData> {
    const result: DetailData = {
      description: null,
      color: null,
      material: null,
      productCode: null,
    }

    try {
      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
      await page.waitForTimeout(800)

      const extracted = await page.evaluate((args) => {
        let description: string | null = null
        for (const sel of args.descSels) {
          try {
            const el = document.querySelector(sel)
            if (!el) continue
            const text = (el as HTMLElement).innerText?.trim()
            if (text && text.length > 10) { description = text.slice(0, 2000); break }
          } catch { /* next */ }
        }

        let color: string | null = null
        for (const sel of args.colorSels) {
          try {
            const options = document.querySelectorAll(sel)
            if (options.length === 0) continue
            const colors: string[] = []
            options.forEach((opt) => {
              const t = (opt as HTMLElement).innerText?.trim() || ""
              if (t && !t.includes("선택") && !t.includes("Select") && t !== "*") colors.push(t)
            })
            if (colors.length > 0) { color = colors.slice(0, 20).join(", ").slice(0, 500); break }
          } catch { /* next */ }
        }

        let productCode: string | null = null
        for (const sel of args.codeSels) {
          try {
            const el = document.querySelector(sel)
            if (!el) continue
            const text = (el as HTMLElement).innerText?.trim()
            if (text) {
              const m = text.match(/[:：]\s*(.+)/)
              productCode = m ? m[1].trim() : text
              break
            }
          } catch { /* next */ }
        }

        let material: string | null = null
        if (description) {
          const matMatch = description.match(new RegExp(args.matPattern, "i"))
          if (matMatch?.[1]) {
            material = matMatch[1].trim()
          } else {
            const lines = description.split("\n")
            for (const line of lines) {
              const lower = line.toLowerCase()
              if (args.matKeywords.some((kw: string) => lower.includes(kw.toLowerCase()))) {
                const cleaned = line.replace(/^\s*[-·•]\s*/, "").trim()
                if (cleaned.length > 3 && cleaned.length < 200) { material = cleaned; break }
              }
            }
          }
        }

        return { description, color, material, productCode }
      }, {
        descSels: this.descriptionSelectors,
        colorSels: this.colorSelectors,
        codeSels: this.codeSelectors,
        matPattern: MATERIAL_PATTERN_SRC,
        matKeywords: MATERIAL_KEYWORD_LIST,
      })

      result.description = extracted.description
      result.color = extracted.color
      result.material = extracted.material
      result.productCode = extracted.productCode
    } catch (err) {
      console.warn(`   ⚠️ 상세 파싱 실패: ${productUrl} — ${(err as Error).message}`)
    }

    return result
  }
}
```

- [ ] **Step 4: TS 컴파일 확인**

Run: `npx tsx --eval "import './scripts/lib/parsers/detail/base-detail-parser'"`
Expected: 정상 종료

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/parsers/detail/
git commit -m "refactor: extract BaseDetailParser with IDetailParser interface"
```

---

### Task 3: 플랫폼별 Detail Parser 구현 + Factory

**Files:**
- Create: `scripts/lib/parsers/detail/blankroom-parser.ts`
- Create: `scripts/lib/parsers/detail/visualaid-parser.ts`
- Create: `scripts/lib/parsers/detail/adekuver-parser.ts`
- Create: `scripts/lib/parsers/detail/index.ts`

- [ ] **Step 1: BlankroomDetailParser**

```typescript
// scripts/lib/parsers/detail/blankroom-parser.ts
import { BaseDetailParser } from "./base-detail-parser"

export class BlankroomDetailParser extends BaseDetailParser {
  protected descriptionSelectors = [".product-description"]
}
```

- [ ] **Step 2: VisualalidDetailParser**

```typescript
// scripts/lib/parsers/detail/visualaid-parser.ts
import { BaseDetailParser } from "./base-detail-parser"

export class VisualalidDetailParser extends BaseDetailParser {
  protected descriptionSelectors = [".tab_wrap"]
}
```

- [ ] **Step 3: AdekuverDetailParser**

```typescript
// scripts/lib/parsers/detail/adekuver-parser.ts
import { BaseDetailParser } from "./base-detail-parser"

export class AdekuverDetailParser extends BaseDetailParser {
  protected descriptionSelectors = [".item.open .content"]
}
```

- [ ] **Step 4: Factory 등록**

```typescript
// scripts/lib/parsers/detail/index.ts
import type { IDetailParser } from "./types"
import { BaseDetailParser } from "./base-detail-parser"
import { BlankroomDetailParser } from "./blankroom-parser"
import { VisualalidDetailParser } from "./visualaid-parser"
import { AdekuverDetailParser } from "./adekuver-parser"

export type { IDetailParser, DetailData } from "./types"
export { BaseDetailParser } from "./base-detail-parser"

const DETAIL_PARSERS: Record<string, () => IDetailParser> = {
  blankroom: () => new BlankroomDetailParser(),
  visualaid: () => new VisualalidDetailParser(),
  adekuver: () => new AdekuverDetailParser(),
}

export function getDetailParser(platformKey: string): IDetailParser {
  const factory = DETAIL_PARSERS[platformKey]
  return factory ? factory() : new BaseDetailParser()
}
```

- [ ] **Step 5: TS 컴파일 확인**

Run: `npx tsx --eval "import { getDetailParser } from './scripts/lib/parsers/detail'; console.log(getDetailParser('blankroom').constructor.name, getDetailParser('unknown').constructor.name)"`
Expected: `BlankroomDetailParser BaseDetailParser`

- [ ] **Step 6: 커밋**

```bash
git add scripts/lib/parsers/detail/
git commit -m "feat: add platform-specific detail parsers with factory"
```

---

### Task 4: Review Parser 인터페이스 + Board/Inline/Composite 구현

**Files:**
- Create: `scripts/lib/parsers/review/types.ts`
- Create: `scripts/lib/parsers/review/board-review-parser.ts`
- Create: `scripts/lib/parsers/review/inline-review-parser.ts`
- Create: `scripts/lib/parsers/review/composite-review-parser.ts`
- Create: `scripts/lib/parsers/review/index.ts`

- [ ] **Step 1: IReviewParser 인터페이스 정의**

```typescript
// scripts/lib/parsers/review/types.ts
import type { Page } from "playwright"

export interface ReviewerBody {
  height: string | null
  weight: string | null
  usualSize: string | null
  purchasedSize: string | null
  bodyType: string | null
}

export interface Review {
  text: string
  author: string | null
  date: string | null
  photoUrls: string[]
  body: ReviewerBody | null
}

export interface ReviewData {
  reviewCount: number
  reviews: Review[]
}

export interface IReviewParser {
  parse(page: Page, maxReviews: number): Promise<ReviewData>
}
```

- [ ] **Step 2: BoardReviewParser — 기존 보드 전략 분리**

기존 review-parser.ts의 보드 로직(line 52~153 + parseBoardReviewsWithDetail)을 이전.
체형 regex는 `BODY_INFO_PATTERNS`를 `page.evaluate`에 전달하여 사용.

```typescript
// scripts/lib/parsers/review/board-review-parser.ts
import type { Page } from "playwright"
import type { IReviewParser, Review, ReviewData, ReviewerBody } from "./types"
import { BODY_INFO_PATTERNS } from "../../body-info-extractor"

export class BoardReviewParser implements IReviewParser {
  async parse(page: Page, maxReviews: number): Promise<ReviewData> {
    const result: ReviewData = { reviewCount: 0, reviews: [] }

    try {
      const boardInfo = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"))
        let boardUrl: string | null = null
        let count = 0

        for (const link of links) {
          const href = link.getAttribute("href") || ""
          const text = (link.textContent || "").trim()
          if (href.includes("/board/product/list.html") && href.includes("link_product_no")) {
            boardUrl = href
            const numMatch = text.match(/(\d+)/)
            if (numMatch) count = parseInt(numMatch[1], 10)
            break
          }
        }

        if (!count) {
          for (const link of links) {
            const text = (link.textContent || "").trim()
            const match = text.match(/(?:리뷰|후기|review)\s*(\d+)/i)
            if (match) {
              count = parseInt(match[1], 10)
              if (!boardUrl) {
                const href = link.getAttribute("href") || ""
                if (href.includes("board")) boardUrl = href
              }
              break
            }
          }
        }

        // WRITE 링크 폴백
        if (!boardUrl) {
          for (const link of links) {
            const href = link.getAttribute("href") || ""
            const m = href.match(/\/board\/product\/write\.html\?board_no=(\d+)&product_no=(\d+)/)
            if (m) {
              boardUrl = "/board/product/list.html?board_no=" + m[1] + "&link_product_no=" + m[2]
              break
            }
          }
        }

        return { boardUrl, count }
      })

      result.reviewCount = boardInfo.count
      if (!boardInfo.boardUrl) return result

      const boardUrl = boardInfo.boardUrl.startsWith("http")
        ? boardInfo.boardUrl
        : new URL(boardInfo.boardUrl, page.url()).href

      if (!boardUrl.startsWith("https://") && !boardUrl.startsWith("http://")) return result

      await page.goto(boardUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
      await page.waitForTimeout(2000)

      result.reviews = await this.parseBoardPage(page, boardUrl, maxReviews)
      if (result.reviewCount === 0 && result.reviews.length > 0) {
        result.reviewCount = result.reviews.length
      }
    } catch (err) {
      console.warn(`   ⚠️ 보드 리뷰 파싱 실패: ${(err as Error).message}`)
    }

    return result
  }

  private async parseBoardPage(page: Page, boardUrl: string, max: number): Promise<Review[]> {
    const rawReviews = await page.evaluate((maxReviews) => {
      const rows = document.querySelectorAll("table tr")
      const results: Array<{
        author: string | null; date: string | null;
        text: string; photoUrls: string[]; detailUrl: string | null;
      }> = []

      for (let i = 0; i < rows.length && results.length < maxReviews; i++) {
        const tds = rows[i].querySelectorAll("td")
        if (tds.length < 3) continue

        let author: string | null = null
        let date: string | null = null

        for (let j = 0; j < tds.length; j++) {
          const td = tds[j]
          const cls = td.className || ""
          if (cls.includes("writer")) {
            const nameEl = td.querySelector(".name")
            if (nameEl) author = (nameEl.textContent || "").trim()
            const dateMatch = (td.textContent || "").match(/\d{4}-\d{2}-\d{2}/)
            if (dateMatch) date = dateMatch[0]
          }
        }

        let text = ""
        let detailUrl: string | null = null
        const commentEl = rows[i].querySelector(".comment")
        if (commentEl) {
          const link = commentEl.querySelector("a[href*='/article/']")
          if (link) {
            text = (link.textContent || "").trim()
            detailUrl = link.getAttribute("href")
          } else {
            text = (commentEl.textContent || "").trim().replace(/\s+/g, " ")
          }
        }
        if (!text && tds.length >= 3) {
          text = (tds[2].textContent || "").trim().replace(/\s+/g, " ")
        }

        const photoUrls: string[] = []
        rows[i].querySelectorAll('img[src*="review"], img[src*="board"]').forEach((img) => {
          const src = img.getAttribute("src") || ""
          if (src.startsWith("http")) photoUrls.push(src)
        })

        if (author || text.length > 5) {
          results.push({ author, date, text: text.slice(0, 1000), photoUrls: [...new Set(photoUrls)].slice(0, 5), detailUrl })
        }
      }
      return results
    }, max)

    const baseUrl = new URL(boardUrl).origin
    const reviews: Review[] = []
    const patterns = BODY_INFO_PATTERNS

    for (const raw of rawReviews) {
      let body: ReviewerBody | null = null
      let fullText = raw.text

      if (raw.detailUrl) {
        try {
          const detailUrl = raw.detailUrl.startsWith("http") ? raw.detailUrl : baseUrl + raw.detailUrl
          if (!detailUrl.startsWith("https://") && !detailUrl.startsWith("http://")) continue
          await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
          await page.waitForTimeout(1500)

          const detail = await page.evaluate((pats) => {
            const text = (document.body.textContent || "")
            const contentEl = document.querySelector(".board_content, .view-content, .article-content, .entry-content, #bo_content")
            const content = contentEl ? (contentEl.textContent || "").trim() : ""

            const h = text.match(new RegExp(pats.height, "i"))
            const w = text.match(new RegExp(pats.weight, "i"))
            const us = text.match(new RegExp(pats.usualSize, "i"))
            const ps = text.match(new RegExp(pats.purchasedSize, "i"))
            const bt = text.match(new RegExp(pats.bodyType, "i"))
            const hasBody = h || w || us || ps || bt

            return {
              body: hasBody ? {
                height: h?.[1]?.trim() || null,
                weight: w?.[1]?.trim() || null,
                usualSize: us?.[1]?.trim() || null,
                purchasedSize: ps?.[1]?.trim() || null,
                bodyType: bt?.[1]?.trim() || null,
              } : null,
              content: content.slice(0, 1000),
            }
          }, patterns)

          if (detail.body) body = detail.body as ReviewerBody
          if (detail.content && detail.content.length > raw.text.length) fullText = detail.content
        } catch { /* skip */ }
      }

      reviews.push({ text: fullText, author: raw.author, date: raw.date, photoUrls: raw.photoUrls, body })
    }

    return reviews
  }
}
```

- [ ] **Step 3: InlineReviewParser — 인라인 리뷰 전략**

```typescript
// scripts/lib/parsers/review/inline-review-parser.ts
import type { Page } from "playwright"
import type { IReviewParser, Review, ReviewData, ReviewerBody } from "./types"
import { BODY_INFO_PATTERNS } from "../../body-info-extractor"

export class InlineReviewParser implements IReviewParser {
  async parse(page: Page, maxReviews: number): Promise<ReviewData> {
    const result: ReviewData = { reviewCount: 0, reviews: [] }

    try {
      const inlineUrls = await page.evaluate((max) => {
        const links = Array.from(document.querySelectorAll('a[href*="/article/review/"]'))
        const urls: string[] = []
        const seen = new Set<string>()
        for (const link of links) {
          const href = link.getAttribute("href") || ""
          if (seen.has(href)) continue
          seen.add(href)
          urls.push(href)
          if (urls.length >= max) break
        }
        return urls
      }, maxReviews)

      if (inlineUrls.length === 0) return result

      const baseUrl = new URL(page.url()).origin
      const patterns = BODY_INFO_PATTERNS

      for (const rawUrl of inlineUrls) {
        try {
          const fullUrl = rawUrl.startsWith("http") ? rawUrl : baseUrl + rawUrl
          if (!fullUrl.startsWith("https://") && !fullUrl.startsWith("http://")) continue

          await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
          await page.waitForTimeout(1500)

          const data = await page.evaluate((pats) => {
            const contentEl = document.querySelector(".fr-view, .board_content, .view-content, .article-content, .entry-content")
            const content = contentEl ? (contentEl as HTMLElement).innerText?.trim() || "" : ""

            const h = content.match(new RegExp(pats.height, "i"))
            const w = content.match(new RegExp(pats.weight, "i"))
            const us = content.match(new RegExp(pats.usualSize, "i"))
            const ps = content.match(new RegExp(pats.purchasedSize, "i"))
            const bt = content.match(new RegExp(pats.bodyType, "i"))

            const authorEl = document.querySelector(".board_view_info .name, .article-writer .name, .writer .name")
            const author = authorEl ? (authorEl.textContent || "").trim() : null
            const metaEl = document.querySelector(".board_view_info, .article-info, .view-info")
            const metaText = metaEl ? (metaEl.textContent || "") : content
            const dateMatch = metaText.match(/\d{4}-\d{2}-\d{2}/)

            const photoUrls: string[] = []
            contentEl?.querySelectorAll("img").forEach((img) => {
              const src = img.getAttribute("src") || ""
              if (src.startsWith("http")) photoUrls.push(src)
            })

            const hasBody = h || w || us || ps || bt
            return {
              text: content.slice(0, 1000),
              author,
              date: dateMatch ? dateMatch[0] : null,
              photoUrls: [...new Set(photoUrls)].slice(0, 5),
              body: hasBody ? {
                height: h?.[1]?.trim() || null, weight: w?.[1]?.trim() || null,
                usualSize: us?.[1]?.trim() || null, purchasedSize: ps?.[1]?.trim() || null,
                bodyType: bt?.[1]?.trim() || null,
              } : null,
            }
          }, patterns)

          if (data.text.length > 3 || data.author) {
            result.reviews.push({
              text: data.text, author: data.author, date: data.date,
              photoUrls: data.photoUrls, body: data.body as ReviewerBody | null,
            })
          }
        } catch { /* skip */ }
      }

      result.reviewCount = result.reviews.length
    } catch (err) {
      console.warn(`   ⚠️ 인라인 리뷰 파싱 실패: ${(err as Error).message}`)
    }

    return result
  }
}
```

- [ ] **Step 4: CompositeReviewParser — 보드→인라인 폴백 체인**

```typescript
// scripts/lib/parsers/review/composite-review-parser.ts
import type { Page } from "playwright"
import type { IReviewParser, ReviewData } from "./types"
import { BoardReviewParser } from "./board-review-parser"
import { InlineReviewParser } from "./inline-review-parser"

/**
 * 복합 리뷰 파서: 보드 → 인라인 순서로 시도.
 * 대부분의 Cafe24 사이트에서 기본으로 사용.
 */
export class CompositeReviewParser implements IReviewParser {
  private strategies: IReviewParser[]

  constructor(strategies?: IReviewParser[]) {
    this.strategies = strategies || [
      new BoardReviewParser(),
      new InlineReviewParser(),
    ]
  }

  async parse(page: Page, maxReviews: number): Promise<ReviewData> {
    const currentUrl = page.url()

    for (const strategy of this.strategies) {
      // 각 전략 시도 전 원래 페이지로 복원
      if (page.url() !== currentUrl) {
        await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
        await page.waitForTimeout(1000)
      }

      const result = await strategy.parse(page, maxReviews)
      if (result.reviews.length > 0) return result
    }

    return { reviewCount: 0, reviews: [] }
  }
}
```

- [ ] **Step 5: Review Factory**

```typescript
// scripts/lib/parsers/review/index.ts
import type { IReviewParser, ReviewData } from "./types"
import { CompositeReviewParser } from "./composite-review-parser"

export type { IReviewParser, ReviewData, Review, ReviewerBody } from "./types"
export { BoardReviewParser } from "./board-review-parser"
export { InlineReviewParser } from "./inline-review-parser"
export { CompositeReviewParser } from "./composite-review-parser"

const REVIEW_PARSERS: Record<string, () => IReviewParser> = {
  // 플랫폼별 커스텀 파서 등록 시 여기에 추가
  // blankroom: () => new InlineReviewParser(), // 인라인 전용
}

export function getReviewParser(platformKey: string): IReviewParser {
  const factory = REVIEW_PARSERS[platformKey]
  return factory ? factory() : new CompositeReviewParser()
}
```

- [ ] **Step 6: TS 컴파일 확인**

Run: `npx tsx --eval "import { getReviewParser } from './scripts/lib/parsers/review'; console.log(getReviewParser('test').constructor.name)"`
Expected: `CompositeReviewParser`

- [ ] **Step 7: 커밋**

```bash
git add scripts/lib/parsers/review/
git commit -m "refactor: split review parser into Board/Inline/Composite strategies"
```

---

### Task 5: cafe24-engine 리팩토링 — 파서 주입 + 속도 개선

**Files:**
- Modify: `scripts/lib/cafe24-engine.ts:12-16` (import 변경)
- Modify: `scripts/lib/cafe24-engine.ts:398` (crawlCafe24 시그니처)
- Modify: `scripts/lib/cafe24-engine.ts:488-563` (Step 3/4 파서 주입 + 병렬화)

- [ ] **Step 1: import 변경**

기존:
```typescript
import {parseDetailPage} from "./detail-parser"
import {parseReviews} from "./review-parser"
```

변경:
```typescript
import type { IDetailParser } from "./parsers/detail"
import type { IReviewParser } from "./parsers/review"
```

- [ ] **Step 2: crawlCafe24 시그니처 변경**

기존:
```typescript
export async function crawlCafe24(
  page: Page,
  config: SiteConfig
): Promise<CrawlResult> {
```

변경:
```typescript
export async function crawlCafe24(
  page: Page,
  config: SiteConfig,
  detailParser?: IDetailParser,
  reviewParser?: IReviewParser,
): Promise<CrawlResult> {
```

- [ ] **Step 3: Step 3 (상세 크롤링) — 파서 주입 + 3-way 병렬화 + 리소스 차단**

기존 `cafe24-engine.ts` line 490~522를 다음으로 교체:

```typescript
  // ── Step 3: 상세 페이지 크롤링 ──
  if (config.crawlDetails && detailParser) {
    console.log(`\n${tag} 🔍 상세 크롤링 시작 — ${uniqueProducts.length}개 상품`)
    let detailSuccess = 0
    const DETAIL_CONCURRENCY = 3
    const browser = page.context().browser()!

    for (let i = 0; i < uniqueProducts.length; i += DETAIL_CONCURRENCY) {
      const batch = uniqueProducts.slice(i, i + DETAIL_CONCURRENCY)
      const results = await Promise.all(
        batch.map(async (product) => {
          const ctx = await browser.newContext()
          // 리소스 차단 — 이미지/CSS/폰트 로드 생략
          await ctx.route("**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2}", (route) => route.abort())
          const pg = await ctx.newPage()
          try {
            return { product, detail: await detailParser.parse(pg, product.productUrl) }
          } catch {
            return { product, detail: null }
          } finally {
            await ctx.close()
          }
        })
      )

      for (const { product, detail } of results) {
        if (!detail) continue
        if (detail.description) product.description = detail.description
        if (detail.color) product.color = detail.color
        if (detail.material) product.material = detail.material
        if (detail.productCode) product.productCode = detail.productCode
        if (detail.description || detail.color || detail.material) detailSuccess++
      }

      const done = Math.min(i + DETAIL_CONCURRENCY, uniqueProducts.length)
      process.stdout.write(`\r${tag}    📖 ${done}/${uniqueProducts.length} (성공: ${detailSuccess})`)
    }

    console.log(`\n${tag} ✅ 상세 크롤링 완료 — ${detailSuccess}/${uniqueProducts.length}개 데이터 수집`)
  }
```

- [ ] **Step 4: Step 4 (리뷰 크롤링) — 파서 주입**

기존 `cafe24-engine.ts` line 524~563을 다음으로 교체:

```typescript
  // ── Step 4: 리뷰 크롤링 ──
  if (config.crawlReviews && reviewParser) {
    console.log(`\n${tag} 💬 리뷰 크롤링 시작 — ${uniqueProducts.length}개 상품`)
    let reviewCount = 0
    let withReviews = 0
    const reviewDelay = config.crawlDelay || 800

    for (const product of uniqueProducts) {
      try {
        await page.goto(product.productUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
        await page.waitForTimeout(500)

        const reviewData = await reviewParser.parse(page, 10)

        reviewCount++
        if (reviewData.reviewCount > 0 || reviewData.reviews.length > 0) {
          product.reviewCount = reviewData.reviewCount || reviewData.reviews.length
          product.reviews = reviewData.reviews
          withReviews++
          console.log(
            `${tag}    💬 [${reviewCount}/${uniqueProducts.length}] ${(product.name || "").slice(0, 35)}` +
            ` → 리뷰 ${product.reviewCount}건 (추출: ${reviewData.reviews.length}건)`
          )
        }
      } catch {
        reviewCount++
      }

      await new Promise((r) => setTimeout(r, reviewDelay))
    }

    console.log(`${tag} ✅ 리뷰 크롤링 완료 — ${withReviews}/${uniqueProducts.length}개 상품에 리뷰`)
  }
```

- [ ] **Step 5: TS 컴파일 확인**

Run: `npx tsx --eval "import { crawlCafe24 } from './scripts/lib/cafe24-engine'"`
Expected: 정상 종료

- [ ] **Step 6: 커밋**

```bash
git add scripts/lib/cafe24-engine.ts
git commit -m "refactor: inject detail/review parsers into cafe24-engine + parallel detail crawl"
```

---

### Task 6: crawl.ts 연동 + platforms.ts 정리

**Files:**
- Modify: `scripts/crawl.ts:21-23` (import 변경)
- Modify: `scripts/crawl.ts:200` (파서 전달)
- Modify: `scripts/configs/platforms.ts` (blankroom/visualaid detailSelectors 제거)

- [ ] **Step 1: crawl.ts import 추가**

```typescript
// 기존 import 뒤에 추가
import { getDetailParser } from "./lib/parsers/detail"
import { getReviewParser } from "./lib/parsers/review"
```

- [ ] **Step 2: crawlCafe24 호출에 파서 전달**

기존 (line ~200):
```typescript
const result = await crawlCafe24(page, config)
```

변경:
```typescript
const detailParser = config.crawlDetails ? getDetailParser(config.key) : undefined
const reviewParser = config.crawlReviews ? getReviewParser(config.key) : undefined
const result = await crawlCafe24(page, config, detailParser, reviewParser)
```

- [ ] **Step 3: platforms.ts에서 blankroom/visualaid detailSelectors 제거**

blankroom의 `detailSelectors: { description: ".product-description" }` 제거.
visualaid의 `detailSelectors: { description: ".tab_wrap" }` 제거.

→ 파서 클래스가 셀렉터를 관리하므로 config에서 중복 제거.

- [ ] **Step 4: TS 컴파일 확인**

Run: `npx tsx scripts/crawl.ts --list 2>&1 | head -5`
Expected: 플랫폼 목록 출력

- [ ] **Step 5: 커밋**

```bash
git add scripts/crawl.ts scripts/configs/platforms.ts
git commit -m "refactor: wire parser factories into crawl.ts, remove config selectors"
```

---

### Task 7: 레거시 파서 파일 삭제 + types.ts 정리

**Files:**
- Delete: `scripts/lib/detail-parser.ts`
- Delete: `scripts/lib/review-parser.ts`
- Modify: `scripts/lib/types.ts` (SiteConfig.timeouts 추가)

- [ ] **Step 1: 레거시 파서 삭제**

```bash
rm scripts/lib/detail-parser.ts scripts/lib/review-parser.ts
```

- [ ] **Step 2: types.ts에 timeouts 필드 추가**

SiteConfig에 추가:
```typescript
  /** 플랫폼별 타임아웃 설정 */
  timeouts?: {
    pageLoad?: number    // 기본 15000
    renderDelay?: number // 기본 800
    reviewDelay?: number // 기본 1500
  }
```

- [ ] **Step 3: probe-reviews.ts가 review-parser를 import하는지 확인, 있으면 수정**

`scripts/probe-reviews.ts`에서 `import {parseReviews} from "./lib/review-parser"` → `import { CompositeReviewParser } from "./lib/parsers/review"` 변경 후 호출 방식 맞춤.

- [ ] **Step 4: 전체 빌드 확인**

Run: `npx tsx --eval "import './scripts/crawl'"`
Expected: usage 메시지 출력 후 정상 종료

- [ ] **Step 5: 커밋**

```bash
git add -A scripts/lib/detail-parser.ts scripts/lib/review-parser.ts scripts/lib/types.ts scripts/probe-reviews.ts
git commit -m "refactor: delete legacy parsers, add SiteConfig.timeouts"
```

---

### Task 8: 회귀 테스트 — roughside + blankroom + visualaid

**Files:** 없음 (실행 테스트만)

- [ ] **Step 1: roughside 상세+리뷰 3개 테스트**

```bash
npx tsx -e "
import { chromium } from 'playwright';
import { getDetailParser } from './scripts/lib/parsers/detail';
import { getReviewParser } from './scripts/lib/parsers/review';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const dp = getDetailParser('roughside');
  const rp = getReviewParser('roughside');
  const url = 'https://roughside.com/product/detail.html?product_no=3068&cate_no=26&display_group=1';
  const detail = await dp.parse(page, url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  const review = await rp.parse(page, 3);
  console.log('roughside → desc:', !!detail.description, '| reviews:', review.reviews.length);
  await browser.close();
})();
"
```

Expected: `roughside → desc: true | reviews: N` (N > 0)

- [ ] **Step 2: blankroom 상세+리뷰 테스트**

```bash
npx tsx -e "
import { chromium } from 'playwright';
import { getDetailParser } from './scripts/lib/parsers/detail';
import { getReviewParser } from './scripts/lib/parsers/review';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const dp = getDetailParser('blankroom');
  const rp = getReviewParser('blankroom');
  const url = 'https://blankroom.house/product/detail.html?product_no=853&cate_no=87&display_group=1';
  const detail = await dp.parse(page, url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  const review = await rp.parse(page, 3);
  console.log('blankroom → desc:', !!detail.description, '| reviews:', review.reviews.length);
  for (const r of review.reviews) console.log('  body:', JSON.stringify(r.body));
  await browser.close();
})();
"
```

Expected: `blankroom → desc: true | reviews: N` (N >= 5), body에 height/weight 정상

- [ ] **Step 3: visualaid 상세 테스트**

```bash
npx tsx -e "
import { chromium } from 'playwright';
import { getDetailParser } from './scripts/lib/parsers/detail';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const dp = getDetailParser('visualaid');
  const detail = await dp.parse(page, 'https://visualaid.kr/product/ma-journee-m-basic-knit-cardigan-green/9317/category/25/display/1/');
  console.log('visualaid → desc:', detail.description?.slice(0, 60), '| material:', detail.material);
  await browser.close();
})();
"
```

Expected: description에 `Soft Touch Yarn`, material에 `Rayon 52%` 포함

- [ ] **Step 4: 미등록 플랫폼 (BaseParser 폴백) 테스트**

```bash
npx tsx -e "
import { getDetailParser } from './scripts/lib/parsers/detail';
import { getReviewParser } from './scripts/lib/parsers/review';
console.log('unknown detail:', getDetailParser('etcseoul').constructor.name);
console.log('unknown review:', getReviewParser('etcseoul').constructor.name);
"
```

Expected: `BaseDetailParser` / `CompositeReviewParser`

- [ ] **Step 5: 전체 회귀 통과 확인 후 커밋**

```bash
git add -A
git commit -m "test: regression tests pass for roughside, blankroom, visualaid"
```

---

## 최종 구조

```
scripts/lib/
  types.ts                           — 공유 인터페이스 (SiteConfig.timeouts 추가)
  body-info-extractor.ts             — 체형 regex 공통 유틸 (NEW)
  cafe24-engine.ts                   — 리스트 크롤 + 파서 주입 (리팩토링)
  shopify-engine.ts                  — Shopify API 크롤 (변경 없음)
  product-analyzer.ts                — AI 분석 (변경 없음)
  parsers/
    detail/
      types.ts                       — IDetailParser
      base-detail-parser.ts          — 9셀렉터 폴백 체인 (기본)
      blankroom-parser.ts            — .product-description
      visualaid-parser.ts            — .tab_wrap
      adekuver-parser.ts             — .item.open .content
      index.ts                       — getDetailParser() 팩토리
    review/
      types.ts                       — IReviewParser
      board-review-parser.ts         — 보드 기반
      inline-review-parser.ts        — 인라인 기반
      composite-review-parser.ts     — 보드→인라인 폴백
      index.ts                       — getReviewParser() 팩토리
```

**새 플랫폼 추가 시:** 파서 파일 1개 생성 + index.ts 팩토리 1줄 등록. 코어 코드 수정 0줄.
