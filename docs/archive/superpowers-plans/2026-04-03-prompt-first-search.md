# Prompt-First Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 화면을 "이미지 필수" → "프롬프트 필수 + 이미지 선택" 채팅 입력 바 UX로 전환 (Phase 1)

**Architecture:** 기존 UploadZone을 SearchBar로 교체. `/api/analyze`에 프롬프트 전용 분기 추가 (Vision 안 쓰고 텍스트 모드). page.tsx 상태 머신은 그대로 3-screen 유지하되 handleSubmit이 프롬프트/이미지/둘 다를 처리.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 4, framer-motion, OpenAI GPT-4o-mini

---

## File Structure

| 파일 | 역할 | 작업 |
|------|------|------|
| `src/components/search/search-bar.tsx` | 채팅 입력 바 (textarea + 이미지 첨부 + 성별 + 전송) | **신규** |
| `src/lib/prompts/prompt-search.ts` | 프롬프트 전용 시스템 프롬프트 | **신규** |
| `src/app/api/analyze/route.ts` | prompt 파라미터 분기 (텍스트 모드 / Vision+프롬프트 / 기존 Vision) | **수정** |
| `src/app/page.tsx` | SearchBar 연동, handleSubmit 리팩터 | **수정** |
| `src/components/result/look-breakdown.tsx` | 프롬프트 전용 결과 (이미지 없을 때 심플 그리드) | **수정** |

## NOT in scope

- Phase 2 (프롬프트 키워드 하이라이트, 프롬프트 전용 결과 뷰 고도화)
- Phase 3 (대화형 리파인, 검색 히스토리)
- StyleChips 삭제 (이번엔 안 건드림)
- search-products API 변경 (기존 그대로)
- DB 스키마 변경

---

### Task 1: 프롬프트 전용 시스템 프롬프트

**Files:**
- Create: `src/lib/prompts/prompt-search.ts`

- [ ] **Step 1: 프롬프트 파일 생성**

```ts
// src/lib/prompts/prompt-search.ts
/**
 * 프롬프트 전용 AI 분석 — 이미지 없이 텍스트만으로 검색 키워드 추출
 */

export const PROMPT_SEARCH_SYSTEM = `You are an expert AI fashion analyst.
The user is searching for a fashion item using text only (no image).
Extract structured search information from their prompt.

Respond in this exact JSON format (no markdown, no code fences):
{
  "intent": "specific_item",
  "items": [
    {
      "id": "item_0",
      "category": "Outer",
      "subcategory": "denim-jacket",
      "name": "Casual Denim Jacket",
      "searchQuery": "casual relaxed denim jacket men",
      "searchQueryKo": "캐주얼 릴렉스드 데님 자켓 남성",
      "fit": "relaxed",
      "fabric": "denim",
      "color": null,
      "detail": null
    }
  ],
  "styleNode": null,
  "mood": null,
  "palette": [],
  "style": null
}

Rules:
- Extract 1-3 items from the prompt. Usually 1 unless the user mentions multiple items.
- Each item.id: "item_0", "item_1", etc.
- category: one of Outer, Top, Bottom, Shoes, Bag, Dress, Accessories
- subcategory: use standard fashion subcategories (denim-jacket, t-shirt, jeans, sneakers, etc.)
- searchQuery: English search query — include fit, color, fabric, subcategory, gender. Format: "[fit] [color] [fabric] [subcategory] [men/women]"
- searchQueryKo: Korean translation using fashion industry terms. Format: "[핏] [색상] [소재] [아이템] [성별]"
- fit: one of oversized, relaxed, regular, slim, skinny, boxy, cropped, longline. Infer from context, default to "regular".
- fabric: one of cotton, wool, linen, silk, denim, leather, suede, nylon, polyester, cashmere, corduroy, fleece, tweed, jersey, knit, mesh, satin, chiffon, velvet, canvas, gore-tex, ripstop. Infer from item type if not specified.
- color: extract if mentioned, null if not
- Gender will be provided separately — use it in searchQuery/searchQueryKo.
- styleNode, mood, palette, style: always null (no image to analyze)
- Return valid JSON only`

export const PROMPT_SEARCH_USER = (prompt: string, gender: string) =>
  `User is searching for: "${prompt}"\nGender: ${gender === "male" ? "men" : "women"}`
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/prompts/prompt-search.ts
git commit -m "feat: add prompt-only search system prompt"
```

