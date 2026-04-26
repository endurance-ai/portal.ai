# 코드 패턴 가이드

> 최종 업데이트: 2026-04-26 — 코드베이스 실측 기반.
> 변경 시 같이 업데이트할 것: 본 문서, `CLAUDE.md`, `docs/ARCHITECTURE.md`.

---

## 컴포넌트

### shadcn/ui 추가

```bash
pnpm dlx shadcn@latest add button card dialog input
```

- 등록은 `components.json`. `pnpm dlx shadcn` CLI가 알아서 `src/components/ui/` 에 복사한다.
- 복사 기반이라 자유 수정 OK — B&W Minimal 토큰에 맞춰 색·테두리 조정해도 무방.

### `cn()` 유틸리티

```ts
// src/lib/utils.ts
import {clsx, type ClassValue} from "clsx"
import {twMerge} from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

조건부 클래스 + Tailwind 충돌 자동 해결. 모든 컴포넌트에서 `className` prop 받을 때 통과시킨다.

### RSC 기본 + `"use client"` 분리

- 데이터 패칭/SEO 들어가는 page는 RSC (default)
- 인터랙션(이벤트, 상태, 브라우저 API) 필요할 때만 `"use client"`
- 컴포넌트는 **PascalCase + named export**. `export default` 는 page/layout에만 허용

```tsx
"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"

export function Card({className, children}: {className?: string; children: React.ReactNode}) {
  return (
    <motion.div
      className={cn("rounded-md border border-border bg-card p-4", className)}
      initial={{opacity: 0, y: 8}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: 0.2}}
    >
      {children}
    </motion.div>
  )
}
```

### 디자인 토큰 (B&W Minimal)

- 다크 베이스(`#09090B`) + 흰색 액센트. 컬러 토큰은 M3 변수 (`primary`, `card`, `border`, `muted-foreground`, `outline` 등) — `src/app/globals.css` 에서 정의
- 커스텀 토큰 — `primary-dim`, `primary-container`, `surface-dim`, `outline-focus`
- 텍스처 유틸 — `.industrial-grid`, `.corner-brackets`, `.animate-scan-line`
- 폰트 — Roboto + Roboto Mono
- **유저 이미지가 유일한 컬러 소스**. UI 자체는 색을 안 쓴다 → 이걸 위반하는 색조 PR은 디자인 빚

---

## API Route

### 표준 입력 검증 + 에러 셰이프

```ts
// src/app/api/feedback/route.ts (요약)
import {NextResponse} from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // 1) 필수 필드 + 형식 검증 (UUID, email, allowlist)
    if (!UUID_RE.test(body.analysisId)) {
      return NextResponse.json({error: "Valid analysis ID required"}, {status: 400})
    }

    // 2) 길이/sanitize cap (XSS·DoS 방지)
    const safeComment = typeof body.comment === "string"
      ? body.comment.trim().slice(0, 2000)
      : null

    // 3) allowlist 필터링
    const safeTags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string" && VALID_TAG_IDS.has(t))
      : []

    // 4) DB 작업
    const {data, error} = await supabase.from("...").insert({...}).select().single()
    if (error) {
      console.error("[feedback] insert error:", error.code, error.message)
      return NextResponse.json({error: "Failed to save feedback"}, {status: 500})
    }

    return NextResponse.json({id: data.id})
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    console.error("[feedback] error:", msg)
    return NextResponse.json({error: "Internal error"}, {status: 500})
  }
}
```

규칙:
- **외부 입력은 항상 sanitize** — UUID/email regex, 길이 cap, allowlist set
- 에러 응답은 `{error: string}` 한 형태로 통일. 필드 검증 실패는 400, 인증 실패 401, 권한 부족 403, 외부 의존 실패 502, 그 외 500
- DB 에러 메시지는 사용자에게 노출 X (`error.code`, `error.message` 만 서버 로그)
- 시크릿/내부 식별자(`session_id`, service role key)는 응답에 절대 포함 금지

