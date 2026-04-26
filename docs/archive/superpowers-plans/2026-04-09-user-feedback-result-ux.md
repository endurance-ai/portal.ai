# User Feedback & Result UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결과 화면 UX 개선 (오버레이 카드 + 매칭 칩) + 대화형 리파인 + 유저 피드백 수집 + 어드민 User Voice 탭

**Architecture:** Session chain 모델 — `analysis_sessions` → `analyses` (1:N) → `user_feedbacks` (1:1 per session). 결과 화면에 스티키 리파인 바와 피드백 플로우를 추가하고, 검색 엔진에서 매칭 이유 데이터를 프론트에 전달. 어드민에 User Voice 전용 탭 추가.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 4, framer-motion, Supabase (PostgreSQL), shadcn/ui, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-09-user-feedback-and-result-ux-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `supabase/migrations/021_session_feedback.sql` | analysis_sessions + user_feedbacks 테이블, analyses 컬럼 추가 |
| `src/components/result/product-card.tsx` | 오버레이 인터랙션 상품 카드 (look-breakdown에서 분리) |
| `src/components/result/sticky-refine-bar.tsx` | 하단 고정 리파인 입력 바 |
| `src/components/result/feedback-flow.tsx` | 👍/👎 → 태그 칩 → 텍스트/이메일 → 감사 토스트 |
| `src/components/result/empty-results.tsx` | 빈 결과 + 재시도 유도 UI |
| `src/app/api/feedback/route.ts` | 유저 피드백 저장 API |
| `src/app/api/admin/user-voice/route.ts` | 어드민 User Voice 데이터 API |
| `src/app/admin/user-voice/page.tsx` | 어드민 User Voice 대시보드 페이지 |
| `src/components/admin/user-voice-dashboard.tsx` | 메트릭 + 태그 분포 + 피드백 리스트 |
| `src/lib/feedback-tags.ts` | 피드백 태그 프리셋 상수 |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/page.tsx` | 세션 state 추가, 리파인 핸들러, 피드백/스티키바 연동 |
| `src/components/result/look-breakdown.tsx` | 기존 카드→ProductCard 교체, refine capsules/actions 제거, empty state 교체 |
| `src/app/api/analyze/route.ts` | 세션 생성/연결, parent_analysis_id, refinement context GPT 삽입 |
| `src/app/api/search-products/route.ts` | matchReasons 데이터를 프론트 응답에 포함 |
| `src/components/admin/sidebar.tsx` | User Voice 탭 추가 |

---

### Task 1: DB 마이그레이션 — 세션 + 피드백 테이블

**Files:**
- Create: `supabase/migrations/021_session_feedback.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- analysis_sessions: 유저 분석 세션 (리파인 체인 단위)
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  initial_prompt text,
  initial_image_url text,
  gender text,
  analysis_count int NOT NULL DEFAULT 1,
  last_analysis_id uuid
);

CREATE INDEX idx_sessions_created_at ON analysis_sessions (created_at DESC);

-- user_feedbacks: 유저 피드백 (세션당 1개)
CREATE TABLE IF NOT EXISTS user_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  tags text[] DEFAULT '{}',
  comment text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedbacks_session ON user_feedbacks (session_id);
CREATE INDEX idx_feedbacks_rating ON user_feedbacks (rating);
CREATE INDEX idx_feedbacks_created_at ON user_feedbacks (created_at DESC);

