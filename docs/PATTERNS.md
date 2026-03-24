# 코드 패턴 가이드

## shadcn/ui 컴포넌트 추가

```bash
pnpm dlx shadcn@latest add button card dialog input
```

## cn() 유틸리티

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## 컴포넌트 패턴

```tsx
// named export, "use client" 는 인터랙션 필요 시만
"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

export function MyComponent({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn("rounded-lg p-4", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* content */}
    </motion.div>
  )
}
```

## API Route — 이미지 분석 (GPT-4o-mini Vision)

```typescript
// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const imageFile = formData.get("image") as File

  // File → base64
  const bytes = await imageFile.arrayBuffer()
  const base64 = Buffer.from(bytes).toString("base64")
  const mimeType = imageFile.type || "image/jpeg"

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this outfit photo." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  })

  // JSON 파싱 (markdown fence 제거)
  const content = response.choices[0]?.message?.content ?? ""
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
  const analysis = JSON.parse(cleaned)

  return NextResponse.json(analysis)
}
```

## API Route — 상품 검색 (SerpApi Google Shopping)

```typescript
// src/app/api/search-products/route.ts
// POST body: { gender: "male"|"female"|"unisex", queries: [{id, category, searchQuery}] }

// 성별 키워드 보강
let query = item.searchQuery
const genderLabel = gender === "female" ? "women" : gender === "male" ? "men" : ""
if (genderLabel && !query.toLowerCase().includes(genderLabel)) {
  query = `${query} ${genderLabel}`
}

// SerpApi 호출
const params = new URLSearchParams({
  engine: "google_shopping",
  q: query,
  api_key: SERPAPI_KEY,
  num: "10",
  hl: "en",
})
const res = await fetch(`https://serpapi.com/search.json?${params}`)

// 스코어링: 평점 + 리뷰 + 이미지 유무 + 관련성 → 상위 4개
```

## framer-motion 애니메이션 패턴

```tsx
// 페이지 트랜지션 (AnimatePresence)
<AnimatePresence mode="wait">
  {state === "upload" && <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }} />}
  {state === "analyzing" && <motion.div key="analyzing" ... />}
  {state === "result" && <motion.div key="result" ... />}
</AnimatePresence>

// stagger children
<motion.div
  variants={{ show: { transition: { staggerChildren: 0.1 } } }}
  initial="hidden"
  animate="show"
>
```

## 이미지 업로드 패턴

```tsx
// drag & drop + click upload (src/components/upload/upload-zone.tsx)
const onDrop = (e: React.DragEvent) => {
  e.preventDefault()
  const file = e.dataTransfer.files[0]
  if (file?.type.startsWith("image/")) handleFile(file)
}

const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (file) handleFile(file)
}
```

## 3-Screen 상태 관리 패턴

```typescript
// src/app/page.tsx
type AppState = "upload" | "analyzing" | "result"

// Flow:
// 1. upload → 파일 선택 → setState("analyzing")
// 2. analyzing → /api/analyze 호출 → 결과 받으면 setState("result")
// 3. result → /api/search-products 백그라운드 호출 → 상품 카드 업데이트
// 4. "Try Another" → setState("upload")
```

## 디자인 시스템 컬러 (MOODFIT)

```
--color-moodfit-primary:           #6e3bd8  (바이올렛)
--color-moodfit-primary-dim:       #622bcb
--color-moodfit-primary-container: #cbb6ff  (라벤더)
--color-moodfit-secondary-container: #ffdcbd (피치)
--color-moodfit-tertiary:          #a53173  (핑크)
--color-moodfit-surface:           #f8f9fb
--color-moodfit-on-surface:        #2e3336
--color-moodfit-on-surface-variant: #5a6063
```