### 핸들러 인프로세스 직접 호출 (`/find` → search-products)

자기 자신 도메인으로 `fetch` 던지지 말고 **핸들러 함수 import + `NextRequest` 합성**.

```ts
// src/app/api/find/search/route.ts
import {POST as searchProductsPost} from "@/app/api/search-products/route"

const req = new NextRequest("http://internal/api/search-products", {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify(payload),
})
const res = await searchProductsPost(req)
```

이유: SSRF 표면 제거 + 쿠키/host-header 포워딩 회피 + 라운드트립 제거.

### LLM 호출 — OpenAI + LiteLLM 프록시 토글

```ts
// src/lib/analyze/run-vision.ts (요약)
const useLiteLLM =
  !!process.env.LITELLM_BASE_URL &&
  process.env.LITELLM_DISABLED !== "true"

const openai = new OpenAI({
  apiKey: useLiteLLM
    ? process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY
    : process.env.OPENAI_API_KEY,
  baseURL: useLiteLLM ? `${process.env.LITELLM_BASE_URL}/v1` : undefined,
})
```

- 프록시가 죽으면 `LITELLM_DISABLED=true` 한 줄로 즉시 직접 호출 폴백
- 모델은 항상 `"gpt-4o-mini"` (Vision/Text 동일). `temperature: 0.3`, `max_tokens: 2500`, `detail: "auto"`
- 응답에서 markdown fence(```json ... ```) 제거 후 `JSON.parse` — 안 그러면 LLM이 fence 끼워서 깨짐

```ts
const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
const parsed = JSON.parse(cleaned)
```

---

## Supabase 클라이언트 — 3종

| 파일 | 용도 | 사용처 |
|---|---|---|
| `src/lib/supabase.ts` | service role (RLS 바이패스) | API Routes — DB 쓰기/관리 작업 |
| `src/lib/supabase-server.ts` | SSR 쿠키 클라이언트 (anon key) | RSC, middleware — 유저 인증 |
| `src/lib/supabase-browser.ts` | 브라우저 클라이언트 (anon key) | 어드민 페이지의 클라이언트 컴포넌트 |

```ts
// service role — 서버 전용
import {supabase} from "@/lib/supabase"
const {data} = await supabase.from("analyses").insert({...})

// SSR (쿠키) — 유저가 누군지 알아야 할 때
import {createSupabaseServer} from "@/lib/supabase-server"
const authClient = await createSupabaseServer()
const {data: {user}} = await authClient.auth.getUser()
```

- 서비스 롤 키는 절대 클라이언트 노출 금지. 두 파일 모두 `import "server-only"` 로 가드
- middleware 가 어떤 테이블을 읽는다면 그 테이블엔 RLS + own-row SELECT 정책이 반드시 있어야 함 (없으면 무한 리다이렉트). 회고: 메모리 `feedback_supabase_middleware_rls.md`

---

## 어드민 가드 — 3중 체크

```
middleware.ts → /admin/* 차단 (login/signup/pending 제외)
  ↓
admin layout (RSC) → requireApprovedAdmin() 재확인
  ↓
/api/admin/* 핸들러 → requireApprovedAdmin() 한번 더
```

```ts
// src/lib/admin-auth.ts
import {cache} from "react"

export const getAdminStatus = cache(async () => {
  const authClient = await createSupabaseServer()
  const {data: {user}} = await authClient.auth.getUser()
  if (!user) return {user: null, status: null}

  const {data} = await supabaseAdmin
    .from("admin_profiles")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle()

  return {user, status: data?.status ?? null}
})

export async function requireApprovedAdmin() {
  const {user, status} = await getAdminStatus()
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401})
  if (status !== "approved") return NextResponse.json({error: "Forbidden"}, {status: 403})
  return {user}
}
```

- `React.cache` 로 한 요청 안에서 같은 사용자에 대해 1회만 DB 히트
- API 라우트 진입부 패턴:
  ```ts
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const {user} = gate
  ```

---

## R2 이미지 업로드 (서버 전용)