-- analyses 테이블에 세션 관련 컬럼 추가
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES analysis_sessions(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS parent_analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS refinement_prompt text;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS sequence_number int DEFAULT 1;

CREATE INDEX idx_analyses_session ON analyses (session_id);
CREATE INDEX idx_analyses_parent ON analyses (parent_analysis_id);
```

- [ ] **Step 2: Supabase에 마이그레이션 적용**

Run: `npx supabase db push` 또는 Supabase 대시보드에서 SQL 직접 실행.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/021_session_feedback.sql
git commit -m "feat: add analysis_sessions + user_feedbacks tables"
```

---

### Task 2: 피드백 태그 상수 + 공유 타입

**Files:**
- Create: `src/lib/feedback-tags.ts`

- [ ] **Step 1: 피드백 태그 상수 파일 작성**

```typescript
export const FEEDBACK_TAGS = [
  { id: "style_mismatch", label: "스타일이 달라요", labelEn: "Style mismatch" },
  { id: "price_high", label: "가격대가 높아요", labelEn: "Price too high" },
  { id: "product_irrelevant", label: "상품이 안 맞아요", labelEn: "Irrelevant products" },
  { id: "few_results", label: "결과가 너무 적어요", labelEn: "Too few results" },
  { id: "category_wrong", label: "카테고리가 틀려요", labelEn: "Wrong category" },
  { id: "color_off", label: "색감이 달라요", labelEn: "Color mismatch" },
  { id: "brand_unfamiliar", label: "브랜드가 낯설어요", labelEn: "Unfamiliar brands" },
  { id: "other", label: "기타", labelEn: "Other" },
] as const

export type FeedbackTagId = (typeof FEEDBACK_TAGS)[number]["id"]

export type FeedbackRating = "up" | "down"

export interface FeedbackPayload {
  sessionId: string
  analysisId: string
  rating: FeedbackRating
  tags?: FeedbackTagId[]
  comment?: string
  email?: string
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/feedback-tags.ts
git commit -m "feat: add feedback tag constants and types"
```

---

### Task 3: 검색 엔진 — matchReasons를 프론트에 전달

**Files:**
- Modify: `src/app/api/search-products/route.ts`

현재 `_scoring`은 DB에만 저장하고 프론트 응답에서 제거하는데, 매칭 이유 칩에 필요한 정보를 추가로 전달해야 함.

- [ ] **Step 1: FormattedProduct 타입에 matchReasons 추가**

`src/app/api/search-products/route.ts` 에서 `FormattedProduct` 타입 수정:

```typescript
type MatchReason = {
  field: string  // "colorFamily" | "fit" | "fabric" | "styleNode" | "season" | "pattern"
  value: string  // "Black", "Oversized", etc.
}

type FormattedProduct = {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: MatchReason[]
  _scoring?: ScoreBreakdown
}
```

- [ ] **Step 2: searchByEnums에서 matchReasons 생성**

`scored.map()` 블록 내부, `return` 문 직전에 matchReasons를 생성하는 로직 추가:

```typescript
      // ── matchReasons 생성 ──
      const matchReasons: MatchReason[] = []
      if (colorFamilyScore > 0 && item.colorFamily) {
        matchReasons.push({ field: "colorFamily", value: item.colorFamily })
      } else if (colorAdjacentScore > 0 && row.color_family) {
        matchReasons.push({ field: "colorFamily", value: row.color_family })
      }
      if (fitScore > 0 && item.fit) {
        matchReasons.push({ field: "fit", value: item.fit })
      }
      if (fabricScore > 0 && item.fabric) {
        matchReasons.push({ field: "fabric", value: item.fabric })
      }
      if (styleNodeScore > 0) {
        const nodeId = row.style_node
        matchReasons.push({ field: "styleNode", value: nodeId })
      }
      if (seasonScore > 0 && row.season) {
        matchReasons.push({ field: "season", value: row.season })
      }
      if (patternScore > 0 && row.pattern && row.pattern !== "solid") {
        matchReasons.push({ field: "pattern", value: row.pattern })
      }
```

return 문의 객체에 `matchReasons` 필드 추가:

```typescript
      return {
        _score: totalScore,
        _rawPrice: p.price ?? 0,
        _genderPriority: genderPriority,
        _subTier: subTier,
        _scoring: scoring,
        matchReasons,
        brand: p.brand,
        // ... 나머지 동일
      }
```

- [ ] **Step 3: cleanResults에서 matchReasons는 유지, _scoring만 제거**

현재 319-323행의 cleanResults 매핑 수정:

```typescript
    const cleanResults = results.map((r) => ({
      id: r.id,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      products: r.products.map(({ _scoring, _rawPrice, ...rest }) => rest),
    }))
```

`_rawPrice`도 `_scoring`과 함께 제거하고, `matchReasons`는 `rest`에 포함되어 프론트로 전달됨.

- [ ] **Step 4: 빌드 확인**

Run: `pnpm build`
Expected: 정상 빌드 (타입 에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/search-products/route.ts
git commit -m "feat: expose matchReasons in search-products response"
```

---

### Task 4: 상품 카드 컴포넌트 — 오버레이 인터랙션

**Files:**
- Create: `src/components/result/product-card.tsx`
- Modify: `src/components/result/look-breakdown.tsx`

- [ ] **Step 1: ProductCard 컴포넌트 작성**

```typescript
"use client"

import {useState} from "react"
import {motion, AnimatePresence} from "framer-motion"
import Image from "next/image"
import {ArrowUpRight} from "lucide-react"
import {cn} from "@/lib/utils"

function UpgradedImage({ src, alt, fill, sizes, className }: {
  src: string; alt: string; fill?: boolean; sizes?: string; className?: string
}) {
  const [imgSrc, setImgSrc] = useState(() => src.replace("/small/", "/big/"))

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      onError={() => { if (imgSrc !== src) setImgSrc(src) }}
    />
  )
}

export interface MatchReason {
  field: string
  value: string
}

export interface ProductCardProps {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title?: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: MatchReason[]
  index: number
}

export function ProductCard({
  brand, price, platform, imageUrl, link, title,
  description, reviewCount, matchReasons, index,
}: ProductCardProps) {
  const [showOverlay, setShowOverlay] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group/card bg-surface-dim border border-border rounded-lg overflow-hidden transition-all duration-200 hover:border-outline/50 hover:-translate-y-0.5 shrink-0 cursor-pointer"
      style={{ width: "calc(33.333% - 8px)", minWidth: "140px" }}
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
      onClick={() => setShowOverlay((prev) => !prev)}
    >
      {/* Image: 3:4 aspect, no crop */}
      <div className="relative w-full aspect-[3/4] bg-border/30">
        {imageUrl ? (
          <UpgradedImage
            src={imageUrl}
            alt={title || `${brand} product`}
            fill
            sizes="200px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-border/30" />
        )}

        {/* Overlay */}
        <AnimatePresence>
          {showOverlay && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col justify-end"
              style={{
                background: "linear-gradient(transparent 0%, rgba(9,9,11,0.85) 25%, rgba(9,9,11,0.95) 100%)",
              }}
            >
              <div className="p-3 space-y-2">
                {/* Match reasons */}
                {matchReasons && matchReasons.length > 0 && (
                  <div>
                    <p className="text-[7px] font-mono font-bold text-turquoise tracking-[0.12em] uppercase mb-1.5">
                      Why this pick
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {matchReasons.map((r) => (
                        <span
                          key={`${r.field}-${r.value}`}
                          className="px-1.5 py-0.5 bg-turquoise/12 border border-turquoise/25 rounded-md text-[8px] font-mono font-semibold text-turquoise whitespace-nowrap"
                        >
                          {r.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description snippet */}
                {description && (
                  <p className="text-[8px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {description}
                  </p>
                )}

                {/* View CTA */}
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1 py-1.5 bg-primary text-background rounded-md text-[9px] font-mono font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
                >
                  View <ArrowUpRight className="size-3" />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom info — always visible */}
      <div className="p-2.5 space-y-1">
        <div className="flex justify-between items-start">
          <span className="text-[9px] font-mono font-bold uppercase text-muted-foreground truncate max-w-[55%]">
            {brand}
          </span>
          <span className="text-[11px] font-bold text-primary">{price}</span>
        </div>
        {title && (
          <p className="text-[10px] text-outline truncate">{title}</p>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-on-surface-variant">
            {platform}
          </span>
          {!!reviewCount && reviewCount > 0 && (
            <>
              <span className="text-[8px] text-on-surface-variant">·</span>
              <span className="text-[8px] font-mono text-muted-foreground">
                리뷰 {reviewCount}건
              </span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: LookBreakdown에서 기존 카드를 ProductCard로 교체**

`src/components/result/look-breakdown.tsx` 수정:

상단 import에 추가:
```typescript
import {ProductCard} from "@/components/result/product-card"
```

Product interface에 matchReasons 추가:
```typescript
export interface Product {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title?: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: { field: string; value: string }[]
}
```

기존 422-488행의 `{item.products.slice(0, 5).map((product, pi) => (` 블록을 교체:

```typescript
                        {hasProducts ? (
                          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent -mx-1 px-1 pb-2">
                            <div className="flex gap-3" style={{ minWidth: "min-content" }}>
                              {item.products.slice(0, 5).map((product, pi) => (
                                <ProductCard
                                  key={`${product.brand}-${pi}`}
                                  brand={product.brand}
                                  price={product.price}
                                  platform={product.platform}
                                  imageUrl={product.imageUrl}
                                  link={product.link}
                                  title={product.title}
                                  description={product.description}
                                  reviewCount={product.reviewCount}
                                  matchReasons={product.matchReasons}
                                  index={pi}
                                />
                              ))}
                            </div>
                          </div>
```

- [ ] **Step 3: disabled refine capsules 제거**

`src/components/result/look-breakdown.tsx`에서 407-419행 (Item refine capsules 블록) 전체 삭제:

```typescript
                        {/* Item refine capsules */}
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="size-3 text-muted-foreground shrink-0" />
                          {["cheaper", "different color", "slimmer fit", "shorter"].map((label) => (
                            ...
                          ))}
                        </div>
```

상단의 `Sparkles` import도 불필요하면 제거.

- [ ] **Step 4: 상단 disabled Refine Rail 제거**

`src/components/result/look-breakdown.tsx`에서 163-180행 (Refine Rail 블록) 전체 삭제:

```typescript
      {/* Refine Rail — AI-suggested refinement capsules */}
      <motion.div
        ...
      </motion.div>
```

- [ ] **Step 5: 하단 Actions (Try Another / Save This Look) 제거**

`src/components/result/look-breakdown.tsx`에서 546-562행 (Actions 블록) 전체 삭제:

```typescript
      {/* Actions */}
      <motion.section
        ...
      </motion.section>
```

`LookBreakdownProps`에서 `onTryAnother` prop도 제거.

- [ ] **Step 6: 빌드 확인**

Run: `pnpm build`
Expected: 타입 에러 발생할 수 있음 — `page.tsx`에서 `onTryAnother` prop 전달 부분은 Task 7에서 함께 수정.

- [ ] **Step 7: 커밋**

```bash
git add src/components/result/product-card.tsx src/components/result/look-breakdown.tsx
git commit -m "feat: overlay product card with match reasons, remove disabled UI"
```

---

### Task 5: 빈 결과 컴포넌트

**Files:**
- Create: `src/components/result/empty-results.tsx`
- Modify: `src/components/result/look-breakdown.tsx`

- [ ] **Step 1: EmptyResults 컴포넌트 작성**

```typescript
"use client"

import {motion} from "framer-motion"

const SUGGESTION_CHIPS = [
  "비슷한 스타일 다른 색",
  "가격대 넓혀서",
]

interface EmptyResultsProps {
  onSuggestionClick?: (text: string) => void
}

export function EmptyResults({ onSuggestionClick }: EmptyResultsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-6 text-center"
    >
      <div className="w-10 h-10 mx-auto mb-3 bg-card border border-border rounded-full flex items-center justify-center">
        <span className="text-base text-on-surface-variant">∅</span>
      </div>
      <p className="text-xs font-semibold text-foreground mb-1">No exact matches yet</p>
      <p className="text-[10px] text-muted-foreground mb-4 leading-relaxed">
        We couldn&apos;t find products matching this item.<br />
        Try refining your search below.
      </p>
      {onSuggestionClick && (
        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => onSuggestionClick(chip)}
              className="px-3 py-1.5 bg-card border border-border rounded-full text-[10px] font-mono text-muted-foreground hover:border-outline/50 hover:text-foreground transition-colors"
            >
              &ldquo;{chip}&rdquo;
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 2: LookBreakdown에서 빈 결과 UI 교체**

`src/components/result/look-breakdown.tsx`의 기존 empty state (528-534행):

```typescript
                          /* No products found */
                          <div className="py-4 text-center">
                            <p className="text-xs text-on-surface-variant">
                              No matching products found in our database.
                            </p>
                          </div>
```

교체:

```typescript
                          <EmptyResults onSuggestionClick={onSuggestionClick} />
```

import 추가:
```typescript
import {EmptyResults} from "@/components/result/empty-results"
```

`LookBreakdownProps`에 추가:
```typescript
  onSuggestionClick?: (text: string) => void
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/result/empty-results.tsx src/components/result/look-breakdown.tsx
git commit -m "feat: empty results component with suggestion chips"
```

---

### Task 6: 스티키 리파인 바

**Files:**
- Create: `src/components/result/sticky-refine-bar.tsx`

- [ ] **Step 1: StickyRefineBar 컴포넌트 작성**

```typescript
"use client"

import {useCallback, useEffect, useRef, useState} from "react"
import {motion} from "framer-motion"
import {ArrowUp, Paperclip, RotateCcw, X} from "lucide-react"
import {cn} from "@/lib/utils"

const REFINE_PLACEHOLDERS = [
  "좀 더 캐주얼한 느낌으로...",
  "가격대 낮춰서 다시...",
  "다른 색상으로 보여줘...",
  "사이즈 좀 더 오버핏으로...",
  "봄에 어울리는 느낌으로...",
]

const MAX_REFINES = 5

interface StickyRefineBarProps {
  currentSequence: number
  onSubmit: (data: { prompt: string; file?: File }) => void
  onReset: () => void
  disabled?: boolean
  initialText?: string
}

export function StickyRefineBar({
  currentSequence,
  onSubmit,
  onReset,
  disabled,
  initialText,
}: StickyRefineBarProps) {
  const [text, setText] = useState(initialText || "")
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isMaxed = currentSequence >= MAX_REFINES

  useEffect(() => {
    if (initialText) {
      setText(initialText)
      inputRef.current?.focus()
    }
  }, [initialText])

  useEffect(() => {
    if (text) return
    const timer = setInterval(() => setPlaceholderIdx((i) => (i + 1) % REFINE_PLACEHOLDERS.length), 3000)
    return () => clearInterval(timer)
  }, [text])

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return
    if (f.size > 10 * 1024 * 1024) return
    setFile(f)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }, [])

  const removeFile = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [previewUrl])

  const handleSubmit = useCallback(() => {
    if (!text.trim() || disabled || isMaxed) return
    onSubmit({ prompt: text.trim(), file: file ?? undefined })
    setText("")
    removeFile()
  }, [text, disabled, isMaxed, onSubmit, file, removeFile])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="sticky bottom-0 z-30 pt-8"
      style={{ background: "linear-gradient(transparent, hsl(var(--background)) 30%)" }}
    >
      {/* File preview */}
      {previewUrl && (
        <div className="flex justify-center mb-2">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Attached" className="h-10 w-10 rounded-lg object-cover border border-border" />
            <button
              onClick={removeFile}
              className="absolute -top-1 -right-1 w-4 h-4 bg-foreground text-background rounded-full flex items-center justify-center"
            >
              <X className="size-2" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4">
        <div className={cn(
          "bg-card border border-border rounded-xl flex items-center gap-2 px-4 py-1.5",
          isMaxed && "opacity-60"
        )}>
          {/* Session counter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isMaxed ? "bg-muted-foreground" : "bg-turquoise"
            )} />
            <span className={cn(
              "text-[8px] font-mono font-semibold",
              isMaxed ? "text-muted-foreground" : "text-turquoise"
            )}>
              {currentSequence}/{MAX_REFINES}
            </span>
          </div>

          <div className="w-px h-4 bg-border shrink-0" />

          {/* Input */}
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isMaxed}
            placeholder={isMaxed ? "Start a fresh analysis for new ideas" : REFINE_PLACEHOLDERS[placeholderIdx]}
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-on-surface-variant outline-none resize-none min-h-[32px] max-h-[80px] py-1"
          />

          {/* Attach image */}
          {!isMaxed && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 bg-border/50 rounded-lg flex items-center justify-center shrink-0 hover:bg-border transition-colors"
            >
              <Paperclip className="size-3.5 text-muted-foreground" />
            </button>
          )}

          {/* Submit / Reset */}
          {isMaxed ? (
            <button
              onClick={onReset}
              className="w-8 h-8 bg-primary text-background rounded-lg flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
            >
              <RotateCcw className="size-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || disabled}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                text.trim() && !disabled
                  ? "bg-primary text-background hover:opacity-80"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>
          )}
        </div>

        {/* Hint */}
        <p className="text-[9px] font-mono text-on-surface-variant text-center mt-1.5 mb-2">
          {isMaxed
            ? "Maximum refinements reached — start fresh for new ideas"
            : "Refine your look — previous context preserved"
          }
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/webp"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </motion.div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/result/sticky-refine-bar.tsx
git commit -m "feat: sticky refine bar component"
```

---

### Task 7: 피드백 플로우 컴포넌트

**Files:**
- Create: `src/components/result/feedback-flow.tsx`

- [ ] **Step 1: FeedbackFlow 컴포넌트 작성**

```typescript
"use client"

import {useCallback, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {FEEDBACK_TAGS, type FeedbackRating, type FeedbackTagId} from "@/lib/feedback-tags"

type Step = "thumbs" | "tags" | "detail" | "done"

interface FeedbackFlowProps {
  sessionId: string
  analysisId: string
}

export function FeedbackFlow({ sessionId, analysisId }: FeedbackFlowProps) {
  const [step, setStep] = useState<Step>("thumbs")
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<FeedbackTagId>>(new Set())
  const [comment, setComment] = useState("")
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleThumb = useCallback((r: FeedbackRating) => {
    setRating(r)
    if (r === "up") {
      setStep("detail")
    } else {
      setStep("tags")
    }
  }, [])

  const toggleTag = useCallback((tag: FeedbackTagId) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  const handleTagsDone = useCallback(() => {
    setStep("detail")
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!rating || submitting) return
    setSubmitting(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          analysisId,
          rating,
          tags: rating === "down" ? Array.from(selectedTags) : undefined,
          comment: comment.trim() || undefined,
          email: email.trim() || undefined,
        }),
      })
      setStep("done")
    } catch {
      // 실패해도 사용자 경험 방해하지 않음
      setStep("done")
    } finally {
      setSubmitting(false)
    }
  }, [sessionId, analysisId, rating, selectedTags, comment, email, submitting])

  if (step === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center py-4"
      >
        <div className="flex items-center gap-3 px-5 py-3 bg-card border border-turquoise/30 rounded-xl">
          <span className="text-base">✦</span>
          <div>
            <p className="text-xs font-semibold text-foreground">Thanks for shaping portal.ai</p>
            <p className="text-[9px] text-muted-foreground">Your feedback makes the next result better.</p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8 }}
      className="py-6 space-y-4"
    >
      {/* Step 1: Thumbs */}
      <div className="text-center">
        <p className="text-[11px] font-mono text-muted-foreground mb-3 tracking-wider">
          How was this analysis?
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => handleThumb("up")}
            className={cn(
              "w-14 h-14 border rounded-xl flex items-center justify-center transition-all duration-200 text-2xl",
              rating === "up"
                ? "border-turquoise bg-turquoise/10"
                : "border-border bg-card hover:border-outline/50"
            )}
          >
            👍
          </button>
          <button
            onClick={() => handleThumb("down")}
            className={cn(
              "w-14 h-14 border rounded-xl flex items-center justify-center transition-all duration-200 text-2xl",
              rating === "down"
                ? "border-turquoise bg-turquoise/10"
                : "border-border bg-card hover:border-outline/50"
            )}
          >
            👎
          </button>
        </div>
      </div>

      {/* Step 2: Tags (👎 only) */}
      <AnimatePresence>
        {step === "tags" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden text-center"
          >
            <p className="text-[11px] font-mono text-muted-foreground mb-1">What could be better?</p>
            <p className="text-[9px] text-on-surface-variant mb-3">Select all that apply</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm mx-auto">
              {FEEDBACK_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-[11px] transition-all duration-150 border",
                    selectedTags.has(tag.id)
                      ? "bg-turquoise/12 border-turquoise/40 text-turquoise"
                      : "bg-card border-border text-muted-foreground hover:border-outline/50"
                  )}
                >
                  {tag.label}{selectedTags.has(tag.id) && " ✓"}
                </button>
              ))}
            </div>
            <button
              onClick={handleTagsDone}
              className="mt-4 px-6 py-2 bg-card border border-border rounded-lg text-xs font-mono text-foreground hover:bg-surface-dim transition-colors"
            >
              Next
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 3: Detail (text + email) */}
      <AnimatePresence>
        {step === "detail" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-w-sm mx-auto space-y-3">
              {/* Motivation message */}
              <div className="px-4 py-3 bg-surface-dim rounded-lg border-l-2 border-turquoise">
                <p className="text-[11px] text-foreground leading-relaxed">
                  Your voice shapes portal.ai
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  We&apos;re building this together — every bit of feedback helps us get better.
                </p>
              </div>

              {/* Text input */}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more (optional)..."
                rows={2}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-on-surface-variant outline-none resize-none focus:border-outline-focus"
              />

              {/* Email input */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-on-surface-variant outline-none focus:border-outline-focus"
              />

              {/* Early adopter nudge */}
              <div className="flex items-start gap-2 px-3 py-2 bg-turquoise/5 border border-turquoise/12 rounded-lg">
                <span className="text-xs shrink-0 mt-0.5">✦</span>
                <p className="text-[9px] text-turquoise leading-relaxed">
                  Be among the first to know when we launch.
                  <span className="text-muted-foreground"> Early supporters get priority access & exclusive updates.</span>
                </p>
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 bg-primary text-background rounded-lg text-[11px] font-mono font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/result/feedback-flow.tsx
git commit -m "feat: feedback flow component (thumbs, tags, text, email)"
```

---

### Task 8: 피드백 API

**Files:**
- Create: `src/app/api/feedback/route.ts`

- [ ] **Step 1: 피드백 API 작성**

```typescript
import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import type {FeedbackTagId} from "@/lib/feedback-tags"

const VALID_TAGS: FeedbackTagId[] = [
  "style_mismatch", "price_high", "product_irrelevant", "few_results",
  "category_wrong", "color_off", "brand_unfamiliar", "other",
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, analysisId, rating, tags, comment, email } = body

    // Validation
    if (!sessionId || !analysisId || !rating) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (rating !== "up" && rating !== "down") {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 })
    }

    // Tag validation
    const validatedTags = Array.isArray(tags)
      ? tags.filter((t: string) => VALID_TAGS.includes(t as FeedbackTagId))
      : []

    // Email basic validation
    const validEmail = typeof email === "string" && email.includes("@") ? email.trim() : null

    // Comment sanitization
    const validComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : null

    const { data, error } = await supabase
      .from("user_feedbacks")
      .insert({
        session_id: sessionId,
        analysis_id: analysisId,
        rating,
        tags: validatedTags,
        comment: validComment,
        email: validEmail,
      })
      .select("id")
      .single()

    if (error) {
      logger.error({ error }, "❌ 피드백 저장 실패")
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 })
    }

    // 👎 피드백 시 해당 분석 자동 pin (eval 큐 우선 검토)
    if (rating === "down") {
      supabase
        .from("analyses")
        .update({ is_pinned: true })
        .eq("id", analysisId)
        .then(({ error: pinErr }) => {
          if (pinErr) logger.error({ error: pinErr }, "❌ 자동 pin 실패")
        })
    }

    logger.info(`✅ 피드백 저장 — ${rating} | 태그: ${validatedTags.join(",")} | 이메일: ${validEmail ? "있음" : "없음"}`)

    return NextResponse.json({ success: true, feedbackId: data.id })
  } catch (error) {
    logger.error({ error }, "💥 피드백 API 예외")
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/feedback/route.ts
git commit -m "feat: feedback API endpoint with auto-pin on thumbs down"
```

---

### Task 9: Analyze API — 세션 지원 + 리파인 컨텍스트

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: 세션 생성/연결 로직 추가**

FormData 파싱 직후 (51행 근처), 기존 변수 선언 후에 세션 관련 필드를 추출:

```typescript
    const sessionId = formData.get("sessionId") as string | null
    const parentAnalysisId = formData.get("parentAnalysisId") as string | null
    const refinementPrompt = formData.get("refinementPrompt") as string | null
    const previousContextRaw = formData.get("previousContext") as string | null
    const previousContext = previousContextRaw ? JSON.parse(previousContextRaw) : null
```

- [ ] **Step 2: 프롬프트 전용 분기에 리파인 컨텍스트 삽입**

프롬프트 전용 분기 (64행 `if (!imageFile && prompt)`) 내부, GPT 호출 직전에:

```typescript
      // 리파인 컨텍스트 삽입
      const refinementContext = previousContext ? `
---
PREVIOUS ANALYSIS CONTEXT:
The user previously analyzed a look and got these results:
- Items: ${previousContext.items?.map((i: { category: string; name: string; color: string; fit: string }) => `${i.category}: ${i.name} (${i.color}, ${i.fit})`).join(", ")}
- Style: ${previousContext.styleNode || "unknown"}
- Mood: ${previousContext.moodTags?.join(", ") || "unknown"}

The user is now refining with: "${refinementPrompt || prompt}"
Adjust the analysis based on this feedback. Keep unchanged elements stable, modify only what the user's refinement implies.
---` : ""

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: PROMPT_SEARCH_SYSTEM + refinementContext },
          { role: "user", content: PROMPT_SEARCH_USER(prompt, effectiveGender) },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      })
