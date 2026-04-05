# Part 1: 인프라 + 상품 이미지 배치 분석 파이프라인 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AWS EC2에 LiteLLM 게이트웨이를 세우고, 15,000개 상품 이미지를 Bedrock Nova Lite로 분석하여 정규화된 enum 태그를 DB에 저장한다.

**Architecture:** LiteLLM(Docker on EC2 t4g.small)이 Bedrock Nova Lite(배치)와 OpenAI GPT-4o-mini(프론트)를 중계. 배치 스크립트가 로컬에서 LiteLLM을 호출하여 상품 이미지를 분석하고, 결과를 Supabase `product_ai_analysis` 테이블에 저장. 프론트와 배치가 동일한 enum 체계(`src/lib/enums/product-enums.ts`)를 공유.

**Tech Stack:** AWS EC2 (t4g.small ARM), Docker, LiteLLM, Bedrock Nova Lite, Supabase (PostgreSQL), TypeScript, OpenAI SDK (LiteLLM 호환)

**Spec:** `docs/superpowers/specs/2026-04-05-search-engine-part1-infra-batch.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/lib/enums/product-enums.ts` | 공유 enum 정의 + 유효성 검증 함수 |
| Create | `supabase/migrations/012_create_product_ai_analysis.sql` | 상품 AI 분석 테이블 |
| Create | `scripts/analyze-products.ts` | 배치 분석 CLI 메인 |
| Create | `scripts/lib/product-analyzer.ts` | AI 호출 + 응답 파싱 로직 |
| Create | `scripts/configs/analyze-prompt.ts` | 상품 이미지 분석 프롬프트 |
| Create | `infra/docker-compose.yml` | LiteLLM + Caddy 도커 구성 |
| Create | `infra/config/litellm.yaml` | LiteLLM 모델 라우팅 설정 |
| Create | `infra/config/Caddyfile` | HTTPS 리버스 프록시 |
| Create | `infra/scripts/setup.sh` | EC2 초기 세팅 스크립트 |
| Create | `infra/.env.example` | 환경변수 템플릿 |
| Modify | `src/lib/prompts/analyze.ts` | color_family enum 추가, enum import로 변경 |
| Modify | `src/lib/prompts/prompt-search.ts` | enum import로 변경 |
| Modify | `src/app/api/analyze/route.ts` | LiteLLM 엔드포인트로 변경 |
| Modify | `.gitignore` | scripts/output/, infra/.env 추가 |

---

## Task 1: 공유 Enum 모듈 작성

**Files:**
- Create: `src/lib/enums/product-enums.ts`

- [ ] **Step 1: enum 파일 작성**

```typescript
// src/lib/enums/product-enums.ts
/**
 * 프론트 분석 + 배치 분석 + 검색 엔진에서 공유하는 패션 enum 정의.
 * 프롬프트 텍스트도 이 파일에서 자동 생성하여 동기화 보장.
 */

export const CATEGORIES = [
  "Outer", "Top", "Bottom", "Shoes", "Bag", "Dress", "Accessories",
] as const
export type Category = (typeof CATEGORIES)[number]

export const SUBCATEGORIES: Record<Category, readonly string[]> = {
  Outer: ["overcoat", "trench-coat", "parka", "bomber", "blazer", "cardigan", "vest", "anorak", "leather-jacket", "denim-jacket", "fleece", "windbreaker", "cape", "poncho", "shearling", "down-jacket", "field-jacket", "chore-jacket", "overshirt", "hoodie"],
  Top: ["t-shirt", "shirt", "blouse", "polo", "sweater", "knit-top", "tank-top", "crop-top", "henley", "turtleneck", "sweatshirt", "rugby-shirt", "camisole"],
  Bottom: ["jeans", "trousers", "chinos", "shorts", "skirt", "joggers", "cargo-pants", "wide-pants", "leggings", "culottes", "sweatpants"],
  Shoes: ["sneakers", "boots", "loafers", "derby", "oxford", "sandals", "mules", "heels", "flats", "slides", "chelsea-boots", "combat-boots", "running-shoes"],
  Bag: ["tote", "crossbody", "backpack", "clutch", "shoulder-bag", "belt-bag", "messenger", "bucket-bag", "briefcase"],
  Dress: ["mini-dress", "midi-dress", "maxi-dress", "shirt-dress", "wrap-dress", "slip-dress", "knit-dress"],
  Accessories: ["hat", "cap", "scarf", "belt", "sunglasses", "watch", "necklace", "bracelet", "ring", "earrings", "tie", "gloves", "socks"],
} as const

export const FITS = [
  "oversized", "relaxed", "regular", "slim", "skinny", "boxy", "cropped", "longline",
] as const
export type Fit = (typeof FITS)[number]

export const FABRICS = [
  "cotton", "wool", "linen", "silk", "denim", "leather", "suede", "nylon",
  "polyester", "cashmere", "corduroy", "fleece", "tweed", "jersey", "knit",
  "mesh", "satin", "chiffon", "velvet", "canvas", "gore-tex", "ripstop",
] as const
export type Fabric = (typeof FABRICS)[number]

export const COLOR_FAMILIES = [
  "BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN", "GREEN",
  "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM", "KHAKI", "MULTI",
] as const
export type ColorFamily = (typeof COLOR_FAMILIES)[number]

// ─── 유효성 검증 ────────────────────────────────────────

export function isValidCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v)
}

export function isValidSubcategory(category: string, v: string): boolean {
  if (!isValidCategory(category)) return false
  return (SUBCATEGORIES[category] as readonly string[]).includes(v)
}

export function isValidFit(v: string): v is Fit {
  return (FITS as readonly string[]).includes(v)
}

export function isValidFabric(v: string): v is Fabric {
  return (FABRICS as readonly string[]).includes(v)
}

export function isValidColorFamily(v: string): v is ColorFamily {
  return (COLOR_FAMILIES as readonly string[]).includes(v)
}

// ─── 프롬프트 빌더 ──────────────────────────────────────

/** AI 프롬프트에 주입할 enum 레퍼런스 텍스트 */
export function buildEnumReference(): string {
  const subcatLines = (Object.entries(SUBCATEGORIES) as [Category, readonly string[]][])
    .map(([cat, subs]) => `  ${cat}: ${subs.join(", ")}`)
    .join("\n")

  return `category (pick one):
  ${CATEGORIES.join(", ")}