```ts
// src/lib/r2.ts
import "server-only"

// 분석 원본 — 자동 prefix("analyses/")
export async function uploadImage(buffer, filename, contentType): Promise<string> { ... }

// 그 외 (예: IG 슬라이드) — 호출자가 prefix 직접 지정
export async function uploadBufferAtKey(buffer, key, contentType): Promise<string> { ... }
```

규칙:
- 같은 버킷 1개 (`R2_BUCKET_NAME`), prefix 로 구분 (`analyses/`, IG는 호출자가 지정)
- 반환되는 URL은 항상 `R2_PUBLIC_URL` prefix → `next.config.ts` `remotePatterns` 등록 필수
- /find Vision은 이미지 URL 검증 시 `R2_PUBLIC_URL` 시작 여부로 SSRF 차단
- 업로드 키 합성 시 `crypto.randomUUID()` + 파일명 sanitize (`[^a-zA-Z0-9._-]` 제거 + 100자 cap)

---

## 검색 — Locked Filter (Q&A hard filter)

```ts
// src/lib/search/locked-filter.ts
export function passesLockedFilter(row: ProductRow, locked?: Partial<LockedAttrs>): boolean {
  if (!locked) return true
  for (const [key, val] of Object.entries(locked)) {
    if (val == null) continue
    const dbCol = LOCKED_FIELD_TO_DB_COLUMN[key]
    if (row[dbCol] !== val) return false
  }
  return true
}
```

- 점수가 아니라 **통과/탈락**. hold된 속성 하나라도 불일치하면 무조건 제외
- DB 컬럼 매핑은 `LOCKED_FIELD_TO_DB_COLUMN` 한 곳에서 관리 — 새 lockable attr 추가 시 여기에 반영
- 테스트는 `src/lib/search/locked-filter.test.ts` 의 case 패턴을 그대로 따라간다 (단일 매칭/단일 불일치/복수 매칭/복수 불일치)

유사도 → 결과 개수:
```ts
toleranceToTargetCount(0.0) // tight  → 10
toleranceToTargetCount(0.5) // medium → 15
toleranceToTargetCount(1.0) // loose  → 20
```

---

## 클라이언트 상태 — `useReducer` 단일 store

전역 store(Redux/Zustand) 없이 메인 페이지가 `useReducer`로 state machine을 굴린다.

```ts
// src/app/page.tsx
const [state, dispatch] = useReducer(agentReducer, INITIAL_AGENT_STATE)
```

```ts
// src/app/_qa/agent-reducer.ts
export type AgentAction =
  | {type: "ANALYZE_START"; imageUrl: string; promptText: string}
  | {type: "ANALYZE_SUCCESS"; analysisId: string; items: AnalyzedItem[]; ...}
  | {type: "TOGGLE_LOCK"; attr: LockableAttr}
  | {type: "SET_SIMILARITY"; level: SimilarityLevel}
  | {type: "SEARCH_SUCCESS"; products: AgentProduct[]}
  | {type: "FEEDBACK_SUBMITTED"}
  | {type: "GO_TO_STEP"; step: AgentStep}
  | {type: "RESET"}
  // ... 약 15개 액션 타입

export function agentReducer(state, action): AgentState { switch (...) { ... } }
```

규칙:
- step 전환은 **action 안에서 명시적**으로 — `step: "confirm"` 같이 reducer 내부에서 set
- 비동기 작업(API 호출)은 reducer 밖에서 실행 → 결과만 `_SUCCESS` / `_ERROR` action으로 dispatch
- `RESET` action은 `INITIAL_AGENT_STATE` 로 통째 교체 (부분 초기화 X)
- reducer 자체는 순수해야 — 로깅/네트워크 호출 들어가면 테스트(`agent-reducer.test.ts`)가 깨짐

---

## i18n — `useLocale()` + `t()`