```

- [ ] **Step 3: Supabase 저장에 세션 로직 추가**

프롬프트 전용 분기의 Supabase insert (122행 근처) 직전에 세션 처리:

```typescript
      // 세션 생성 또는 기존 세션 업데이트
      let activeSessionId = sessionId
      let sequenceNum = 1

      if (!activeSessionId) {
        // 새 세션 생성
        const { data: sess } = await supabase
          .from("analysis_sessions")
          .insert({
            initial_prompt: originalPrompt,
            gender: effectiveGender,
          })
          .select("id")
          .single()
        activeSessionId = sess?.id ?? null
      } else {
        // 기존 세션의 analysis_count 증가
        const { data: sess } = await supabase
          .from("analysis_sessions")
          .select("analysis_count")
          .eq("id", activeSessionId)
          .single()
        sequenceNum = (sess?.analysis_count ?? 0) + 1
        await supabase
          .from("analysis_sessions")
          .update({ analysis_count: sequenceNum })
          .eq("id", activeSessionId)
      }
```

Supabase analyses insert에 새 컬럼 추가:

```typescript
      const { data: logRow, error: logError } = await supabase
        .from("analyses")
        .insert({
          // ... 기존 필드 유지 ...
          session_id: activeSessionId,
          parent_analysis_id: parentAnalysisId,
          refinement_prompt: refinementPrompt,
          sequence_number: sequenceNum,
        })
        .select("id")
        .single()