---

### Task 2: SearchBar 컴포넌트

**Files:**
- Create: `src/components/search/search-bar.tsx`

- [ ] **Step 1: SearchBar 컴포넌트 생성**

```tsx
// src/components/search/search-bar.tsx
"use client"

import { useCallback, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Camera, ArrowUp, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { type Gender, GenderSelector } from "@/components/upload/gender-selector"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const TARGET_MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.8

async function compressImage(file: File): Promise<File> {
  if (file.size < 500 * 1024) return file

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img

      if (width > TARGET_MAX_DIMENSION || height > TARGET_MAX_DIMENSION) {
        const ratio = Math.min(TARGET_MAX_DIMENSION / width, TARGET_MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      } else if (file.type === "image/jpeg") {
        resolve(file)
        return
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) { resolve(file); return }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name, { type: "image/jpeg" }))
        },
        "image/jpeg",
        JPEG_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to load image"))
    }
    img.src = objectUrl
  })
}

interface SearchBarProps {
  gender: Gender
  onGenderChange: (gender: Gender) => void
  onSubmit: (data: { prompt?: string; file?: File }) => void
  disabled?: boolean
}

export function SearchBar({ gender, onGenderChange, onSubmit, disabled }: SearchBarProps) {
  const [prompt, setPrompt] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasInput = prompt.trim().length > 0 || file !== null

  const handleFileAttach = useCallback(async (f: File) => {
    if (!f.type.startsWith("image/")) return
    if (f.size > MAX_FILE_SIZE) {
      alert("Image must be under 10MB")
      return
    }
    try {
      const compressed = await compressImage(f)
      setFile(compressed)
      setPreview(URL.createObjectURL(compressed))
    } catch {
      setFile(f)
      setPreview(URL.createObjectURL(f))
    }
  }, [])

  const removeFile = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
  }, [preview])

  const handleSubmit = useCallback(() => {
    if (!hasInput || disabled) return
    onSubmit({
      prompt: prompt.trim() || undefined,
      file: file ?? undefined,
    })
  }, [hasInput, disabled, prompt, file, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFileAttach(f)
    },
    [handleFileAttach],
  )

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full max-w-xl mx-auto"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
    >
      <div
        className={cn(
          "rounded-2xl border border-border bg-card transition-all duration-200",
          "focus-within:border-primary/30",
          isDragging && "border-primary/50 bg-surface-dim",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        {/* Image preview */}
        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pt-3"
            >
              <div className="relative inline-block">
                <img
                  src={preview}
                  alt="Attached"
                  className="h-16 w-16 rounded-lg object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={removeFile}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-primary/80 transition-colors"
                >
                  <X className="size-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="What style are you looking for?"
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none font-medium"
        />

        {/* Bottom bar: image button, gender, submit */}
        <div className="flex items-center gap-2 px-3 pb-3">
          {/* Image attach */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-dim transition-colors"
            title="Attach image"
          >
            <Camera className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileAttach(f)
              e.target.value = ""
            }}
          />

          {/* Gender selector (compact) */}
          <GenderSelector value={gender} onChange={onGenderChange} />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasInput || disabled}
            className={cn(
              "p-2 rounded-lg transition-all duration-200",
              hasInput && !disabled
                ? "bg-foreground text-background hover:bg-primary/80"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>

      {/* Hint text */}
      <p className="text-center text-xs text-on-surface-variant mt-3 font-mono">
        Attach an image for more accurate results
      </p>
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/search/search-bar.tsx
git commit -m "feat: add SearchBar component — chat-style input with image attach"
```

---

### Task 3: API 분기 — 프롬프트 전용 / 프롬프트+이미지 / 이미지 전용

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: import 추가 + prompt 파라미터 파싱**

`route.ts` 상단 import에 추가:

```ts
import { PROMPT_SEARCH_SYSTEM, PROMPT_SEARCH_USER } from "@/lib/prompts/prompt-search"
```

기존 `POST` 함수 내부에서 formData 파싱 부분을 변경한다. 기존:

```ts
    const formData = await request.formData()
    const imageFile = formData.get("image") as File | null

    if (!imageFile) {
      logger.warn("⚠️ 이미지 없음 — 요청 거부")
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }
```

변경:

