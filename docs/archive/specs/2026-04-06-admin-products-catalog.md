# 어드민 상품 카탈로그 페이지

> **목표**: 크롤링된 ~15,000개 상품을 카드 UI로 브라우징하고, AI 분석 결과가 정확한지 시각적으로 검증할 수 있는 어드민 페이지.

---

## 1. 페이지 구조

### 1.1 리스트 페이지 (`/admin/products`)

- **3열 그리드** 카드 레이아웃
- 카드당: 상품 이미지(3:4) + 브랜드 + 상품명 + 가격 + AI 분석 태그
- AI 분석 완료: 초록색 태그 (category, subcategory, style_node, color_family, fit, fabric)
- AI 미분석: "NO AI DATA" 표시 (주황색)
- **20개/페이지**, 페이지네이션 하단

### 1.2 상세 페이지 (`/admin/products/[id]`)

- **좌우 2분할**: 왼쪽 큰 이미지 / 오른쪽 정보
- 오른쪽 상단: 브랜드, 상품명, 가격, 플랫폼
- 오른쪽 중앙: AI 분석 결과 박스 (초록 테마)
  - category, subcategory, fit, fabric, color_family, color_detail
  - style_node, mood_tags, keywords_ko, keywords_en
  - confidence, model_id, version
  - 미분석 시: "AI 분석 데이터 없음" 표시
- 오른쪽 하단: 상품 원본 데이터 (DB 컬럼 그대로)
  - gender, in_stock, category, color, material, description, tags
- 하단: 원본 상품 페이지 외부 링크 버튼

---

## 2. 필터 & 검색 & 정렬

### 2.1 필터 (리스트 페이지 상단)

| 필터 | 소스 | UI |
|------|------|-----|
| 브랜드 | products.brand (DISTINCT) | 텍스트 입력 (자동완성) |
| 카테고리 | products.category | 드롭다운 |
| 플랫폼 | products.platform (DISTINCT) | 드롭다운 |
| Style Node | product_ai_analysis.style_node | 드롭다운 |
| Color Family | product_ai_analysis.color_family | 드롭다운 |
| AI 분석 상태 | PAI 존재 여부 | 드롭다운 (전체/완료/미완료) |

### 2.2 검색

- 브랜드 + 상품명 텍스트 검색 (`ILIKE` 패턴)

### 2.3 정렬

| 정렬 | 기본값 |
|------|--------|
| 최신순 (created_at DESC) | ✅ 기본 |
| 가격 높은순 | |
| 가격 낮은순 | |
| 브랜드순 (A-Z) | |

---

## 3. API 설계

### 3.1 리스트 API

```
GET /api/admin/products
  ?page=0
  &limit=20
  &search=auralee
  &category=Outer
  &platform=shopamomento
  &brand=AURALEE
  &styleNode=C
  &colorFamily=GREY
  &aiStatus=analyzed|unanalyzed|all
  &sort=newest|price_asc|price_desc|brand_asc
```

**Response:**
```json
{
  "products": [
    {
      "id": "uuid",
      "brand": "AURALEE",
      "name": "Wool Cashmere Melton Chesterfield Coat",
      "price": 890000,
      "imageUrl": "https://...",
      "platform": "shopamomento",
      "category": "Outer",
      "inStock": true,
      "ai": {
        "category": "Outer",
        "subcategory": "overcoat",
        "fit": "oversized",
        "fabric": "wool",
        "colorFamily": "GREY",
        "styleNode": "C",
        "moodTags": ["미니멀", "하이엔드"],
        "confidence": 0.92
      } | null
    }
  ],
  "total": 15234,
  "page": 0,
  "totalPages": 762
}
```

**쿼리 전략:**
- `products` LEFT JOIN `product_ai_analysis` ON `product_id = products.id AND version = 'v1'`
- Supabase JS로 구현: products 조회 후 PAI 별도 조회 → 클라이언트에서 merge
  - Supabase JS의 nested select는 1:N 관계에서 배열을 반환하므로, 별도 조회가 깔끔