```

세션의 last_analysis_id 업데이트 (logRow 성공 후):

```typescript
      if (activeSessionId && logRow?.id) {
        supabase.from("analysis_sessions")
          .update({ last_analysis_id: logRow.id })
          .eq("id", activeSessionId)
          .then()
      }
```

응답에 세션 정보 추가:

```typescript
      return NextResponse.json({
        ...analysis,
        detectedGender: effectiveGender,
        _logId: logRow?.id ?? null,
        _sessionId: activeSessionId,
        _sequenceNumber: sequenceNum,
        _promptOnly: true,
      })
```

- [ ] **Step 4: 이미지 분석 분기에도 동일한 세션 로직 추가**

이미지 분석 분기 (152행~)에도 Step 2-3과 동일한 패턴을 적용:
- GPT 시스템 프롬프트에 refinementContext 삽입
- Supabase 저장 시 session_id, parent_analysis_id, refinement_prompt, sequence_number 포함
- 응답에 _sessionId, _sequenceNumber 포함

`initial_image_url`도 세션 생성 시 포함:

```typescript
        const { data: sess } = await supabase
          .from("analysis_sessions")
          .insert({
            initial_prompt: prompt,
            initial_image_url: imageUrl,  // R2 업로드 완료 후
            gender: effectiveGender,
          })
          .select("id")
          .single()