```ts
    const formData = await request.formData()
    const imageFile = formData.get("image") as File | null
    const prompt = formData.get("prompt") as string | null
    const gender = (formData.get("gender") as string) || "male"

    if (!imageFile && !prompt) {
      logger.warn("⚠️ 이미지/프롬프트 모두 없음 — 요청 거부")
      return NextResponse.json({ error: "Prompt or image required" }, { status: 400 })
    }
```

- [ ] **Step 2: 프롬프트 전용 분기 추가**

이미지 validation 블록 (`if (imageFile.size > MAX_FILE_SIZE)` 등) 바로 위에 프롬프트 전용 분기를 추가한다:

```ts
    // ── 프롬프트 전용 (이미지 없음) ─────────────────────
    if (!imageFile && prompt) {
      logger.info(`💬 프롬프트 전용 검색 — "${prompt}" (${gender})`)
      const aiStart = Date.now()

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: PROMPT_SEARCH_SYSTEM },
          { role: "user", content: PROMPT_SEARCH_USER(prompt, gender) },
        ],
        max_tokens: 800,
        temperature: 0.3,
      })

      const aiDuration = Date.now() - aiStart
      const usage = response.usage
      logger.info(
        `✅ 프롬프트 AI 응답 — ${aiDuration}ms | 토큰: ${usage?.prompt_tokens ?? "?"}→${usage?.completion_tokens ?? "?"}`
      )

      const content = response.choices[0]?.message?.content
      if (!content) {
        return NextResponse.json({ error: "No response from AI" }, { status: 500 })
      }

      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      let analysis
      try {
        analysis = JSON.parse(cleaned)
      } catch {
        logger.error({ raw: cleaned.slice(0, 200) }, "❌ 프롬프트 JSON 파싱 실패")
        return NextResponse.json({ error: "AI returned invalid format" }, { status: 502 })
      }

      // Supabase 저장
      const analysisDuration = Date.now() - startTime
      const { data: logRow, error: logError } = await supabase
        .from("analyses")
        .insert({
          prompt_text: prompt,
          ai_raw_response: analysis,
          detected_gender: gender,
          items: analysis.items,
          search_queries: analysis.items?.map((item: { id: string; searchQuery: string }) => ({
            id: item.id,
            query: item.searchQuery,
          })),
          analysis_duration_ms: analysisDuration,
        })
        .select("id")
        .single()

      if (logError) logger.error({ error: logError }, "❌ 프롬프트 분석 Supabase 저장 실패")

      logger.info(`🏁 프롬프트 분석 완료 — ${analysisDuration}ms`)

      return NextResponse.json({
        ...analysis,
        _logId: logRow?.id ?? null,
        _promptOnly: true,
      })
    }
```

- [ ] **Step 3: 프롬프트+이미지 분기 — Vision 호출에 프롬프트 컨텍스트 주입**

기존 Vision API 호출 부분에서 `messages`의 user content를 변경한다. 기존:

```ts
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ANALYZE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: ANALYZE_USER_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "auto",
              },
            },
          ],
        },
      ],
      max_tokens: 2500,
      temperature: 0.3,
    })
```

변경:

```ts
    const userTextContent = prompt
      ? `User request: "${prompt}"\nFocus your analysis on items matching this request. Prioritize these in searchQuery/searchQueryKo.\n\n${ANALYZE_USER_PROMPT}`
      : ANALYZE_USER_PROMPT

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ANALYZE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userTextContent },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "auto",
              },
            },
          ],
        },
      ],
      max_tokens: 2500,
      temperature: 0.3,
    })
```

또한 Supabase insert에 `prompt_text: prompt` 필드를 추가한다 (기존 이미지 분석 저장 부분):

```ts
    const { data: logRow, error: logError } = await supabase
      .from("analyses")
      .insert({
        prompt_text: prompt,    // ← 추가
        image_filename: imageFile.name,
        // ... 나머지 기존 필드 그대로
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: analyze API — prompt-only + prompt+image branches"
```

---

### Task 4: DB 마이그레이션 — analyses.prompt_text 컬럼

**Files:**
- Create: `supabase/migrations/011_add_prompt_text.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- Add prompt_text column to analyses table
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS prompt_text text;
```

- [ ] **Step 2: Supabase에 적용**