subcategory by category:
${subcatLines}

fit (pick one):
  ${FITS.join(", ")}

fabric (pick one primary):
  ${FABRICS.join(", ")}

color_family (pick one):
  ${COLOR_FAMILIES.join(", ")}`
}
```

- [ ] **Step 2: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/fashion-ai && pnpm build 2>&1 | tail -5`
Expected: 빌드 성공 (이 파일은 아직 import되지 않으므로 에러 없어야 함)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/enums/product-enums.ts
git commit -m "feat: 공유 enum 모듈 (product-enums.ts) — 프론트/배치 공통 사용"
```

---

## Task 2: 기존 프롬프트를 enum 모듈 기반으로 변경

**Files:**
- Modify: `src/lib/prompts/analyze.ts`
- Modify: `src/lib/prompts/prompt-search.ts`

- [ ] **Step 1: analyze.ts — enum import + color_family 추가**

`src/lib/prompts/analyze.ts`의 하드코딩된 enum 텍스트를 `buildEnumReference()`로 교체하고, `color_family` enum을 프롬프트에 추가한다.

변경할 부분 — `ANALYZE_SYSTEM_PROMPT` 내 `=== STANDARDIZED ITEM ENUMS (MUST USE) ===` 블록:

```typescript
// src/lib/prompts/analyze.ts — 상단 import 추가
import {buildEnumReference} from "@/lib/enums/product-enums"

// ANALYZE_SYSTEM_PROMPT 내 enum 블록을 교체:
// 기존:
//   === STANDARDIZED ITEM ENUMS (MUST USE) ===
//   category (pick one): ...
//   subcategory by category: ...
//   fit (pick one): ...
//   fabric (pick one primary): ...
//
// 변경:
//   === STANDARDIZED ITEM ENUMS (MUST USE) ===
//   ${buildEnumReference()}
```

또한 JSON 출력 포맷의 item 예시에 `"colorFamily": "GREY"` 필드를 추가:

```json
{
  "id": "outer",
  "category": "Outer",
  "subcategory": "overcoat",
  "colorFamily": "GREY",
  ...
}
```

그리고 Rules 섹션에 추가:

```
- Per item colorFamily: MUST be one of the color_family enum values (UPPERCASE). Map the specific color to the closest family.
  Examples: "charcoal grey" → "GREY", "navy blue" → "NAVY", "burgundy" → "RED", "olive" → "GREEN", "camel" → "BEIGE", "ivory" → "CREAM"
```

- [ ] **Step 2: prompt-search.ts — 동일하게 enum import 적용**

`src/lib/prompts/prompt-search.ts`의 하드코딩된 enum 텍스트를 `buildEnumReference()`로 교체.

```typescript
// src/lib/prompts/prompt-search.ts — 상단 import 추가
import {buildEnumReference} from "@/lib/enums/product-enums"

// PROMPT_SEARCH_SYSTEM 내 enum 블록을 교체:
// 기존:
//   === STANDARDIZED ITEM ENUMS (MUST USE) ===
//   category (pick one): ...
//   (하드코딩된 전체 enum 텍스트)
//
// 변경:
//   === STANDARDIZED ITEM ENUMS (MUST USE) ===
//   ${buildEnumReference()}
```

JSON 출력 포맷에도 `"colorFamily": null` 추가 (프롬프트 전용이라 색상 없을 수 있음).

- [ ] **Step 3: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/fashion-ai && pnpm build 2>&1 | tail -10`
Expected: 빌드 성공

- [ ] **Step 4: 수동 테스트 — 프롬프트에 color_family가 반영되는지 확인**

개발 서버에서 이미지 분석을 실행하고, 응답에 `colorFamily` 필드가 포함되는지 확인.
(이 테스트는 OpenAI API 호출이 필요하므로 선택적)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/prompts/analyze.ts src/lib/prompts/prompt-search.ts
git commit -m "refactor: 프롬프트 enum을 product-enums.ts 모듈로 통합 + color_family 추가"
```

---

## Task 3: product_ai_analysis DB 마이그레이션

