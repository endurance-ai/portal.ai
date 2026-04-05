# Admin Products Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin product catalog with card-based UI for browsing crawled products and verifying AI analysis results.

**Architecture:** Two pages (`/admin/products` list + `/admin/products/[id]` detail) backed by two API routes. List page uses 3-column card grid with AI tags. Detail page uses left-right split (image / info+AI). Products table LEFT JOINed with product_ai_analysis for AI data.

**Tech Stack:** Next.js 16 App Router, Supabase, React 19, Tailwind 4, lucide-react

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/admin/products/route.ts` | List API — filter, search, sort, paginate |
| Create | `src/app/api/admin/products/[id]/route.ts` | Detail API — single product + AI data |
| Create | `src/app/admin/products/page.tsx` | List page — 3-col grid + filters |
| Create | `src/app/admin/products/[id]/page.tsx` | Detail page — left-right split |
| Modify | `src/components/admin/sidebar.tsx` | Add "상품 DB" nav item |

---

### Task 1: Sidebar — "상품 DB" 탭 추가

**Files:**
- Modify: `src/components/admin/sidebar.tsx`

- [ ] **Step 1: Add nav item**

In `src/components/admin/sidebar.tsx`, add `ShoppingBag` to the lucide import and add a new entry to `NAV_ITEMS`:

```typescript
import { Database, BarChart3, FlaskConical, ShoppingBag } from "lucide-react"

const NAV_ITEMS = [
  {
    href: "/admin/genome",
    label: "브랜드 DB",
    description: "브랜드/노드 관리",
    icon: Database,
  },
  {
    href: "/admin/analytics",
    label: "분석 로그",
    description: "분석 기록 & 활동",
    icon: BarChart3,
  },
  {
    href: "/admin/eval",
    label: "품질 평가",
    description: "품질 평가 허브",
    icon: FlaskConical,
  },
  {
    href: "/admin/products",
    label: "상품 DB",
    description: "크롤링 상품 & AI 분석",
    icon: ShoppingBag,
  },
] as const
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build succeeds, `/admin/products` not yet created (404 is fine)

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/sidebar.tsx
git commit -m "feat: add 상품 DB nav item to admin sidebar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: List API (`/api/admin/products`)

**Files:**
- Create: `src/app/api/admin/products/route.ts`

- [ ] **Step 1: Create the list API**

```typescript
// src/app/api/admin/products/route.ts

import {NextRequest, NextResponse} from "next/server"
import {createSupabaseServer} from "@/lib/supabase-server"
import {supabase} from "@/lib/supabase"

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  // Auth
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10) || 0)
  const search = searchParams.get("search")?.trim() || ""
  const category = searchParams.get("category") || ""
  const platform = searchParams.get("platform") || ""
  const brand = searchParams.get("brand") || ""
  const styleNode = searchParams.get("styleNode") || ""
  const colorFamily = searchParams.get("colorFamily") || ""
  const aiStatus = searchParams.get("aiStatus") || "all" // all | analyzed | unanalyzed
  const sort = searchParams.get("sort") || "newest"

  // 1. If filtering by AI fields (styleNode, colorFamily, aiStatus=analyzed),
  //    get matching product IDs from product_ai_analysis first
  let aiProductIds: string[] | null = null

  if (styleNode || colorFamily || aiStatus === "analyzed") {
    let aiQuery = supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")

    if (styleNode) aiQuery = aiQuery.eq("style_node", styleNode)
    if (colorFamily) aiQuery = aiQuery.eq("color_family", colorFamily)

    const { data: aiRows } = await aiQuery
    aiProductIds = aiRows?.map((r) => r.product_id) || []

    if (aiProductIds.length === 0) {
      return NextResponse.json({ products: [], total: 0, page, totalPages: 0 })
    }
  }

  // 2. If aiStatus=unanalyzed, get product IDs that DO have AI data to exclude
  let excludeIds: string[] | null = null
  if (aiStatus === "unanalyzed") {
    const { data: aiRows } = await supabase
      .from("product_ai_analysis")
      .select("product_id")
      .eq("version", "v1")
    excludeIds = aiRows?.map((r) => r.product_id) || []
  }

  // 3. Build products query
  let query = supabase
    .from("products")
    .select("id, brand, name, price, image_url, platform, category, in_stock, style_node, gender, created_at", { count: "exact" })
    .eq("in_stock", true)

  if (search) {
    query = query.or(`brand.ilike.%${search}%,name.ilike.%${search}%`)
  }
  if (category) query = query.eq("category", category)
  if (platform) query = query.eq("platform", platform)
  if (brand) query = query.ilike("brand", brand)
  if (aiProductIds) query = query.in("id", aiProductIds)
  if (excludeIds && excludeIds.length > 0) {
    // Supabase doesn't have "not in" for large arrays easily,
    // so we filter client-side for unanalyzed
  }

  // Sort
  switch (sort) {
    case "price_asc": query = query.order("price", { ascending: true, nullsFirst: false }); break
    case "price_desc": query = query.order("price", { ascending: false, nullsFirst: false }); break
    case "brand_asc": query = query.order("brand", { ascending: true }); break
    default: query = query.order("created_at", { ascending: false }); break
  }

  // Paginate
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const { data: products, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. Fetch AI data for these products
  const productIds = products?.map((p) => p.id) || []
  let aiMap: Record<string, {
    category: string; subcategory: string | null; fit: string | null;
    fabric: string | null; color_family: string | null; style_node: string | null;
    mood_tags: string[] | null; confidence: number | null;
  }> = {}

  if (productIds.length > 0) {
    const { data: aiData } = await supabase
      .from("product_ai_analysis")
      .select("product_id, category, subcategory, fit, fabric, color_family, style_node, mood_tags, confidence")
      .eq("version", "v1")
      .in("product_id", productIds)

    if (aiData) {
      for (const row of aiData) {
        aiMap[row.product_id] = {
          category: row.category,
          subcategory: row.subcategory,
          fit: row.fit,
          fabric: row.fabric,
          color_family: row.color_family,
          style_node: row.style_node,
          mood_tags: row.mood_tags,
          confidence: row.confidence,
        }
      }
    }
  }

  // 5. Filter unanalyzed client-side if needed
  let finalProducts = (products || []).map((p) => ({
    id: p.id,
    brand: p.brand,
    name: p.name,
    price: p.price,
    imageUrl: p.image_url,
    platform: p.platform,
    category: p.category,
    inStock: p.in_stock,
    ai: aiMap[p.id] || null,
  }))

  if (aiStatus === "unanalyzed") {
    finalProducts = finalProducts.filter((p) => !p.ai)
  }

  const total = aiStatus === "unanalyzed"
    ? finalProducts.length
    : (count || 0)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return NextResponse.json({ products: finalProducts, total, page, totalPages })
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/products/route.ts
git commit -m "feat: add admin products list API with filters

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Detail API (`/api/admin/products/[id]`)

**Files:**
- Create: `src/app/api/admin/products/[id]/route.ts`

- [ ] **Step 1: Create the detail API**

```typescript
// src/app/api/admin/products/[id]/route.ts