```bash
# 로컬 개발이면 Supabase 대시보드에서 SQL 실행, 또는:
# supabase db push (만약 CLI 설정되어 있으면)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_add_prompt_text.sql
git commit -m "feat: add prompt_text column to analyses table"
```

---

### Task 5: page.tsx — SearchBar 연동 + handleSubmit 리팩터

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: import 변경**

기존 import에서 UploadZone, StyleChips 제거하고 SearchBar 추가:

```ts
// 제거:
// import { UploadZone } from "@/components/upload/upload-zone"
// import { StyleChips } from "@/components/upload/style-chips"

// 추가:
import { SearchBar } from "@/components/search/search-bar"
```

- [ ] **Step 2: 새 state 추가 + handleFileSelect를 handleSubmit으로 리팩터**

기존 `handleFileSelect` 콜백을 `handleSubmit`으로 교체한다. 새 시그니처:

```ts
  const [promptText, setPromptText] = useState<string>("")

  const handleSubmit = useCallback(async (data: { prompt?: string; file?: File }) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current

    const hasImage = !!data.file
    const hasPrompt = !!data.prompt

    // Set image URL if file exists
    let url = ""
    if (data.file) {
      url = URL.createObjectURL(data.file)
      setImageUrl(url)
    } else {
      setImageUrl("")
    }

    if (data.prompt) setPromptText(data.prompt)

    setState("analyzing")
    setError(null)
    setProgress(0)
    setProgressLabel(hasImage ? "Uploading image..." : "Analyzing prompt...")
    fileRef.current = data.file ?? null

    // Progress simulation — faster for prompt-only
    let simulated = 5
    const speed = hasImage ? 3 : 12
    const cap = hasImage ? 85 : 90
    const ticker = setInterval(() => {
      simulated += Math.random() * speed + 0.5
      if (simulated > cap) simulated = cap
      setProgress(Math.round(simulated))
    }, 400)

    try {
      if (hasImage) {
        setProgressLabel("Analyzing silhouette & texture...")
      } else {
        setProgressLabel("Extracting keywords...")
      }

      const formData = new FormData()
      if (data.file) formData.append("image", data.file)
      if (data.prompt) formData.append("prompt", data.prompt)
      formData.append("gender", gender)

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      })

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json().catch(() => ({}))
        throw new Error(errorData.error || "Analysis failed")
      }

      clearInterval(ticker)
      setProgress(100)
      setProgressLabel("Complete")

      const analysis: AnalysisResult & { _logId?: string; _promptOnly?: boolean } =
        await analyzeRes.json()
      const logId = analysis._logId

      const initialItems: LookItem[] = (analysis.items || []).map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
        detail: item.detail,
        fabric: item.fabric,
        color: item.color,
        fit: item.fit,
        position: item.position,
        products: [],
      }))

      await new Promise((r) => setTimeout(r, 300))

      setMoodTags(analysis.mood?.tags || [])
      setPalette(analysis.palette || [])
      setMoodMeta({
        summary: analysis.mood?.summary,
        vibe: analysis.mood?.vibe,
        season: analysis.mood?.season,
        occasion: analysis.mood?.occasion,
        style: analysis.style,
      })
      setItems(initialItems)
      setState("result")

      // Background: fetch products
      fetch("/api/search-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          gender,
          styleNode: analysis.styleNode,
          _logId: logId,
          queries: (analysis.items || []).map((item) => ({
            id: item.id,
            category: item.category,
            searchQuery: item.searchQuery,
            searchQueryKo: item.searchQueryKo,
          })),
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((searchData: ProductSearchResult | null) => {
          if (!searchData) return
          setItems((prev) =>
            prev.map((item) => {
              const found = searchData.results.find((r) => r.id === item.id)
              return found
                ? { ...item, products: found.products, productsLoaded: true }
                : { ...item, productsLoaded: true }
            }),
          )
        })
        .catch((err) => {
          console.error("Product search failed:", err)
          setItems((prev) => prev.map((item) => ({ ...item, productsLoaded: true })))
        })
    } catch (err) {
      clearInterval(ticker)
      if (url) URL.revokeObjectURL(url)
      console.error("Analysis error:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze. Please try again.",
      )
      setState("upload")
    }
  }, [gender])
```

- [ ] **Step 3: handleTryAnother에 promptText 리셋 추가**