**Files:**
- Create: `supabase/migrations/012_create_product_ai_analysis.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/012_create_product_ai_analysis.sql
-- 상품 이미지 AI 분석 결과 테이블
-- products와 1:N 관계 (버전별 분석 결과 저장)

CREATE TABLE product_ai_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- 버전 관리
  version TEXT NOT NULL DEFAULT 'v1',
  model_id TEXT NOT NULL,
  prompt_hash TEXT,

  -- 정규화된 enum 필드
  category TEXT NOT NULL,
  subcategory TEXT,
  fit TEXT,
  fabric TEXT,
  color_family TEXT,
  color_detail TEXT,

  -- 스타일 분류
  style_node TEXT,
  mood_tags TEXT[],
  keywords_ko TEXT[],
  keywords_en TEXT[],

  -- 메타
  confidence NUMERIC(3,2),
  raw_response JSONB,
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE (product_id, version)
);

-- 검색용 인덱스
CREATE INDEX idx_pai_version ON product_ai_analysis (version);
CREATE INDEX idx_pai_product_version ON product_ai_analysis (product_id, version);
CREATE INDEX idx_pai_category ON product_ai_analysis (version, category);
CREATE INDEX idx_pai_subcategory ON product_ai_analysis (version, subcategory);
CREATE INDEX idx_pai_style_node ON product_ai_analysis (version, style_node);
CREATE INDEX idx_pai_color_family ON product_ai_analysis (version, color_family);
CREATE INDEX idx_pai_fit ON product_ai_analysis (version, fit);
CREATE INDEX idx_pai_fabric ON product_ai_analysis (version, fabric);
CREATE INDEX idx_pai_mood_tags ON product_ai_analysis USING gin (mood_tags);
CREATE INDEX idx_pai_keywords_ko ON product_ai_analysis USING gin (keywords_ko);
CREATE INDEX idx_pai_keywords_en ON product_ai_analysis USING gin (keywords_en);

COMMENT ON TABLE product_ai_analysis IS '상품 이미지 AI 분석 결과. products와 1:N (버전별). 검색 매칭의 핵심 데이터.';
```

- [ ] **Step 2: Supabase에 마이그레이션 실행**

Supabase 대시보드의 SQL Editor에서 위 SQL을 실행한다.
실행 후 테이블 존재 확인:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'product_ai_analysis' ORDER BY ordinal_position;
```

Expected: 18개 컬럼 (id ~ created_at)

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/012_create_product_ai_analysis.sql
git commit -m "feat: product_ai_analysis 마이그레이션 (012)"
```

---

## Task 4: 상품 이미지 분석 프롬프트

**Files:**
- Create: `scripts/configs/analyze-prompt.ts`

- [ ] **Step 1: 프롬프트 파일 작성**

```typescript
// scripts/configs/analyze-prompt.ts
/**
 * 상품 이미지 배치 분석용 프롬프트.
 * 프론트 분석(src/lib/prompts/analyze.ts)과 동일한 enum 체계 사용.
 *
 * 차이점: 프론트는 outfit(착장 전체), 배치는 단일 상품 이미지 분석.
 */

import {buildNodeReference, buildTagList} from "@/lib/fashion-genome"
import {buildEnumReference} from "@/lib/enums/product-enums"

export const PRODUCT_ANALYZE_SYSTEM = `You are a fashion product image analyst. Given a single product image, extract structured attributes for product search matching.

=== STANDARDIZED ENUMS (MUST pick from these exact values) ===

${buildEnumReference()}

=== STYLE NODE TAXONOMY (for style_node classification) ===

${buildNodeReference()}

=== ALLOWED MOOD TAGS ===
Pick 1-3 from: ${buildTagList()}

=== OUTPUT FORMAT (JSON only, no markdown fences) ===
{
  "category": "Outer",
  "subcategory": "overcoat",
  "fit": "oversized",
  "fabric": "wool",
  "color_family": "GREY",
  "color_detail": "charcoal grey",
  "style_node": "C",
  "mood_tags": ["미니멀", "하이엔드"],
  "keywords_ko": ["오버사이즈", "차콜", "울", "코트", "미니멀"],
  "keywords_en": ["oversized", "charcoal", "wool", "coat", "minimal"],
  "confidence": 0.85
}

=== RULES ===
- Analyze the SINGLE PRODUCT shown in the image (if a model is wearing it, focus on the main product)
- category: MUST be one of the enum values (PascalCase)
- subcategory: MUST be from the subcategory list for the chosen category (lowercase, hyphenated)
- fit: MUST be one of the fit enum values (lowercase). Infer from visual cues. Default "regular" if unclear.
- fabric: MUST be one of the fabric enum values (lowercase). Infer from texture/sheen. Use null only if truly indeterminate.
- color_family: MUST be one of the color_family enum values (UPPERCASE). Map specific colors:
  charcoal/slate/ash → GREY, navy/midnight → NAVY, burgundy/wine/maroon → RED,
  olive/forest/sage/army → GREEN, camel/tan/sand → BEIGE, ivory/off-white/ecru → CREAM,
  patterns/multicolor → MULTI
- color_detail: the specific color name in English (e.g. "charcoal grey", "dusty pink")
- style_node: classify into one of the 15 nodes using the taxonomy above. Consider the product's brand aesthetic, silhouette, and target consumer.
- mood_tags: 1-3 sensitivity tags from the allowed list (Korean)
- keywords_ko: 3-7 Korean fashion search keywords that a Korean shopper would use
- keywords_en: 3-7 English fashion search keywords
- confidence: 0.0-1.0 based on image clarity and certainty of classification
- If the image is unclear, blurry, or shows non-fashion content, set confidence < 0.3 and classify as best you can
- Return valid JSON only — no explanation, no markdown`

export const PRODUCT_ANALYZE_USER = "Analyze this product image."
```