import {NextRequest, NextResponse} from "next/server"
import {createSupabaseServer} from "@/lib/supabase-server"
import {supabase} from "@/lib/supabase"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  // Fetch AI analysis
  const { data: aiRow } = await supabase
    .from("product_ai_analysis")
    .select("*")
    .eq("product_id", id)
    .eq("version", "v1")
    .single()

  return NextResponse.json({
    product: {
      id: product.id,
      brand: product.brand,
      name: product.name,
      price: product.price,
      originalPrice: product.original_price,
      salePrice: product.sale_price,
      imageUrl: product.image_url,
      images: product.images,
      productUrl: product.product_url,
      platform: product.platform,
      category: product.category,
      subcategory: product.subcategory,
      gender: product.gender,
      inStock: product.in_stock,
      color: product.color,
      material: product.material,
      description: product.description,
      tags: product.tags,
      sizeInfo: product.size_info,
      createdAt: product.created_at,
      ai: aiRow ? {
        category: aiRow.category,
        subcategory: aiRow.subcategory,
        fit: aiRow.fit,
        fabric: aiRow.fabric,
        colorFamily: aiRow.color_family,
        colorDetail: aiRow.color_detail,
        styleNode: aiRow.style_node,
        moodTags: aiRow.mood_tags,
        keywordsKo: aiRow.keywords_ko,
        keywordsEn: aiRow.keywords_en,
        confidence: aiRow.confidence,
        modelId: aiRow.model_id,
        version: aiRow.version,
      } : null,
    },
  })
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/products/\[id\]/route.ts
git commit -m "feat: add admin product detail API

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: List Page (`/admin/products`)

**Files:**
- Create: `src/app/admin/products/page.tsx`

- [ ] **Step 1: Create the products list page**

Full `"use client"` page with:

**State:**
- `products[]`, `total`, `totalPages`, `page`, `loading`
- Filter states: `search`, `category`, `platform`, `styleNode`, `colorFamily`, `aiStatus`, `sort`

**Filter bar** (top, horizontal):
- Search input (text, debounced 300ms)
- Category dropdown: `["", "Outer", "Top", "Bottom", "Shoes", "Bag", "Dress", "Accessories"]`
- Platform dropdown: loaded from distinct values or hardcoded from known platforms
- Style Node dropdown: `["", "A-1", "A-2", "A-3", "B", "B-2", "C", "D", "E", "F", "F-2", "F-3", "G", "H", "I", "K"]`
- Color Family dropdown: `["", "BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN", "GREEN", "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM", "KHAKI", "MULTI"]`
- AI Status dropdown: `[{value:"all",label:"전체"}, {value:"analyzed",label:"분석완료"}, {value:"unanalyzed",label:"미분석"}]`
- Sort dropdown: `[{value:"newest",label:"최신순"}, {value:"price_desc",label:"가격↓"}, {value:"price_asc",label:"가격↑"}, {value:"brand_asc",label:"브랜드 A-Z"}]`