```tsx
"use client"
import {useLocale} from "@/lib/i18n"

export function Step() {
  const {locale, setLocale, t} = useLocale()
  return (
    <button onClick={() => setLocale(locale === "ko" ? "en" : "ko")}>
      {t("hold.title")}
    </button>
  )
}
```

- 영어 기본, 한글 토글 (헤더). `localStorage` + `useSyncExternalStore` 로 탭 간 동기화
- 딕셔너리는 `src/lib/i18n-dict.ts`. 새 키 추가 시 EN/KO 둘 다 채울 것
- enum 값(예: `"derby"`)은 화면 표시 시 `toKo()` 로 변환 → `src/lib/enums/enum-display-ko.ts`
- 어드민은 한글 고정. UI 텍스트는 메인 = 영어, 어드민 = 한글 (영어 고유명사는 유지)

---

## 로깅 — pino

```ts
import {logger} from "@/lib/logger"

logger.info({analysisId, durationMs}, "analyze done")
logger.warn({reason: "isApparel=false", slideIndex}, "slide skipped")
logger.error({err}, "vision call failed")
```

- 개발은 `pino-pretty` 컬러 출력, 프로덕션은 JSON 한 줄
- 레벨은 `LOG_LEVEL` 환경변수 (기본 `info`)
- 첫 번째 인자는 항상 **객체** (구조화 로그). 메시지는 두 번째 — Datadog/Logflare 같은 데 넣을 때 grep 효율 ↑

---

## 애니메이션 — framer-motion

```tsx
import {AnimatePresence, motion} from "framer-motion"

<AnimatePresence mode="wait">
  {step === "input" && (
    <motion.div key="input" initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -8}} />
  )}
  {step === "results" && (
    <motion.div key="results" ... />
  )}
</AnimatePresence>
```

- step 전환은 `mode="wait"` (한 번에 한 화면만)
- 카드 그리드 stagger:
  ```tsx
  <motion.div variants={{show: {transition: {staggerChildren: 0.05}}}} initial="hidden" animate="show">
    {items.map(it => <motion.div key={it.id} variants={{hidden: {opacity: 0}, show: {opacity: 1}}} />)}
  </motion.div>
  ```
- 페이지 전체에 스캔 라인 같은 한정 효과는 CSS `@keyframes` (globals.css `.animate-scan-line`)

---

## 테스트 — vitest

```bash
pnpm test         # 1회 실행
pnpm test:watch   # watch
```

- 파일 위치: 테스트 대상 옆에 `*.test.ts(x)` (예: `src/lib/search/locked-filter.test.ts`)
- 단위 테스트 우선. reducer 테스트(`agent-reducer.test.ts`)처럼 **순수 함수 → action → 기대 state** 패턴
- `playwright` 는 devDep으로 있긴 하나 현재 `scripts/crawl.ts` 의 크롤 엔진용. e2e 라우트 테스트는 아직 없음
- `@testing-library/react` + `jsdom` 이 설치되어 있어 컴포넌트 단위 렌더 테스트 가능. 필요할 때 추가

---

## 컨벤션 정리

| 영역 | 규칙 |
|---|---|
| 컴포넌트 | PascalCase, named export. `export default` 는 page/layout만 |
| 경로 별칭 | `@/*` → `src/*` |
| 클라이언트/서버 | RSC 기본, `"use client"` 는 인터랙션 시만 |
| 서버 모듈 | `src/lib/r2.ts`, `src/lib/supabase.ts`, `admin-auth.ts` 등은 `import "server-only"` 로 누출 차단 |
| UI 텍스트 | 메인 영어, 어드민 한글 (영어 고유명사 유지) |
| 디자인 시스템 | M3 토큰 + B&W Minimal — 색은 유저 이미지에서만 |
| 입력 검증 | 외부 입력 = UUID/email regex + 길이 cap + allowlist set |
| 에러 응답 | `{error: string}` 한 형태. 시크릿/내부 ID 노출 금지 |
| 코드 스타일 | 무필요 주석 X, 무필요 추상화 X — `CLAUDE.md` 의 "Don't add features beyond task" 원칙 |
