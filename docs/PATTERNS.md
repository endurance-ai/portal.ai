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

## API Route 패턴 (App Router)

```typescript
// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const image = formData.get("image") as File

  // GPT-4o-mini Vision 호출
  // ...

  return NextResponse.json({ mood: [], palette: [] })
}
```

## framer-motion 애니메이션 패턴

```tsx
// 페이지 트랜지션
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: "easeOut" }}
>

// stagger children
<motion.div
  variants={{
    show: { transition: { staggerChildren: 0.1 } }
  }}
  initial="hidden"
  animate="show"
>
```

## 이미지 업로드 패턴

```tsx
// drag & drop + click upload
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