```

단, imageUrl은 R2 업로드가 완료된 후여야 하므로, 세션 생성은 `const imageUrl = await imageUploadPromise` 이후로 배치.

- [ ] **Step 5: 빌드 확인**

Run: `pnpm build`
Expected: 정상 빌드

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: session chain + refinement context in analyze API"
```

---

### Task 10: page.tsx — 세션 state + 리파인 + 피드백/스티키바 통합

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 세션 관련 state 추가**

기존 state 선언 후에 추가:

```typescript
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null)
  const [currentSequence, setCurrentSequence] = useState(1)
  const [suggestionText, setSuggestionText] = useState<string>("")
```

- [ ] **Step 2: handleSubmit에 세션 파라미터 전달**

`handleSubmit` 내부에서 FormData 구성 시 (140행 근처), 세션 관련 필드 추가:

```typescript
      if (sessionId) formData.append("sessionId", sessionId)
      if (currentAnalysisId) formData.append("parentAnalysisId", currentAnalysisId)
      if (sessionId && data.prompt) formData.append("refinementPrompt", data.prompt)
```

previousContext 전달 (리파인 시):

```typescript
      if (sessionId && items.length > 0) {
        formData.append("previousContext", JSON.stringify({
          items: items.map((i) => ({
            category: i.category,
            name: i.name,
            color: i.color || "",
            fit: i.fit || "",
          })),
          styleNode: moodMeta?.style?.aesthetic || "",
          moodTags: moodTags.map((t) => t.label),
        }))
      }
```