> **참고**: 이 파일은 `@/lib/fashion-genome`과 `@/lib/enums/product-enums`를 import한다. scripts에서 `@/` 경로를 사용하려면 tsconfig의 paths가 적용되어야 한다. 기존 `scripts/crawl.ts`는 상대 경로를 사용하므로, 배치 스크립트에서도 동일하게 `tsx`로 실행하되 `tsconfig.json`의 paths를 활용한다. `npx tsx`는 tsconfig paths를 지원하지 않으므로, `scripts/configs/analyze-prompt.ts`에서는 상대 경로로 변경해야 할 수 있다:

```typescript
// 만약 @/ 경로가 안 되면 상대 경로로:
import {buildNodeReference, buildTagList} from "../../src/lib/fashion-genome"
import {buildEnumReference} from "../../src/lib/enums/product-enums"
```

- [ ] **Step 2: import 경로 확인**

Run: `cd /Users/hansangho/Desktop/fashion-ai && npx tsx scripts/configs/analyze-prompt.ts 2>&1`
Expected: 에러 없이 종료 (모듈이 로드만 되면 됨). 만약 `@/` 경로 에러가 나면 상대 경로로 변경.

- [ ] **Step 3: 커밋**

```bash
git add scripts/configs/analyze-prompt.ts
git commit -m "feat: 상품 이미지 배치 분석 프롬프트"
```

---

## Task 5: AI 호출 + 응답 파싱 모듈

**Files:**
- Create: `scripts/lib/product-analyzer.ts`

- [ ] **Step 1: product-analyzer.ts 작성**

```typescript
// scripts/lib/product-analyzer.ts
/**
 * 상품 이미지 AI 분석 — LiteLLM 호출 + 응답 파싱 + 유효성 검증
 */

import OpenAI from "openai"
import {createHash} from "crypto"
import {PRODUCT_ANALYZE_SYSTEM, PRODUCT_ANALYZE_USER} from "../configs/analyze-prompt"
import {
  isValidCategory, isValidSubcategory, isValidFit,
  isValidFabric, isValidColorFamily,
} from "../../src/lib/enums/product-enums"
import {STYLE_NODE_IDS} from "../../src/lib/fashion-genome"

// ─── 타입 ────────────────────────────────────────────

export interface AnalysisResult {
  category: string
  subcategory: string | null
  fit: string | null
  fabric: string | null
  color_family: string | null
  color_detail: string | null
  style_node: string | null
  mood_tags: string[]
  keywords_ko: string[]
  keywords_en: string[]
  confidence: number
}

export interface AnalysisOutput {
  productId: string
  success: boolean
  result: AnalysisResult | null
  raw: unknown
  error: string | null
}

// ─── 클라이언트 ──────────────────────────────────────

let client: OpenAI
let modelName: string
let promptHash: string

export function initAnalyzer(config: {
  baseUrl: string
  apiKey: string
  model: string
}) {
  client = new OpenAI({
    baseURL: config.baseUrl + "/v1",
    apiKey: config.apiKey,
  })
  modelName = config.model
  promptHash = createHash("sha256")
    .update(PRODUCT_ANALYZE_SYSTEM)
    .digest("hex")
    .slice(0, 8)
}

export function getModelId(): string { return modelName }
export function getPromptHash(): string { return promptHash }

// ─── 분석 실행 ───────────────────────────────────────

export async function analyzeProductImage(
  productId: string,
  imageUrl: string,
): Promise<AnalysisOutput> {
  try {
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: PRODUCT_ANALYZE_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: PRODUCT_ANALYZE_USER },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { productId, success: false, result: null, raw: null, error: "empty_response" }
    }

    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return { productId, success: false, result: null, raw: cleaned, error: "json_parse_failed" }
    }

    // 유효성 검증 + 보정
    const result = validateAndNormalize(parsed)
    return { productId, success: true, result, raw: parsed, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Rate limit → 특별 에러 코드
    if (message.includes("429") || message.toLowerCase().includes("rate")) {
      return { productId, success: false, result: null, raw: null, error: "rate_limited" }
    }

    return { productId, success: false, result: null, raw: null, error: message }
  }
}

// ─── 유효성 검증 + 보정 ─────────────────────────────

function validateAndNormalize(raw: Record<string, unknown>): AnalysisResult {
  const category = String(raw.category || "")
  const subcategory = raw.subcategory ? String(raw.subcategory) : null
  const fit = raw.fit ? String(raw.fit) : null
  const fabric = raw.fabric ? String(raw.fabric) : null
  const colorFamily = raw.color_family ? String(raw.color_family) : null

  return {
    category: isValidCategory(category) ? category : "Accessories",
    subcategory: subcategory && isValidSubcategory(category, subcategory) ? subcategory : subcategory,
    fit: fit && isValidFit(fit) ? fit : fit,
    fabric: fabric && isValidFabric(fabric) ? fabric : fabric,
    color_family: colorFamily && isValidColorFamily(colorFamily) ? colorFamily : colorFamily,
    color_detail: raw.color_detail ? String(raw.color_detail) : null,
    style_node: raw.style_node && (STYLE_NODE_IDS as readonly string[]).includes(String(raw.style_node))
      ? String(raw.style_node) : null,
    mood_tags: Array.isArray(raw.mood_tags) ? raw.mood_tags.map(String) : [],
    keywords_ko: Array.isArray(raw.keywords_ko) ? raw.keywords_ko.map(String) : [],
    keywords_en: Array.isArray(raw.keywords_en) ? raw.keywords_en.map(String) : [],
    confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
  }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd /Users/hansangho/Desktop/fashion-ai && npx tsx -e "import './scripts/lib/product-analyzer'" 2>&1`