**Grid:** 3-column, responsive (1col mobile, 2col tablet, 3col desktop)

**Card design:**
```
┌─────────────────┐
│  상품 이미지      │  next/image, aspect-ratio 3/4, object-cover
│  (3:4)           │
├─────────────────┤
│ BRAND            │  text-xs text-muted-foreground
│ Product Name     │  text-sm truncate
│ ₩890,000         │  text-sm font-bold
│ ─── AI ANALYSIS ─│  border-t, 초록 테마
│ [Outer][overcoat]│  bg-green-900/20 border-green-800/30 text-green-500 text-[10px]
│ [C] [GREY] [wool]│
└─────────────────┘
```

AI 미분석 카드:
```
│ ─── NO AI DATA ──│  border-t dashed, text-orange-400/70
```

**Card click:** `router.push(\`/admin/products/${product.id}\`)`

**Pagination:** Bottom center, `ChevronLeft` / `ChevronRight` buttons + page number (기존 eval 패턴)

**Fetch:** `useCallback` + `useEffect` triggered by filter/page state changes. Build query string from all filter states.

**Styling:**
- Filter selects: `h-8 text-xs border-border rounded-md bg-background px-2`
- Search input: `h-8 text-xs border-border rounded-md bg-background pl-8` (with Search icon)
- Cards: `border border-border rounded-lg overflow-hidden hover:border-foreground/30 transition-colors cursor-pointer`
- Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

**Total count display:** `"{total}개 상품"` top-right, `text-xs text-muted-foreground tabular-nums`

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/products/page.tsx
git commit -m "feat: add admin products list page with 3-col card grid

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Detail Page (`/admin/products/[id]`)

**Files:**
- Create: `src/app/admin/products/[id]/page.tsx`

- [ ] **Step 1: Create the product detail page**

Server component (like existing `eval/[analysisId]/page.tsx` pattern). Fetches data server-side via `supabase` directly (not API route), renders a client component.

**Server component** (`page.tsx`):
```typescript
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ProductDetail } from "@/components/admin/product-detail"

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [productRes, aiRes] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).single(),
    supabase
      .from("product_ai_analysis")
      .select("*")
      .eq("product_id", id)
      .eq("version", "v1")
      .single()
      .then((res) => res, () => ({ data: null, error: null })),
  ])

  if (productRes.error) notFound()

  return <ProductDetail product={productRes.data} ai={aiRes.data} />
}
```

**Client component** (`src/components/admin/product-detail.tsx`):

Left-right split layout:
- **Left (flex-1):** Large product image, `aspect-ratio: 3/4`, `rounded-lg`, `object-cover`. Below image: platform badge.
- **Right (flex-1):** Scrollable info panel:
  1. **Header:** Brand (muted), product name (lg bold), price (bold). Sale price with strikethrough original if applicable.
  2. **AI Analysis box** (if ai data exists):
     - Green-themed box: `bg-green-950/30 border border-green-800/30 rounded-lg p-4`
     - Header: `"AI ANALYSIS"` + `version` + `confidence` badge
     - 2-column grid of labeled values: category, subcategory, fit, fabric, colorFamily, colorDetail, styleNode
     - mood_tags as tag pills
     - keywords_ko, keywords_en as comma-separated
     - model_id small text
  3. **AI Analysis box** (if NO ai data):
     - `border-dashed border-orange-400/30 bg-orange-950/10 rounded-lg p-4`
     - "AI 분석 데이터 없음" text
  4. **상품 정보 box** (gray-themed):
     - `bg-muted/30 border border-border rounded-lg p-4`
     - Fields: gender, inStock, category, subcategory, color, material, description, tags, sizeInfo
     - Each as `label: value` rows
  5. **외부 링크 버튼:**
     - `<a>` styled as button, opens product.productUrl in new tab
     - `"원본 상품 페이지 →"` with ArrowUpRight icon

**Back button:** Top-left, `ChevronLeft` + "상품 목록" linking to `/admin/products`

**Layout:** `flex flex-col lg:flex-row gap-6`, image sticky on desktop (`lg:sticky lg:top-4 lg:self-start`)

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/products/\[id\]/page.tsx src/components/admin/product-detail.tsx
git commit -m "feat: add admin product detail page with AI analysis display

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: E2E 검증 + 빌드

- [ ] **Step 1: Full build check**

Run: `pnpm build 2>&1 | tail -20`
Expected: Build succeeds, new routes visible:
- `/admin/products`
- `/admin/products/[id]`
- `/api/admin/products`
- `/api/admin/products/[id]`

- [ ] **Step 2: Lint**

Run: `pnpm lint 2>&1`
Expected: 0 errors

- [ ] **Step 3: Commit any fixes**

If lint errors, fix and commit.

---

## NOT in scope

- 상품 편집/삭제 (읽기 전용)
- AI 재분석 트리거
- 이미지 갤러리/캐러셀
- 브랜드 자동완성 API
- CSV/엑셀 내보내기