- [ ] **Step 3: 응답에서 세션 정보 추출**

analyzeRes.json() 후에:

```typescript
      const analysis: AnalysisResult & {
        _logId?: string; _promptOnly?: boolean; detectedGender?: string;
        _sessionId?: string; _sequenceNumber?: number;
      } = await analyzeRes.json()

      setSessionId(analysis._sessionId ?? null)
      setCurrentAnalysisId(analysis._logId ?? null)
      setCurrentSequence(analysis._sequenceNumber ?? 1)
```

- [ ] **Step 4: handleRefine 핸들러 추가**

```typescript
  const handleRefine = useCallback((data: { prompt: string; file?: File }) => {
    handleSubmit({ prompt: data.prompt, file: data.file })
  }, [handleSubmit])

  const handleSuggestionClick = useCallback((text: string) => {
    setSuggestionText(text)
  }, [])
```

- [ ] **Step 5: handleTryAnother에 세션 리셋 추가**

기존 handleTryAnother에 추가:

```typescript
    setSessionId(null)
    setCurrentAnalysisId(null)
    setCurrentSequence(1)
    setSuggestionText("")
```

- [ ] **Step 6: result 화면에 컴포넌트 배치**

LookBreakdown에서 `onTryAnother` 제거하고, 새 props 전달:

```typescript
              <LookBreakdown
                imageUrl={imageUrl}
                moodTags={moodTags}
                palette={palette}
                items={items}
                moodMeta={moodMeta}
                onSuggestionClick={handleSuggestionClick}
              />
              {sessionId && currentAnalysisId && (
                <FeedbackFlow
                  sessionId={sessionId}
                  analysisId={currentAnalysisId}
                />
              )}
              <StickyRefineBar
                currentSequence={currentSequence}
                onSubmit={handleRefine}
                onReset={handleTryAnother}
                initialText={suggestionText}
              />
```

import 추가:

```typescript
import {FeedbackFlow} from "@/components/result/feedback-flow"
import {StickyRefineBar} from "@/components/result/sticky-refine-bar"
```

- [ ] **Step 7: 빌드 확인**

Run: `pnpm build`
Expected: 정상 빌드

- [ ] **Step 8: 커밋**

```bash
git add src/app/page.tsx
git commit -m "feat: session state management + refine + feedback integration"
```

---

### Task 11: 어드민 User Voice API

**Files:**
- Create: `src/app/api/admin/user-voice/route.ts`

- [ ] **Step 1: User Voice API 작성**