Expected: 에러 없이 종료 (initAnalyzer 호출 전이라 client는 undefined이지만 모듈 로드는 성공해야 함)

- [ ] **Step 3: 커밋**

```bash
git add scripts/lib/product-analyzer.ts
git commit -m "feat: 상품 이미지 AI 분석 모듈 (product-analyzer.ts)"
```

---

## Task 6: 배치 분석 CLI 스크립트

**Files:**
- Create: `scripts/analyze-products.ts`
- Modify: `.gitignore`

- [ ] **Step 1: .gitignore에 추가**

`.gitignore` 파일 끝에:

```
# 배치 분석 결과
scripts/output/

# 인프라 환경변수
infra/.env
```

- [ ] **Step 2: analyze-products.ts 작성**

```typescript
#!/usr/bin/env npx tsx
/**
 * 상품 이미지 배치 분석 CLI
 *
 * 사용법:
 *   npx tsx scripts/analyze-products.ts --version v1
 *   npx tsx scripts/analyze-products.ts --version v1 --brand "AURALEE"
 *   npx tsx scripts/analyze-products.ts --version v1 --category "Outer"
 *   npx tsx scripts/analyze-products.ts --version v1 --limit 50
 *   npx tsx scripts/analyze-products.ts --version v1 --dry-run
 *   npx tsx scripts/analyze-products.ts --version v1 --retry-failed
 */

import {createClient} from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"
import {
  initAnalyzer, analyzeProductImage, getModelId, getPromptHash,
  type AnalysisOutput,
} from "./lib/product-analyzer"

// ─── 환경변수 ────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL
const LITELLM_API_KEY = process.env.LITELLM_API_KEY
const LITELLM_MODEL = process.env.LITELLM_MODEL || "nova-lite"

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요")
  process.exit(1)
}
if (!LITELLM_BASE_URL || !LITELLM_API_KEY) {
  console.error("❌ LITELLM_BASE_URL / LITELLM_API_KEY 필요")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── CLI 인자 파싱 ───────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=")
      flags[key] = val ?? true
    }
  }
  return flags
}

// ─── 동시성 제한 유틸 ────────────────────────────────

async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0
  let completed = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
      completed++
      onProgress?.(completed, tasks.length)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

// ─── 메인 ────────────────────────────────────────────

async function main() {
  const flags = parseArgs()

  const version = flags.version as string
  if (!version) {
    console.error("❌ --version 필수 (예: --version=v1)")
    process.exit(1)
  }

  const brand = flags.brand as string | undefined
  const category = flags.category as string | undefined
  const limit = flags.limit ? parseInt(flags.limit as string, 10) : undefined
  const dryRun = flags["dry-run"] === true
  const retryFailed = flags["retry-failed"] === true
  const concurrency = flags.concurrency ? parseInt(flags.concurrency as string, 10) : 10

  console.log(`\n🚀 상품 이미지 배치 분석`)
  console.log(`   버전: ${version} | 모델: ${LITELLM_MODEL} | 동시성: ${concurrency}`)
  if (brand) console.log(`   브랜드 필터: ${brand}`)
  if (category) console.log(`   카테고리 필터: ${category}`)
  if (limit) console.log(`   제한: ${limit}개`)
  if (dryRun) console.log(`   🔍 DRY RUN — API 호출 없음`)

  // 분석기 초기화
  initAnalyzer({
    baseUrl: LITELLM_BASE_URL,
    apiKey: LITELLM_API_KEY,
    model: LITELLM_MODEL,
  })

  // ── 대상 상품 조회 ────────────────────────────────

  let query = supabase
    .from("products")
    .select("id, brand, name, category, image_url")
    .eq("in_stock", true)
    .like("image_url", "http%")
    .not("image_url", "like", "%/icon_%")
    .not("image_url", "like", "%/logo_%")
    .not("image_url", "like", "%/badge_%")

  if (brand) query = query.ilike("brand", brand)
  if (category) query = query.eq("category", category)

  // 이미 분석된 상품 제외 (retry-failed가 아닌 경우)
  // Supabase에서 NOT EXISTS를 직접 지원하지 않으므로, 분석 완료 목록을 먼저 조회
  const { data: existingAnalyses } = await supabase
    .from("product_ai_analysis")
    .select("product_id, error")
    .eq("version", version)

  const analyzedIds = new Set<string>()
  const failedIds = new Set<string>()
  if (existingAnalyses) {
    for (const a of existingAnalyses) {
      if (a.error) {
        failedIds.add(a.product_id)
      } else {
        analyzedIds.add(a.product_id)
      }
    }
  }

  const { data: products, error: fetchError } = await query.limit(limit || 50000)

  if (fetchError) {
    console.error("❌ 상품 조회 실패:", fetchError.message)
    process.exit(1)
  }

  if (!products?.length) {
    console.log("ℹ️ 대상 상품 없음")
    return
  }

  // 필터링
  let targets = products.filter((p) => {
    if (retryFailed) return failedIds.has(p.id)
    return !analyzedIds.has(p.id) && !failedIds.has(p.id)
  })

  if (limit && targets.length > limit) targets = targets.slice(0, limit)

  console.log(`\n📦 대상: ${targets.length}개 (전체 ${products.length}개 중)`)
  console.log(`   이미 분석: ${analyzedIds.size}개 | 실패: ${failedIds.size}개`)

  if (dryRun) {
    console.log("\n🔍 DRY RUN 완료")
    // 브랜드별 분포
    const brandCounts: Record<string, number> = {}
    for (const p of targets) {
      brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1
    }
    const sorted = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)
    console.log("\n📊 브랜드별 분포 (상위 20):")
    for (const [b, c] of sorted) console.log(`   ${b}: ${c}개`)
    return
  }

  // ── 배치 분석 실행 ────────────────────────────────

  const startTime = Date.now()
  let successCount = 0
  let failCount = 0
  const failures: { productId: string; brand: string; error: string }[] = []

  const tasks = targets.map((product) => async () => {
    const output = await analyzeWithRetry(product.id, product.image_url, 3)

    if (output.success && output.result) {
      // 성공 → INSERT (retry-failed면 DELETE 후 INSERT)
      if (retryFailed) {
        await supabase
          .from("product_ai_analysis")
          .delete()
          .eq("product_id", product.id)
          .eq("version", version)
      }

      const { error: insertError } = await supabase
        .from("product_ai_analysis")
        .insert({
          product_id: product.id,
          version,
          model_id: getModelId(),
          prompt_hash: getPromptHash(),
          ...output.result,
          raw_response: output.raw,
        })

      if (insertError) {
        failCount++
        failures.push({ productId: product.id, brand: product.brand, error: `db_insert: ${insertError.message}` })
      } else {
        successCount++
      }
    } else {
      // 실패 → error 기록
      if (retryFailed) {
        await supabase
          .from("product_ai_analysis")
          .delete()
          .eq("product_id", product.id)
          .eq("version", version)
      }

      const { error: insertError } = await supabase
        .from("product_ai_analysis")
        .insert({
          product_id: product.id,
          version,
          model_id: getModelId(),
          prompt_hash: getPromptHash(),
          category: "Accessories",  // 필수 필드 — 실패 시 더미
          error: output.error,
          raw_response: output.raw,
        })

      if (insertError) {
        console.error(`   ❌ DB 에러 기록 실패: ${insertError.message}`)
      }

      failCount++
      failures.push({ productId: product.id, brand: product.brand, error: output.error || "unknown" })
    }

    return output
  })

  let lastLog = 0
  await pLimit(tasks, concurrency, (completed, total) => {
    if (completed - lastLog >= 100 || completed === total) {
      const pct = ((completed / total) * 100).toFixed(1)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      console.log(
        `   [${completed}/${total}] ${pct}% — 성공 ${successCount} / 실패 ${failCount} — ${elapsed}s`
      )
      lastLog = completed
    }
  })

  // ── 결과 요약 ─────────────────────────────────────

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n🏁 완료 — ${totalDuration}s`)
  console.log(`   ✅ 성공: ${successCount}개`)
  console.log(`   ❌ 실패: ${failCount}개`)

  if (failures.length > 0) {
    const outputDir = path.join(__dirname, "output")
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    const filename = `failed-${version}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    const outputPath = path.join(outputDir, filename)
    fs.writeFileSync(outputPath, JSON.stringify(failures, null, 2))
    console.log(`   📄 실패 목록: ${outputPath}`)
  }
}

// ─── 재시도 래퍼 ─────────────────────────────────────

async function analyzeWithRetry(
  productId: string,
  imageUrl: string,
  maxRetries: number,
): Promise<AnalysisOutput> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await analyzeProductImage(productId, imageUrl)

    if (result.success) return result

    // Rate limit → 30초 대기
    if (result.error === "rate_limited") {
      console.log(`   ⏳ Rate limit — 30초 대기 (attempt ${attempt}/${maxRetries})`)
      await sleep(30_000)
      continue
    }

    // 이미지 404 → 재시도 불필요
    if (result.error?.includes("404") || result.error === "image_not_found") {
      return result
    }

    // 기타 → exponential backoff
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000  // 2s, 4s, 8s
      console.log(`   ⚠️ 실패 (attempt ${attempt}) — ${delay / 1000}s 후 재시도: ${result.error}`)
      await sleep(delay)
    }
  }

  return { productId, success: false, result: null, raw: null, error: "max_retries_exceeded" }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── 실행 ────────────────────────────────────────────

main().catch((err) => {
  console.error("💥 예외:", err)
  process.exit(1)
})
```

- [ ] **Step 3: 드라이런 테스트**

```bash
cd /Users/hansangho/Desktop/fashion-ai
# .env.local에서 Supabase 환경변수를 가져와서 실행 (LiteLLM은 아직 없으므로 더미)
source .env.local
export LITELLM_BASE_URL=http://localhost:4000
export LITELLM_API_KEY=dummy
npx tsx scripts/analyze-products.ts --version=v1 --dry-run 2>&1
```

Expected: 대상 상품 수와 브랜드별 분포가 출력됨. API 호출은 하지 않음.

- [ ] **Step 4: 커밋**

```bash
git add scripts/analyze-products.ts .gitignore
git commit -m "feat: 상품 이미지 배치 분석 CLI (analyze-products.ts)"
```

---

## Task 7: AWS 인프라 설정 파일

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/config/litellm.yaml`
- Create: `infra/config/Caddyfile`
- Create: `infra/scripts/setup.sh`
- Create: `infra/.env.example`

- [ ] **Step 1: docker-compose.yml**

```yaml
# infra/docker-compose.yml
version: "3.8"

services:
  litellm:
    image: ghcr.io/berriai/litellm:main-stable
    container_name: litellm
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./config/litellm.yaml:/app/config.yaml
    environment:
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
      - AWS_REGION_NAME=ap-northeast-1
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    command: ["--config", "/app/config.yaml", "--port", "4000"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./config/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - litellm

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 2: litellm.yaml**

```yaml
# infra/config/litellm.yaml

model_list:
  # 배치 분석용 — Bedrock Nova Lite (Vision, 최저가)
  - model_name: nova-lite
    litellm_params:
      model: bedrock/amazon.nova-lite-v1:0
      aws_region_name: ap-northeast-1

  # 프론트 분석용 — OpenAI GPT-4o-mini
  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini

litellm_settings:
  request_timeout: 120
  num_retries: 2

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

- [ ] **Step 3: Caddyfile**

```
# infra/config/Caddyfile
# 도메인이 있으면 {domain} 으로 변경 (자동 HTTPS)
# 도메인 없으면 IP:443으로 자체 서명 인증서 사용

:443 {
    reverse_proxy litellm:4000
    tls internal
}
```

- [ ] **Step 4: setup.sh**

```bash
#!/bin/bash
# infra/scripts/setup.sh — EC2 t4g.small 초기 세팅 (Amazon Linux 2023 ARM)

set -euo pipefail

echo "=== Docker 설치 ==="
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user

echo "=== Docker Compose 설치 ==="
COMPOSE_VERSION="v2.29.1"
sudo curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-aarch64" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

echo "=== 디렉토리 구조 ==="
mkdir -p ~/fashion-ai-infra/config

echo "=== 완료 ==="
echo "다음 단계:"
echo "1. ~/fashion-ai-infra/에 docker-compose.yml, config/ 복사"
echo "2. ~/fashion-ai-infra/.env 생성"
echo "3. docker-compose up -d"
echo "4. curl http://localhost:4000/health 확인"
```

- [ ] **Step 5: .env.example**

```bash
# infra/.env.example — 실제 값은 .env에 작성 (gitignore됨)

# LiteLLM
LITELLM_MASTER_KEY=sk-your-master-key-here

# OpenAI (프론트용 — LiteLLM이 프록시)
OPENAI_API_KEY=sk-your-openai-key-here

# AWS Bedrock — EC2 IAM Role 사용 시 불필요
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
```

- [ ] **Step 6: 커밋**

```bash
git add infra/
git commit -m "feat: AWS 인프라 설정 (LiteLLM + Caddy docker-compose)"
```

---

## Task 8: 프론트 analyze API → LiteLLM 연동

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: OpenAI 클라이언트를 LiteLLM 엔드포인트로 변경**

`src/app/api/analyze/route.ts` 상단의 OpenAI 클라이언트 초기화를 변경:

```typescript
// Before (line 10-12):
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// After:
const openai = new OpenAI({
  apiKey: process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.LITELLM_BASE_URL
    ? `${process.env.LITELLM_BASE_URL}/v1`
    : undefined,
})
```

이렇게 하면:
- `LITELLM_BASE_URL`이 설정되면 LiteLLM 게이트웨이 사용
- 설정 안 되면 기존 OpenAI 직접 호출 (폴백)
- 모델명 `gpt-4o-mini`는 그대로 — LiteLLM이 OpenAI로 라우팅

- [ ] **Step 2: 빌드 확인**

Run: `cd /Users/hansangho/Desktop/fashion-ai && pnpm build 2>&1 | tail -10`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: analyze API에 LiteLLM 게이트웨이 연동 (OpenAI 폴백 유지)"
```

---

## Task 9: AWS 인프라 실제 구축 + 배포

> 이 태스크는 코드가 아닌 **인프라 작업**. AWS 콘솔 + SSH를 사용.

- [ ] **Step 1: EC2 인스턴스 생성**

AWS 콘솔에서:
- 리전: ap-northeast-2 (서울)
- AMI: Amazon Linux 2023 (ARM)
- 타입: t4g.small
- 스토리지: gp3 20GB
- 보안 그룹: 인바운드 443 (0.0.0.0/0), 22 (본인 IP)
- IAM Role: BedrockInvokeModel 권한 포함

- [ ] **Step 2: Bedrock 모델 접근 활성화**

AWS 콘솔 → Bedrock → Model access:
- 리전: ap-northeast-1 (Tokyo)
- Amazon Nova Lite 활성화 요청
- 승인까지 수 분 소요

- [ ] **Step 3: EC2 초기 설정**

```bash
ssh ec2-user@{EC2_IP}
# setup.sh 내용 실행
```

- [ ] **Step 4: 설정 파일 배포**

```bash
scp -r infra/docker-compose.yml infra/config/ ec2-user@{EC2_IP}:~/fashion-ai-infra/
# .env 파일은 수동 생성 (보안)
ssh ec2-user@{EC2_IP} "cd ~/fashion-ai-infra && vi .env"
```

- [ ] **Step 5: Docker 실행 + 헬스체크**

```bash
ssh ec2-user@{EC2_IP}
cd ~/fashion-ai-infra
docker-compose up -d
docker-compose logs -f litellm  # 정상 기동 확인
curl http://localhost:4000/health  # {"status":"healthy"}
curl https://localhost/health -k   # Caddy 프록시 확인
```

- [ ] **Step 6: 로컬에서 연결 테스트**

```bash
# 로컬에서 LiteLLM 엔드포인트 확인
curl -X POST https://{EC2_IP}/v1/chat/completions \
  -H "Authorization: Bearer {MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model": "nova-lite", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 10}'
```

Expected: Nova Lite 응답이 정상적으로 반환됨

---

## Task 10: 소규모 테스트 + 전체 실행

- [ ] **Step 1: 소규모 테스트 (10개)**

```bash
cd /Users/hansangho/Desktop/fashion-ai
source .env.local
export LITELLM_BASE_URL=https://{EC2_IP}
export LITELLM_API_KEY={MASTER_KEY}
export LITELLM_MODEL=nova-lite

npx tsx scripts/analyze-products.ts --version=v1 --limit=10
```

Expected: 10개 상품 분석 완료. Supabase에서 `product_ai_analysis` 테이블에 10개 행 확인.

- [ ] **Step 2: 결과 검증**

Supabase SQL Editor에서:

```sql
SELECT p.brand, p.name, pai.category, pai.subcategory, pai.fit,
       pai.fabric, pai.color_family, pai.style_node, pai.confidence
FROM product_ai_analysis pai
JOIN products p ON p.id = pai.product_id
WHERE pai.version = 'v1'
ORDER BY pai.created_at DESC
LIMIT 10;
```

수동으로 확인: 이미지와 분석 결과가 맞는지 10개 검증.

- [ ] **Step 3: 프롬프트 튜닝 (필요 시)**

결과가 부정확하면 `scripts/configs/analyze-prompt.ts` 수정 후 재실행:

```bash
# 기존 10개 삭제
# Supabase SQL: DELETE FROM product_ai_analysis WHERE version = 'v1';
npx tsx scripts/analyze-products.ts --version=v1 --limit=10
```

- [ ] **Step 4: 전체 실행**

```bash
npx tsx scripts/analyze-products.ts --version=v1
```

예상 소요시간: 동시 10개 × 15,000개 ≈ 30-60분.

- [ ] **Step 5: 실행 결과 확인**

```sql
-- 전체 통계
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE error IS NULL) as success,
  COUNT(*) FILTER (WHERE error IS NOT NULL) as failed,
  COUNT(DISTINCT category) as categories,
  COUNT(DISTINCT style_node) as style_nodes
FROM product_ai_analysis WHERE version = 'v1';

-- 카테고리별 분포
SELECT category, COUNT(*) as cnt
FROM product_ai_analysis WHERE version = 'v1' AND error IS NULL
GROUP BY category ORDER BY cnt DESC;

-- color_family 분포
SELECT color_family, COUNT(*) as cnt
FROM product_ai_analysis WHERE version = 'v1' AND error IS NULL
GROUP BY color_family ORDER BY cnt DESC;
```

- [ ] **Step 6: 실패 건 재시도**

```bash
npx tsx scripts/analyze-products.ts --version=v1 --retry-failed
```

- [ ] **Step 7: 최종 커밋**

```bash
git add -A  # 프롬프트 튜닝 등 변경사항
git commit -m "feat: Part 1 완료 — 15,000개 상품 이미지 배치 분석"
```

---

## Task 11: 프론트 LiteLLM 전환 확인

- [ ] **Step 1: .env.local에 LiteLLM 환경변수 추가**

```bash
# .env.local에 추가
LITELLM_BASE_URL=https://{EC2_IP}
LITELLM_API_KEY={MASTER_KEY}
```

- [ ] **Step 2: 개발 서버에서 분석 테스트**

```bash
pnpm dev
```

브라우저에서 이미지 업로드 → 분석 결과 정상 반환 확인.
(LiteLLM → OpenAI GPT-4o-mini 경유이므로 기존과 동일한 결과)

- [ ] **Step 3: 응답 속도 비교**

LiteLLM 경유 시 기존 대비 지연이 큰지 확인.
목표: 기존 대비 +500ms 이내.

---

## Execution Summary

| Task | 내용 | 예상 시간 |
|------|------|----------|
| 1 | 공유 Enum 모듈 | 10분 |
| 2 | 프롬프트 enum 통합 + color_family | 20분 |
| 3 | DB 마이그레이션 | 10분 |
| 4 | 배치 분석 프롬프트 | 10분 |
| 5 | AI 호출 + 파싱 모듈 | 15분 |
| 6 | 배치 CLI 스크립트 | 20분 |
| 7 | 인프라 설정 파일 | 15분 |
| 8 | 프론트 LiteLLM 연동 | 5분 |
| 9 | AWS 실제 구축 (수동) | 30-60분 |
| 10 | 테스트 + 전체 실행 | 30-60분 + 실행 대기 |
| 11 | 프론트 전환 확인 | 10분 |