- 필터: products 컬럼 → WHERE 절, PAI 컬럼(styleNode, colorFamily) → PAI 서브쿼리
- aiStatus 필터: `analyzed` → PAI EXISTS, `unanalyzed` → PAI NOT EXISTS
- 검색: `brand ILIKE '%search%' OR name ILIKE '%search%'`
- 정렬: products 컬럼 기준 ORDER BY

### 3.2 상세 API

```
GET /api/admin/products/[id]
```

**Response:**
```json
{
  "product": {
    "id": "uuid",
    "brand": "AURALEE",
    "name": "Wool Cashmere Melton Chesterfield Coat",
    "price": 890000,
    "originalPrice": 890000,
    "salePrice": null,
    "imageUrl": "https://...",
    "images": ["https://..."],
    "productUrl": "https://...",
    "platform": "shopamomento",
    "category": "Outer",
    "subcategory": "overcoat",
    "gender": ["men"],
    "inStock": true,
    "color": "charcoal",
    "material": "wool cashmere",
    "description": "...",
    "tags": [...],
    "createdAt": "...",
    "ai": {
      "category": "Outer",
      "subcategory": "overcoat",
      "fit": "oversized",
      "fabric": "wool",
      "colorFamily": "GREY",
      "colorDetail": "charcoal grey",
      "styleNode": "C",
      "moodTags": ["미니멀", "하이엔드"],
      "keywordsKo": ["오버사이즈", "울", "코트"],
      "keywordsEn": ["oversized", "wool", "coat"],
      "confidence": 0.92,
      "modelId": "nova-lite",
      "version": "v1"
    } | null
  }
}
```

---

## 4. 사이드바 변경

`src/components/admin/sidebar.tsx`의 `NAV_ITEMS`에 추가:

```typescript
{
  href: "/admin/products",
  label: "상품 DB",
  description: "크롤링 상품 & AI 분석",
  icon: ShoppingBag,  // lucide-react
}
```

기존 순서: 브랜드 DB → 분석 로그 → 품질 평가 → **상품 DB** (마지막에 추가)

---

## 5. UI 디자인 상세

### 5.1 카드 (리스트)

```
┌─────────────────┐
│                  │
│   상품 이미지     │  ← aspect-ratio: 3/4
│   (3:4)          │
│                  │
├─────────────────┤
│ BRAND            │  ← text-muted-foreground, text-xs
│ Product Name     │  ← text-sm, truncate
│ ₩890,000         │  ← text-sm, font-bold
│ ─────────────── │
│ AI ANALYSIS      │  ← 초록 배경, 태그 나열
│ [Outer] [C]      │
│ [GREY] [wool]    │
└─────────────────┘
```

- AI 미분석: 태그 영역에 `NO AI DATA` (text-orange-400, dashed border)
- 카드 hover: `border-foreground/30` transition
- 카드 클릭: `/admin/products/[id]`로 이동

### 5.2 필터 바

```
[🔍 검색...]  [카테고리 ▾]  [플랫폼 ▾]  [노드 ▾]  [컬러 ▾]  [AI상태 ▾]  [정렬: 최신순 ▾]
```

- 한 줄에 수평 배치, overflow 시 wrap
- 기존 어드민 스타일: `border-border`, `text-sm`, `rounded-md`

### 5.3 페이지네이션

기존 eval 페이지의 `ChevronLeft/ChevronRight` 버튼 패턴 그대로 사용.

---

## NOT in scope

- 상품 편집/삭제 기능 (읽기 전용)
- AI 재분석 트리거
- 이미지 갤러리/캐러셀 (단일 이미지만)
- 브랜드 자동완성 API (일반 텍스트 입력으로 시작)
- 상품 비교 기능
- CSV/엑셀 내보내기