```typescript
import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filter = searchParams.get("filter") || "all"
  const page = parseInt(searchParams.get("page") || "1", 10)
  const pageSize = 20
  const offset = (page - 1) * pageSize

  // Metrics
  const [
    { count: totalCount },
    { count: upCount },
    { count: downCount },
    { count: emailCount },
    { count: weekCount },
    { data: refineData },
  ] = await Promise.all([
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }).eq("rating", "up"),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }).eq("rating", "down"),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true }).not("email", "is", null),
    supabase.from("user_feedbacks").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from("analysis_sessions").select("analysis_count").gt("analysis_count", 1),
  ])

  const total = totalCount ?? 0
  const up = upCount ?? 0
  const down = downCount ?? 0
  const positiveRate = total > 0 ? Math.round((up / total) * 100) : 0
  const refineSessions = refineData?.length ?? 0
  const avgTurns = refineData && refineData.length > 0
    ? +(refineData.reduce((s, r) => s + r.analysis_count, 0) / refineData.length).toFixed(1)
    : 0

  // Tag distribution (from down feedbacks only)
  const { data: downFeedbacks } = await supabase
    .from("user_feedbacks")
    .select("tags")
    .eq("rating", "down")

  const tagCounts: Record<string, number> = {}
  let totalTags = 0
  for (const fb of downFeedbacks ?? []) {
    for (const tag of (fb.tags as string[]) ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
      totalTags++
    }
  }

  const tagDistribution = Object.entries(tagCounts)
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: totalTags > 0 ? Math.round((count / totalTags) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Feedback list with session journey
  let query = supabase
    .from("user_feedbacks")
    .select(`
      id, rating, tags, comment, email, created_at,
      analysis_sessions!inner (id, analysis_count),
      analyses!inner (id, prompt_text, refinement_prompt, sequence_number)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (filter === "up") query = query.eq("rating", "up")
  else if (filter === "down") query = query.eq("rating", "down")
  else if (filter === "text") query = query.not("comment", "is", null)
  else if (filter === "email") query = query.not("email", "is", null)

  const { data: feedbacks, count: filteredCount } = await query.select("*", { count: "exact" })

  // Enrich with session journey
  const enrichedFeedbacks = await Promise.all(
    (feedbacks ?? []).map(async (fb) => {
      const sessionObj = Array.isArray(fb.analysis_sessions) ? fb.analysis_sessions[0] : fb.analysis_sessions
      const sessionFbId = (sessionObj as { id: string })?.id

      let journey: { sequence: number; prompt: string }[] = []
      if (sessionFbId) {
        const { data: sessionAnalyses } = await supabase
          .from("analyses")
          .select("sequence_number, prompt_text, refinement_prompt")
          .eq("session_id", sessionFbId)
          .order("sequence_number", { ascending: true })

        journey = (sessionAnalyses ?? []).map((a) => ({
          sequence: a.sequence_number ?? 1,
          prompt: a.refinement_prompt || a.prompt_text || "",
        }))
      }

      // Mask email
      const maskedEmail = fb.email
        ? fb.email.replace(/^(.{1,3}).*(@.*)$/, (_, p1, p2) => p1 + "***" + p2)
        : null

      return {
        id: fb.id,
        rating: fb.rating,
        tags: fb.tags ?? [],
        comment: fb.comment,
        email: maskedEmail,
        createdAt: fb.created_at,
        session: {
          id: sessionFbId,
          analysisCount: (sessionObj as { analysis_count: number })?.analysis_count ?? 1,
          journey,
        },
      }
    })
  )

  const totalPages = Math.ceil((filteredCount ?? total) / pageSize)

  return NextResponse.json({
    metrics: {
      totalFeedbacks: total,
      positiveRate,
      refineSessions,
      avgTurns,
      emailCount: emailCount ?? 0,
      emailConversion: total > 0 ? +((emailCount ?? 0) / total * 100).toFixed(1) : 0,
      weeklyDelta: weekCount ?? 0,
    },
    tagDistribution,
    feedbacks: enrichedFeedbacks,
    pagination: { page, totalPages, totalCount: filteredCount ?? total },
  })
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/admin/user-voice/route.ts
git commit -m "feat: admin user-voice API with metrics, tags, journey"
```

---

### Task 12: 어드민 사이드바에 User Voice 탭 추가

**Files:**
- Modify: `src/components/admin/sidebar.tsx`

- [ ] **Step 1: NAV_ITEMS에 User Voice 추가**

```typescript
import {BarChart3, Database, FlaskConical, MessageCircle, ShoppingBag} from "lucide-react"
```

NAV_ITEMS 배열 맨 끝에 추가:

```typescript
  {
    href: "/admin/user-voice",
    label: "유저 보이스",
    description: "피드백 & 리파인 여정",
    icon: MessageCircle,
  },
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/admin/sidebar.tsx
git commit -m "feat: add User Voice tab to admin sidebar"
```

---

### Task 13: 어드민 User Voice 대시보드

**Files:**
- Create: `src/components/admin/user-voice-dashboard.tsx`
- Create: `src/app/admin/user-voice/page.tsx`

- [ ] **Step 1: UserVoiceDashboard 컴포넌트 작성**

```typescript
"use client"

import {useCallback, useEffect, useState} from "react"
import {cn} from "@/lib/utils"
import {ChevronDown, ChevronLeft, ChevronRight, Loader2} from "lucide-react"

type Filter = "all" | "up" | "down" | "text" | "email"

interface Metrics {
  totalFeedbacks: number
  positiveRate: number
  refineSessions: number
  avgTurns: number
  emailCount: number
  emailConversion: number
  weeklyDelta: number
}

interface TagDist {
  tag: string
  count: number
  percentage: number
}

interface Feedback {
  id: string
  rating: "up" | "down"
  tags: string[]
  comment: string | null
  email: string | null
  createdAt: string
  session: {
    id: string
    analysisCount: number
    journey: { sequence: number; prompt: string }[]
  }
}

const TAG_LABELS: Record<string, string> = {
  style_mismatch: "스타일이 달라요",
  price_high: "가격대가 높아요",
  product_irrelevant: "상품이 안 맞아요",
  few_results: "결과가 너무 적어요",
  category_wrong: "카테고리가 틀려요",
  color_off: "색감이 달라요",
  brand_unfamiliar: "브랜드가 낯설어요",
  other: "기타",
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "up", label: "👍" },
  { key: "down", label: "👎" },
  { key: "text", label: "💬 텍스트" },
  { key: "email", label: "📧 이메일" },
]