```ts
  const handleTryAnother = useCallback(() => {
    abortRef.current?.abort()
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl("")
    setPromptText("")    // ← 추가
    setMoodTags([])
    setPalette([])
    setItems([])
    setMoodMeta({})
    setError(null)
    setProgress(0)
    setProgressLabel("")
    fileRef.current = null
    setState("upload")
  }, [imageUrl])
```

- [ ] **Step 4: JSX — upload 화면에서 UploadZone+StyleChips를 SearchBar로 교체**

기존 upload state JSX:

```tsx
              <GenderSelector value={gender} onChange={setGender} />
              {/* error display */}
              <UploadZone onFileSelect={handleFileSelect} />
              <StyleChips />
```

변경 (GenderSelector는 SearchBar 내부로 이동했으므로 제거):

```tsx
              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-400 text-sm font-mono bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}

              <SearchBar
                gender={gender}
                onGenderChange={setGender}
                onSubmit={handleSubmit}
              />
```

- [ ] **Step 5: 결과 화면에 promptText 표시 (프롬프트 있을 때)**

result state JSX에서 LookBreakdown 위에 프롬프트 표시:

```tsx
          {state === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full z-10 pt-4"
            >
              {promptText && (
                <div className="max-w-4xl mx-auto mb-6 px-4">
                  <p className="text-sm text-muted-foreground font-mono">
                    <span className="text-foreground">Search:</span> &quot;{promptText}&quot;
                  </p>
                </div>
              )}
              <LookBreakdown
                imageUrl={imageUrl}
                moodTags={moodTags}
                palette={palette}
                items={items}
                moodMeta={moodMeta}
                onTryAnother={handleTryAnother}
              />
            </motion.div>
          )}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace UploadZone with SearchBar — prompt-first UX"
```

---

### Task 6: LookBreakdown — 이미지 없을 때 처리

**Files:**
- Modify: `src/components/result/look-breakdown.tsx`

- [ ] **Step 1: imageUrl이 없을 때 이미지 섹션 숨기기**

LookBreakdown 내부에서 이미지/핫스팟/무드 섹션을 `imageUrl`이 존재할 때만 렌더링하도록 조건부 처리한다. 컴포넌트 내부 최상위에서:

```tsx
const hasImage = !!imageUrl
```

이미지 sticky 컬럼, 핫스팟 오버레이, 무드/팔레트 섹션을 `{hasImage && (...)}` 로 감싼다. 이미지가 없으면 아이템 아코디언 + 상품 카드만 풀 폭으로 표시한다.

구체적으로: 기존 2-column 레이아웃 (`grid grid-cols-1 lg:grid-cols-2`)에서, `hasImage`가 false면 `lg:grid-cols-1`로 변경하고 이미지 컬럼을 렌더링하지 않는다.

```tsx
<div className={cn(
  "grid grid-cols-1 gap-8",
  hasImage && "lg:grid-cols-2"
)}>
  {hasImage && (
    <div className="...">
      {/* 기존 이미지 + 핫스팟 */}
    </div>
  )}
  <div className="...">
    {/* 아이템 아코디언 + 상품 카드 — 항상 표시 */}
  </div>
</div>
```

무드/팔레트 섹션도 `hasImage` 조건으로 감싼다 (프롬프트 전용이면 mood/palette가 null이므로).

- [ ] **Step 2: Commit**

```bash
git add src/components/result/look-breakdown.tsx
git commit -m "feat: LookBreakdown — graceful prompt-only mode (no image)"
```

---

### Task 7: 통합 테스트 + 정리

- [ ] **Step 1: dev 서버 실행 후 수동 테스트**

```bash
pnpm dev
```

시나리오 4가지 확인:
1. **프롬프트만**: "캐주얼한 데님 자켓" 입력 → 빠른 응답 (~2초) → 상품 그리드
2. **프롬프트+이미지**: 텍스트 + 이미지 첨부 → Vision 분석 → 기존 결과 뷰
3. **이미지만**: 이미지만 첨부 → 기존 플로우 그대로
4. **빈 입력**: 전송 버튼 disabled 확인

- [ ] **Step 2: lint 확인**

```bash
pnpm lint
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm build
```

- [ ] **Step 4: 최종 Commit (lint/build fix가 있었다면)**

```bash
git add -p  # 변경된 파일만
git commit -m "fix: lint and build fixes for prompt-first search"
```