export function UserVoiceDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [tagDist, setTagDist] = useState<TagDist[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/user-voice?filter=${filter}&page=${page}`)
      if (!res.ok) return
      const data = await res.json()
      setMetrics(data.metrics)
      setTagDist(data.tagDistribution)
      setFeedbacks(data.feedbacks)
      setTotalPages(data.pagination.totalPages)
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => { fetchData() }, [fetchData])

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="총 피드백" value={metrics.totalFeedbacks} sub={`+${metrics.weeklyDelta} this week`} subColor="text-turquoise" />
          <MetricCard label="긍정률" value={`${metrics.positiveRate}%`} bar={metrics.positiveRate} />
          <MetricCard label="리파인 세션" value={metrics.refineSessions} sub={`avg ${metrics.avgTurns} turns`} />
          <MetricCard label="이메일 수집" value={metrics.emailCount} sub={`${metrics.emailConversion}% conversion`} subColor="text-turquoise" />
        </div>
      )}

      {/* Tag distribution */}
      {tagDist.length > 0 && (
        <div className="p-4 bg-card border border-border rounded-lg">
          <h3 className="text-xs font-semibold text-foreground mb-3">부정 피드백 태그 분포</h3>
          <div className="space-y-2">
            {tagDist.slice(0, 5).map((t) => (
              <div key={t.tag} className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground w-28 shrink-0 font-mono truncate">
                  {TAG_LABELS[t.tag] || t.tag}
                </span>
                <div className="flex-1 h-5 bg-surface-dim rounded overflow-hidden relative">
                  <div
                    className="h-full bg-turquoise/30 rounded"
                    style={{ width: `${t.percentage}%` }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">
                    {t.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-foreground">최근 피드백</h3>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setPage(1) }}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[9px] font-mono transition-colors",
                  filter === f.key
                    ? "bg-primary text-background"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {feedbacks.map((fb) => (
              <div key={fb.id} className="border border-border rounded-lg overflow-hidden">
                <div className="p-3 flex gap-3 items-start">
                  <span className="text-lg shrink-0 mt-0.5">{fb.rating === "up" ? "👍" : "👎"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex gap-1 flex-wrap">
                        {fb.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-red-400/10 border border-red-400/20 rounded-md text-[9px] text-red-400 font-mono"
                          >
                            {TAG_LABELS[tag] || tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-[9px] text-on-surface-variant font-mono shrink-0">
                        {timeAgo(fb.createdAt)}
                      </span>
                    </div>
                    {fb.comment ? (
                      <p className="text-[11px] text-foreground leading-relaxed mb-1">{fb.comment}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">텍스트 피드백 없음</p>
                    )}
                    <div className="flex items-center gap-2">
                      {fb.email && (
                        <span className="text-[9px] text-turquoise font-mono">📧 {fb.email}</span>
                      )}
                      <span className="text-[9px] text-on-surface-variant font-mono">
                        세션 {fb.session.analysisCount}턴
                      </span>
                      {fb.session.journey.length > 1 && (
                        <button
                          onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                          className="text-[9px] text-turquoise font-mono flex items-center gap-0.5 hover:underline"
                        >
                          여정 보기
                          <ChevronDown className={cn("size-3 transition-transform", expandedId === fb.id && "rotate-180")} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Session journey */}
                {expandedId === fb.id && fb.session.journey.length > 1 && (
                  <div className="px-3 pb-3 pt-1 bg-surface-dim border-t border-border">
                    <p className="text-[8px] font-mono text-turquoise uppercase tracking-widest mb-2">Session Journey</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {fb.session.journey.map((step, i) => (
                        <span key={i} className="contents">
                          <span className="px-2 py-1 bg-card border border-border rounded-md text-[8px] text-muted-foreground font-mono max-w-[160px] truncate">
                            {step.sequence}. &ldquo;{step.prompt}&rdquo;
                          </span>
                          {i < fb.session.journey.length - 1 && (
                            <span className="text-on-surface-variant text-[10px]">→</span>
                          )}
                        </span>
                      ))}
                      <span className="text-[10px]">{fb.rating === "up" ? "👍" : "👎"}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-md border border-border hover:bg-card disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs font-mono text-muted-foreground">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-md border border-border hover:bg-card disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  label, value, sub, subColor, bar,
}: {
  label: string; value: number | string; sub?: string; subColor?: string; bar?: number
}) {
  return (
    <div className="p-3.5 bg-card border border-border rounded-lg">
      <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {bar !== undefined && (
        <div className="h-1 bg-surface-dim rounded mt-1.5 overflow-hidden">
          <div className="h-full bg-turquoise rounded" style={{ width: `${bar}%` }} />
        </div>
      )}
      {sub && (
        <p className={cn("text-[9px] mt-0.5", subColor || "text-muted-foreground")}>{sub}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: User Voice 페이지 작성**

```typescript
import { UserVoiceDashboard } from "@/components/admin/user-voice-dashboard"

export default function UserVoicePage() {
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-foreground">유저 보이스</h1>
        <p className="text-sm text-muted-foreground mt-1">유저 피드백, 리파인 여정, 이메일 수집 현황</p>
      </div>
      <UserVoiceDashboard />
    </div>
  )
}
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm build`
Expected: 정상 빌드

- [ ] **Step 4: 커밋**

```bash
git add src/components/admin/user-voice-dashboard.tsx src/app/admin/user-voice/page.tsx
git commit -m "feat: admin User Voice dashboard page"
```

---

### Task 14: 전체 통합 빌드 + lint 확인

- [ ] **Step 1: 전체 빌드**

Run: `pnpm build`
Expected: 정상 빌드, 타입 에러 없음

- [ ] **Step 2: lint**

Run: `pnpm lint`
Expected: 에러 없음 (경고는 OK)

- [ ] **Step 3: 개발 서버 실행 확인**

Run: `pnpm dev`
Expected: localhost:3400에서 정상 동작
- 업로드 → 분석 → 결과 화면에 오버레이 카드 + 스티키 바 + 피드백 표시
- 리파인 입력 → 새 분석 → 결과 교체 확인
- 피드백 전송 → DB 저장 확인
- /admin/user-voice 페이지 접근 확인

- [ ] **Step 4: 최종 커밋 (빌드 수정 사항이 있다면)**

```bash
git add -u
git commit -m "fix: build and integration fixes"
```
