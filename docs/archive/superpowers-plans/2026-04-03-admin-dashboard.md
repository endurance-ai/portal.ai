# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fashion Genome 어드민 대시보드 — 브랜드 DB 관리, 분석 로그, AI 품질 평가 허브

**Architecture:** Next.js 16 App Router의 `/admin` route group으로 분리. Supabase Auth(이메일/비번)로 인증, middleware에서 보호. 기존 portal.ai 메인 앱과 완전 독립된 레이아웃. 3페이지 구조: genome(DB 관리), analytics(로그+활동), eval(품질 허브).

**Tech Stack:** Next.js 16, React 19, Supabase Auth + @supabase/ssr, shadcn/ui (base-nova), Tailwind 4, recharts, next-themes, xlsx

---

## File Structure

```
src/
  middleware.ts                          — Auth guard (/admin/* 보호)
  lib/
    supabase.ts                         — (기존) 서버 service role 클라이언트
    supabase-server.ts                  — SSR용 쿠키 기반 클라이언트
    supabase-browser.ts                 — 브라우저용 클라이언트
  app/
    admin/
      layout.tsx                        — 어드민 공통 레이아웃 (사이드바 + 헤더)
      page.tsx                          — /admin → /admin/genome 리다이렉트
      login/page.tsx                    — 로그인
      signup/page.tsx                   — 회원가입
      genome/
        page.tsx                        — 브랜드 테이블 + 필터 + 노드 칩
      analytics/
        page.tsx                        — 탭: Analyses | Activity
      eval/
        page.tsx                        — 지표 대시보드 + 리뷰 큐
        [analysisId]/page.tsx           — 개별 분석 리뷰
  components/
    admin/
      sidebar.tsx                       — 사이드바 (desktop) / 탭바 (mobile)
      header.tsx                        — 상단 헤더 + 유저 + 테마 토글
      theme-provider.tsx                — next-themes 래퍼
      brand-table.tsx                   — 브랜드 데이터 테이블
      brand-filters.tsx                 — 노드칩 + 검색 + 드롭다운 필터
      brand-edit-panel.tsx              — 브랜드 상세 편집 슬라이드 패널
      analysis-table.tsx                — 분석 로그 테이블
      activity-charts.tsx               — 활동 차트 (recharts)
      eval-metrics.tsx                  — 자동 지표 카드
      eval-queue.tsx                    — 리뷰 큐 리스트
      eval-review-detail.tsx            — 개별 리뷰 상세 (이미지+결과+평가)
    ui/                                 — shadcn 컴포넌트 (추가 설치)

supabase/migrations/
  009_admin_tables.sql                  — eval_reviews, eval_golden_set, api_access_logs
  010_brand_attributes.sql              — brand_nodes.attributes JSONB 컬럼

public/
  manifest.json                         — PWA manifest
  icon-192.png                          — PWA 아이콘
  icon-512.png                          — PWA 아이콘
```

---

## Task 1: 의존성 설치 + Supabase 클라이언트 세팅

**Files:**
- Create: `src/lib/supabase-server.ts`
- Create: `src/lib/supabase-browser.ts`
- Modify: `package.json`

- [ ] **Step 1: 의존성 설치**

```bash
pnpm add @supabase/ssr recharts
```

- [ ] **Step 2: shadcn 컴포넌트 설치**

```bash
pnpm dlx shadcn@latest add table input badge tabs sheet dialog dropdown-menu separator avatar card label textarea select checkbox tooltip
```

- [ ] **Step 3: Supabase 브라우저 클라이언트 작성**

```ts
// src/lib/supabase-browser.ts
"use client"

import { createBrowserClient } from "@supabase/ssr"

export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Supabase 서버 클라이언트 작성 (쿠키 기반)**

```ts
// src/lib/supabase-server.ts
import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서 호출 시 무시 (읽기 전용)
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: .env.local에 ANON KEY 추가 확인**

`.env.local`에 아래 두 줄 필요 (기존 SUPABASE_URL은 있으므로 public 버전 + anon key 추가):
```
NEXT_PUBLIC_SUPABASE_URL=<기존 SUPABASE_URL과 동일>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase 프로젝트 Settings > API > anon key>
```

- [ ] **Step 6: 빌드 확인**

```bash
pnpm build
```
Expected: 빌드 성공 (기존 코드 영향 없음)

- [ ] **Step 7: 커밋**

```bash
git add src/lib/supabase-server.ts src/lib/supabase-browser.ts package.json pnpm-lock.yaml src/components/ui/
git commit -m "chore: Supabase SSR/browser 클라이언트 + shadcn 컴포넌트 + recharts 설치"
```

---

## Task 2: DB 마이그레이션 (어드민 테이블 + attributes)

**Files:**
- Create: `supabase/migrations/009_admin_tables.sql`
- Create: `supabase/migrations/010_brand_attributes.sql`

- [ ] **Step 1: 어드민 테이블 마이그레이션 작성**

```sql
-- supabase/migrations/009_admin_tables.sql
-- 어드민: 품질 평가 + API 접근 로그

-- 1. 분석 결과 평가
CREATE TABLE eval_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  reviewer_email TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'partial')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_eval_reviews_analysis ON eval_reviews(analysis_id);
CREATE INDEX idx_eval_reviews_verdict ON eval_reviews(verdict);

-- 2. Golden Set (품질 기준 데이터셋)
CREATE TABLE eval_golden_set (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  expected_node_primary TEXT CHECK (expected_node_primary IN ('A-1','A-2','A-3','B','B-2','C','D','E','F','F-2','F-3','G','H','I','K')),
  expected_node_secondary TEXT,
  expected_items JSONB,
  notes TEXT,
  added_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. API 접근 로그
CREATE TABLE api_access_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT,
  user_agent TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  status_code INT,
  duration_ms INT,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_access_logs_created ON api_access_logs(created_at DESC);
CREATE INDEX idx_api_access_logs_endpoint ON api_access_logs(endpoint);
```

- [ ] **Step 2: brand_attributes 마이그레이션 작성**

```sql
-- supabase/migrations/010_brand_attributes.sql
-- brand_nodes에 attributes JSONB 컬럼 추가

ALTER TABLE brand_nodes
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}';

COMMENT ON COLUMN brand_nodes.attributes IS 'Brand attributes: {silhouette: [], palette: [], material: [], detail: [], vibe: []}';

CREATE INDEX IF NOT EXISTS idx_brand_nodes_attributes
  ON brand_nodes USING gin (attributes);
```

- [ ] **Step 3: Supabase SQL Editor에서 실행**

두 마이그레이션을 순서대로 Supabase Dashboard > SQL Editor에서 실행.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/009_admin_tables.sql supabase/migrations/010_brand_attributes.sql
git commit -m "feat: 어드민 DB 마이그레이션 — eval_reviews, golden_set, api_access_logs, brand_attributes"
```

---

## Task 3: 인증 미들웨어 + 테마 프로바이더

**Files:**
- Create: `src/middleware.ts`
- Create: `src/components/admin/theme-provider.tsx`

- [ ] **Step 1: 미들웨어 작성**

```ts
// src/middleware.ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /admin/login, /admin/signup은 보호하지 않음
  if (pathname.startsWith("/admin/login") || pathname.startsWith("/admin/signup")) {
    return NextResponse.next()
  }

  // /admin/* 이외 경로는 무시
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/admin/login"
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*"],
}
```

- [ ] **Step 2: 테마 프로바이더 작성**

```tsx
// src/components/admin/theme-provider.tsx
"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
    >
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/middleware.ts src/components/admin/theme-provider.tsx
git commit -m "feat: 어드민 인증 미들웨어 + 테마 프로바이더"
```

---

## Task 4: 어드민 레이아웃 + 인증 페이지

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/signup/page.tsx`
- Create: `src/components/admin/sidebar.tsx`
- Create: `src/components/admin/header.tsx`

- [ ] **Step 1: 사이드바 컴포넌트**

```tsx
// src/components/admin/sidebar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Database, BarChart3, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/admin/genome", label: "Genome", icon: Database },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/eval", label: "Eval", icon: FlaskConical },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 flex-col border-r border-border bg-sidebar p-4 gap-1">
        <Link href="/admin" className="text-sm font-bold tracking-tight text-sidebar-foreground mb-6 px-2">
          portal.ai <span className="text-muted-foreground font-normal">admin</span>
        </Link>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              pathname.startsWith(href)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-sidebar">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
              pathname.startsWith(href)
                ? "text-sidebar-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
```

- [ ] **Step 2: 헤더 컴포넌트**

```tsx
// src/components/admin/header.tsx
"use client"

import { useRouter } from "next/navigation"
import { Moon, Sun, LogOut } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { createSupabaseBrowser } from "@/lib/supabase-browser"

export function Header({ email }: { email?: string }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const supabase = createSupabaseBrowser()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/admin/login")
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2 bg-background">
      <span className="text-sm text-muted-foreground md:hidden font-bold">
        portal.ai <span className="font-normal">admin</span>
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <span className="text-xs text-muted-foreground hidden sm:block">{email}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={handleLogout}>
          <LogOut className="size-3.5" />
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: 어드민 레이아웃**

```tsx
// src/app/admin/layout.tsx
import { createSupabaseServer } from "@/lib/supabase-server"
import { Sidebar } from "@/components/admin/sidebar"
import { Header } from "@/components/admin/header"
import { ThemeProvider } from "@/components/admin/theme-provider"

export const metadata = { title: "portal.ai Admin" }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  // 로그인/회원가입 페이지에서는 레이아웃 없이 렌더
  // middleware가 리다이렉트 처리하므로 여기서는 user 없으면 children만 반환
  if (!user) {
    return (
      <ThemeProvider>
        <div className="min-h-dvh bg-background text-foreground">
          {children}
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header email={user.email} />
          <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  )
}
```

- [ ] **Step 4: /admin 리다이렉트 페이지**

```tsx
// src/app/admin/page.tsx
import { redirect } from "next/navigation"

export default function AdminIndex() {
  redirect("/admin/genome")
}
```

- [ ] **Step 5: 로그인 페이지**

```tsx
// src/app/admin/login/page.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push("/admin/genome")
    router.refresh()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold tracking-tight">portal.ai admin</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/admin/signup" className="text-foreground underline underline-offset-4 hover:text-primary">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 회원가입 페이지**

```tsx
// src/app/admin/signup/page.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createSupabaseBrowser } from "@/lib/supabase-browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>
          </p>
          <Link href="/admin/login">
            <Button variant="outline" className="mt-4">Back to login</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground">portal.ai admin access</p>
        </div>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              minLength={6}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Sign up"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/admin/login" className="text-foreground underline underline-offset-4 hover:text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 개발 서버에서 확인**

```bash
pnpm dev
```
- `localhost:3400/admin` → `/admin/login`으로 리다이렉트 확인
- 로그인/회원가입 UI 렌더 확인
- 기존 `localhost:3400` 메인 앱 영향 없음 확인

- [ ] **Step 8: 커밋**

```bash
git add src/app/admin/ src/components/admin/sidebar.tsx src/components/admin/header.tsx
git commit -m "feat: 어드민 레이아웃 + 로그인/회원가입 + 사이드바/헤더"
```

---

## Task 5: Genome 페이지 — 브랜드 DB 관리

**Files:**
- Create: `src/app/admin/genome/page.tsx`
- Create: `src/components/admin/brand-table.tsx`
- Create: `src/components/admin/brand-filters.tsx`
- Create: `src/components/admin/brand-edit-panel.tsx`
- Create: `src/app/api/admin/brands/route.ts`
- Create: `src/app/api/admin/brands/[id]/route.ts`
- Create: `src/app/api/admin/brands/export/route.ts`

- [ ] **Step 1: 브랜드 목록 API**

```ts
// src/app/api/admin/brands/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const node = searchParams.get("node")
  const category = searchParams.get("category")
  const gender = searchParams.get("gender")
  const search = searchParams.get("q")
  const page = parseInt(searchParams.get("page") || "0")
  const limit = 50

  let query = supabase
    .from("brand_nodes")
    .select("*", { count: "exact" })
    .order("brand_name_normalized")
    .range(page * limit, (page + 1) * limit - 1)

  if (node && node !== "ALL") query = query.eq("style_node", node)
  if (category) query = query.eq("category_type", category)
  if (gender) query = query.contains("gender_scope", [gender])
  if (search) query = query.ilike("brand_name_normalized", `%${search}%`)

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: data, total: count })
}
```

- [ ] **Step 2: 브랜드 수정 API**

```ts
// src/app/api/admin/brands/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  // 허용 필드만 추출
  const allowed = [
    "style_node", "category_type", "price_band", "gender_scope",
    "sensitivity_tags", "brand_keywords", "source_platforms", "attributes"
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from("brand_nodes")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brand: data })
}
```

- [ ] **Step 3: 엑셀 추출 API**

```ts
// src/app/api/admin/brands/export/route.ts
import { NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import * as XLSX from "xlsx"

export async function GET() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: brands } = await supabase
    .from("brand_nodes")
    .select("*")
    .order("brand_name_normalized")

  if (!brands) return NextResponse.json({ error: "No data" }, { status: 500 })

  const rows = brands.map((b) => ({
    brand_name: b.brand_name,
    brand_name_normalized: b.brand_name_normalized,
    style_node: b.style_node,
    category_type: b.category_type,
    price_band: b.price_band,
    gender_scope: (b.gender_scope || []).join(", "),
    sensitivity_tags: (b.sensitivity_tags || []).join(", "),
    brand_keywords: (b.brand_keywords || []).join(", "),
    source_platforms: (b.source_platforms || []).join(", "),
    attributes: JSON.stringify(b.attributes || {}),
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Brand_DB")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="brand_nodes_${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  })
}
```

- [ ] **Step 4: 브랜드 필터 컴포넌트**

```tsx
// src/components/admin/brand-filters.tsx
"use client"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const NODES = ["ALL","A-1","A-2","A-3","B","B-2","C","D","E","F","F-2","F-3","G","H","I","K"] as const

type BrandFiltersProps = {
  node: string
  category: string
  gender: string
  search: string
  onNodeChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onGenderChange: (v: string) => void
  onSearchChange: (v: string) => void
}

export function BrandFilters({
  node, category, gender, search,
  onNodeChange, onCategoryChange, onGenderChange, onSearchChange,
}: BrandFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {NODES.map((n) => (
          <Badge
            key={n}
            variant={node === n ? "default" : "outline"}
            className={cn("cursor-pointer text-xs", node === n && "bg-primary text-primary-foreground")}
            onClick={() => onNodeChange(n)}
          >
            {n}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search brand..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full sm:w-48 h-8 text-sm"
        />
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="의류">의류</SelectItem>
            <SelectItem value="슈즈">슈즈</SelectItem>
            <SelectItem value="주얼리">주얼리</SelectItem>
            <SelectItem value="아이웨어">아이웨어</SelectItem>
            <SelectItem value="제외">제외</SelectItem>
          </SelectContent>
        </Select>
        <Select value={gender} onValueChange={onGenderChange}>
          <SelectTrigger className="w-24 h-8 text-sm">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="men">Men</SelectItem>
            <SelectItem value="women">Women</SelectItem>
            <SelectItem value="unisex">Unisex</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 브랜드 테이블 컴포넌트**

```tsx
// src/components/admin/brand-table.tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { BrandFilters } from "./brand-filters"
import { BrandEditPanel } from "./brand-edit-panel"

type Brand = {
  id: string
  brand_name: string
  brand_name_normalized: string
  style_node: string | null
  category_type: string | null
  price_band: string | null
  gender_scope: string[] | null
  sensitivity_tags: string[] | null
  brand_keywords: string[] | null
  source_platforms: string[] | null
  attributes: Record<string, string[]> | null
}

export function BrandTable() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)

  // Filters
  const [node, setNode] = useState("ALL")
  const [category, setCategory] = useState("all")
  const [gender, setGender] = useState("all")
  const [search, setSearch] = useState("")

  const fetchBrands = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (node !== "ALL") params.set("node", node)
    if (category !== "all") params.set("category", category)
    if (gender !== "all") params.set("gender", gender)
    if (search) params.set("q", search)

    const res = await fetch(`/api/admin/brands?${params}`)
    const data = await res.json()
    setBrands(data.brands || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page, node, category, gender, search])

  useEffect(() => { fetchBrands() }, [fetchBrands])

  // 검색 디바운스
  const [searchInput, setSearchInput] = useState("")
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setPage(0)
  }

  const handleBrandUpdate = (updated: Brand) => {
    setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
  }

  const attrChips = (attrs: Record<string, string[]> | null) => {
    if (!attrs) return null
    return Object.values(attrs).flat().slice(0, 3).map((v) => (
      <Badge key={v} variant="outline" className="text-[10px] px-1 py-0">{v}</Badge>
    ))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Fashion Genome</h1>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/admin/brands/export" download>
            <Download className="size-3.5 mr-1" />
            Export
          </a>
        </Button>
      </div>

      <BrandFilters
        node={node}
        category={category}
        gender={gender}
        search={searchInput}
        onNodeChange={handleFilterChange(setNode)}
        onCategoryChange={handleFilterChange(setCategory)}
        onGenderChange={handleFilterChange(setGender)}
        onSearchChange={setSearchInput}
      />

      <div className="text-xs text-muted-foreground">
        {total} brands {node !== "ALL" && `in ${node}`}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Brand</TableHead>
              <TableHead className="w-[60px]">Node</TableHead>
              <TableHead className="w-[160px]">Attributes</TableHead>
              <TableHead className="w-[80px]">Gender</TableHead>
              <TableHead className="w-[80px]">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : brands.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No brands found
                </TableCell>
              </TableRow>
            ) : brands.map((b) => (
              <TableRow
                key={b.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedBrand(b)}
              >
                <TableCell className="font-medium text-sm">{b.brand_name_normalized}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{b.style_node || "—"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-0.5">{attrChips(b.attributes)}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {(b.gender_scope || []).join(", ")}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{b.price_band || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={(page + 1) * 50 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      {/* Edit Panel */}
      <BrandEditPanel
        brand={selectedBrand}
        onClose={() => setSelectedBrand(null)}
        onSave={handleBrandUpdate}
      />
    </div>
  )
}
```

- [ ] **Step 6: 브랜드 편집 패널 컴포넌트**

```tsx
// src/components/admin/brand-edit-panel.tsx
"use client"

import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const NODES = ["A-1","A-2","A-3","B","B-2","C","D","E","F","F-2","F-3","G","H","I","K"] as const

const ATTR_ENUMS: Record<string, string[]> = {
  silhouette: ["structured","sculptural","draped","oversized","voluminous","body-conscious","tailored","deconstructed","reconstructed"],
  palette: ["monochrome","bold-color"],
  material: ["denim","leather","sheer","technical","knit","jersey","padded"],
  detail: ["graphic","decorative","layered","utility","military"],
  vibe: ["bohemian","heritage","gorpcore","outdoor","trail","athletic","japanese"],
}

type Brand = {
  id: string
  brand_name_normalized: string
  style_node: string | null
  category_type: string | null
  price_band: string | null
  gender_scope: string[] | null
  attributes: Record<string, string[]> | null
  [key: string]: unknown
}

type Props = {
  brand: Brand | null
  onClose: () => void
  onSave: (updated: Brand) => void
}

export function BrandEditPanel({ brand, onClose, onSave }: Props) {
  const [node, setNode] = useState("")
  const [attrs, setAttrs] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (brand) {
      setNode(brand.style_node || "")
      setAttrs(brand.attributes || {})
    }
  }, [brand])

  const toggleAttr = (category: string, value: string) => {
    setAttrs((prev) => {
      const current = prev[category] || []
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [category]: next }
    })
  }

  const handleSave = async () => {
    if (!brand) return
    setSaving(true)

    const res = await fetch(`/api/admin/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style_node: node, attributes: attrs }),
    })

    const data = await res.json()
    if (data.brand) onSave(data.brand)
    setSaving(false)
    onClose()
  }

  return (
    <Sheet open={!!brand} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{brand?.brand_name_normalized}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Style Node */}
          <div className="space-y-2">
            <Label>Style Node</Label>
            <Select value={node} onValueChange={setNode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NODES.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Attributes */}
          {Object.entries(ATTR_ENUMS).map(([category, values]) => (
            <div key={category} className="space-y-2">
              <Label className="capitalize">{category}</Label>
              <div className="flex flex-wrap gap-1.5">
                {values.map((v) => {
                  const selected = (attrs[category] || []).includes(v)
                  return (
                    <Badge
                      key={v}
                      variant={selected ? "default" : "outline"}
                      className={cn("cursor-pointer text-xs", selected && "bg-primary text-primary-foreground")}
                      onClick={() => toggleAttr(category, v)}
                    >
                      {v}
                    </Badge>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Info (read-only) */}
          <div className="space-y-1 text-xs text-muted-foreground border-t border-border pt-4">
            <p>Category: {brand?.category_type || "—"}</p>
            <p>Price: {brand?.price_band || "—"}</p>
            <p>Gender: {(brand?.gender_scope || []).join(", ") || "—"}</p>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 7: Genome 페이지 조립**

```tsx
// src/app/admin/genome/page.tsx
import { BrandTable } from "@/components/admin/brand-table"

export default function GenomePage() {
  return <BrandTable />
}
```

- [ ] **Step 8: 개발 서버에서 확인**

```bash
pnpm dev
```
- `/admin/genome` — 브랜드 테이블 렌더 확인
- 노드 칩 필터 클릭 → 필터링 확인
- 검색 입력 → 디바운스 검색 확인
- 행 클릭 → 슬라이드 패널 열림 확인
- attributes 칩 선택 → Save → 저장 확인
- Export 버튼 → xlsx 다운로드 확인

- [ ] **Step 9: 커밋**

```bash
git add src/app/admin/genome/ src/app/api/admin/ src/components/admin/brand-table.tsx src/components/admin/brand-filters.tsx src/components/admin/brand-edit-panel.tsx
git commit -m "feat: Genome 페이지 — 브랜드 테이블 + 필터 + 인라인 수정 + 엑셀 추출"
```

---

## Task 6: Analytics 페이지 — 분석 로그 + 유저 활동

**Files:**
- Create: `src/app/admin/analytics/page.tsx`
- Create: `src/components/admin/analysis-table.tsx`
- Create: `src/components/admin/activity-charts.tsx`
- Create: `src/app/api/admin/analytics/route.ts`
- Modify: `src/app/api/analyze/route.ts` (API 접근 로그 추가)

- [ ] **Step 1: 분석 로그 + 통계 API**

```ts
// src/app/api/admin/analytics/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const tab = searchParams.get("tab") || "analyses"
  const page = parseInt(searchParams.get("page") || "0")
  const limit = 30

  if (tab === "analyses") {
    const { data, count } = await supabase
      .from("analyses")
      .select("id, created_at, image_filename, style_node_primary, style_node_confidence, detected_gender, items, analysis_duration_ms, search_duration_ms", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    return NextResponse.json({ analyses: data, total: count })
  }

  if (tab === "activity") {
    // 일별 집계 (최근 30일)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const { data: analyses } = await supabase
      .from("analyses")
      .select("created_at, style_node_primary, detected_gender")
      .gte("created_at", thirtyDaysAgo)

    // API 접근 로그 최근 100건
    const { data: logs } = await supabase
      .from("api_access_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)

    return NextResponse.json({ analyses: analyses || [], accessLogs: logs || [] })
  }

  return NextResponse.json({ error: "Invalid tab" }, { status: 400 })
}
```

- [ ] **Step 2: analyze API에 접근 로그 추가**

`src/app/api/analyze/route.ts` 상단에 로깅 코드 추가. 기존 `POST` 함수 시작 부분에 삽입:

```ts
// 기존 import 아래에 추가
// (route.ts POST 함수 내부, try 블록 시작 직후에 추가)

// API 접근 로그
const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
const userAgent = request.headers.get("user-agent") || "unknown"
supabase.from("api_access_logs").insert({
  ip, user_agent: userAgent, endpoint: "/api/analyze", method: "POST"
}).then() // fire-and-forget
```

- [ ] **Step 3: 분석 테이블 컴포넌트**

```tsx
// src/components/admin/analysis-table.tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Analysis = {
  id: string
  created_at: string
  image_filename: string | null
  style_node_primary: string | null
  style_node_confidence: number | null
  detected_gender: string | null
  items: unknown[] | null
  analysis_duration_ms: number | null
  search_duration_ms: number | null
}

export function AnalysisTable() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/analytics?tab=analyses&page=${page}`)
    const data = await res.json()
    setAnalyses(data.analyses || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [page])

  useEffect(() => { fetchData() }, [fetchData])

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Node</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading...</TableCell>
              </TableRow>
            ) : analyses.map((a) => (
              <TableRow
                key={a.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/admin/eval/${a.id}`)}
              >
                <TableCell className="text-sm">{formatTime(a.created_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {a.style_node_primary || "—"}
                    {a.style_node_confidence ? ` (${(a.style_node_confidence * 100).toFixed(0)}%)` : ""}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {Array.isArray(a.items) ? a.items.length : 0}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.detected_gender || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {a.analysis_duration_ms ? `${(a.analysis_duration_ms / 1000).toFixed(1)}s` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">{page * 30 + 1}–{Math.min((page + 1) * 30, total)} of {total}</span>
        <Button variant="outline" size="sm" disabled={(page + 1) * 30 >= total} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 활동 차트 컴포넌트**

```tsx
// src/components/admin/activity-charts.tsx
"use client"

import { useState, useEffect } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const COLORS = ["#fff", "#a1a1aa", "#71717a", "#52525b", "#27272a"]

type ActivityData = {
  analyses: Array<{ created_at: string; style_node_primary: string | null; detected_gender: string | null }>
  accessLogs: Array<{ id: string; ip: string; user_agent: string; endpoint: string; created_at: string }>
}

export function ActivityCharts() {
  const [data, setData] = useState<ActivityData | null>(null)

  useEffect(() => {
    fetch("/api/admin/analytics?tab=activity")
      .then((r) => r.json())
      .then(setData)
  }, [])

  if (!data) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>

  // 일별 집계
  const dailyMap: Record<string, number> = {}
  data.analyses.forEach((a) => {
    const day = a.created_at.split("T")[0]
    dailyMap[day] = (dailyMap[day] || 0) + 1
  })
  const dailyData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date: date.slice(5), count }))

  // 성별 분포
  const genderMap: Record<string, number> = {}
  data.analyses.forEach((a) => {
    const g = a.detected_gender || "unknown"
    genderMap[g] = (genderMap[g] || 0) + 1
  })
  const genderData = Object.entries(genderMap).map(([name, value]) => ({ name, value }))

  // 노드 분포
  const nodeMap: Record<string, number> = {}
  data.analyses.forEach((a) => {
    const n = a.style_node_primary || "none"
    nodeMap[n] = (nodeMap[n] || 0) + 1
  })
  const nodeData = Object.entries(nodeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([node, count]) => ({ node, count }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily analyses */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Daily Analyses</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#71717a" />
                <YAxis tick={{ fontSize: 10 }} stroke="#71717a" />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
                <Bar dataKey="count" fill="#fff" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gender distribution */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Gender Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {genderData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Node distribution */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Node Distribution</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={nodeData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="#71717a" />
              <YAxis dataKey="node" type="category" tick={{ fontSize: 10 }} stroke="#71717a" width={40} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
              <Bar dataKey="count" fill="#a1a1aa" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Access logs */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Recent API Calls</h3>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>UA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.accessLogs.slice(0, 20).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{new Date(log.created_at).toLocaleTimeString("ko-KR")}</TableCell>
                  <TableCell className="text-xs font-mono">{log.endpoint}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.ip}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{log.user_agent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Analytics 페이지 조립**

```tsx
// src/app/admin/analytics/page.tsx
"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnalysisTable } from "@/components/admin/analysis-table"
import { ActivityCharts } from "@/components/admin/activity-charts"

export default function AnalyticsPage() {
  const [tab, setTab] = useState("analyses")

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Analytics</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analyses">Analyses</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="analyses"><AnalysisTable /></TabsContent>
        <TabsContent value="activity"><ActivityCharts /></TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 6: 확인**

```bash
pnpm dev
```
- `/admin/analytics` — Analyses 탭: 분석 로그 테이블 확인
- Activity 탭: 차트 렌더 + API 로그 테이블 확인
- 행 클릭 → `/admin/eval/[id]`로 이동 확인

- [ ] **Step 7: 커밋**

```bash
git add src/app/admin/analytics/ src/app/api/admin/analytics/ src/components/admin/analysis-table.tsx src/components/admin/activity-charts.tsx src/app/api/analyze/route.ts
git commit -m "feat: Analytics 페이지 — 분석 로그 테이블 + 활동 차트 + API 접근 로그"
```

---

## Task 7: Eval 페이지 — 품질 허브

**Files:**
- Create: `src/app/admin/eval/page.tsx`
- Create: `src/app/admin/eval/[analysisId]/page.tsx`
- Create: `src/components/admin/eval-metrics.tsx`
- Create: `src/components/admin/eval-queue.tsx`
- Create: `src/components/admin/eval-review-detail.tsx`
- Create: `src/app/api/admin/eval/route.ts`
- Create: `src/app/api/admin/eval/[analysisId]/route.ts`

- [ ] **Step 1: Eval 지표 + 큐 API**

```ts
// src/app/api/admin/eval/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = request.nextUrl
  const filter = searchParams.get("filter") || "unreviewed"
  const page = parseInt(searchParams.get("page") || "0")
  const limit = 20

  // 자동 지표
  const { count: totalAnalyses } = await supabase
    .from("analyses")
    .select("*", { count: "exact", head: true })

  const { count: reviewedCount } = await supabase
    .from("eval_reviews")
    .select("*", { count: "exact", head: true })

  const { count: pendingCount } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .not("id", "in", `(select analysis_id from eval_reviews)`)

  // 리뷰 verdict 분포
  const { data: verdicts } = await supabase
    .from("eval_reviews")
    .select("verdict")

  const verdictDist = { pass: 0, fail: 0, partial: 0 }
  verdicts?.forEach((v) => { verdictDist[v.verdict as keyof typeof verdictDist]++ })

  // 리뷰 큐
  let queueQuery = supabase
    .from("analyses")
    .select("id, created_at, image_filename, style_node_primary, style_node_confidence, detected_gender, items")
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (filter === "unreviewed") {
    // 리뷰되지 않은 것만
    const { data: reviewedIds } = await supabase
      .from("eval_reviews")
      .select("analysis_id")
    const ids = (reviewedIds || []).map((r) => r.analysis_id)
    if (ids.length > 0) {
      queueQuery = queueQuery.not("id", "in", `(${ids.join(",")})`)
    }
  }

  const { data: queue } = await queueQuery

  return NextResponse.json({
    metrics: {
      totalAnalyses: totalAnalyses || 0,
      reviewed: reviewedCount || 0,
      pending: pendingCount || 0,
      verdictDist,
    },
    queue: queue || [],
  })
}
```

- [ ] **Step 2: 개별 분석 리뷰 API (GET + POST)**

```ts
// src/app/api/admin/eval/[analysisId]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { analysisId } = await params

  const [analysisRes, reviewsRes, itemsRes] = await Promise.all([
    supabase.from("analyses").select("*").eq("id", analysisId).single(),
    supabase.from("eval_reviews").select("*").eq("analysis_id", analysisId).order("created_at", { ascending: false }),
    supabase.from("analysis_items").select("*").eq("analysis_id", analysisId).order("item_index"),
  ])

  if (analysisRes.error) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
  }

  return NextResponse.json({
    analysis: analysisRes.data,
    reviews: reviewsRes.data || [],
    items: itemsRes.data || [],
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { analysisId } = await params
  const body = await request.json()

  const { verdict, comment, addToGoldenSet } = body

  // 리뷰 저장
  const { error: reviewError } = await supabase.from("eval_reviews").insert({
    analysis_id: analysisId,
    reviewer_email: user.email,
    verdict,
    comment: comment || null,
  })

  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 })
  }

  // Golden Set 추가
  if (addToGoldenSet) {
    const { data: analysis } = await supabase.from("analyses").select("style_node_primary, style_node_secondary, items, image_filename").eq("id", analysisId).single()

    if (analysis) {
      await supabase.from("eval_golden_set").insert({
        analysis_id: analysisId,
        image_url: analysis.image_filename || "",
        expected_node_primary: analysis.style_node_primary,
        expected_node_secondary: analysis.style_node_secondary,
        expected_items: analysis.items,
        added_by: user.email,
      })
    }
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: 지표 카드 컴포넌트**

```tsx
// src/components/admin/eval-metrics.tsx
import { Card, CardContent } from "@/components/ui/card"

type Metrics = {
  totalAnalyses: number
  reviewed: number
  pending: number
  verdictDist: { pass: number; fail: number; partial: number }
}

export function EvalMetrics({ metrics }: { metrics: Metrics }) {
  const passRate = metrics.reviewed > 0
    ? ((metrics.verdictDist.pass / metrics.reviewed) * 100).toFixed(0)
    : "—"

  const cards = [
    { label: "Total", value: metrics.totalAnalyses },
    { label: "Reviewed", value: metrics.reviewed },
    { label: "Pending", value: metrics.pending },
    { label: "Pass Rate", value: `${passRate}%` },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 리뷰 큐 컴포넌트**

```tsx
// src/components/admin/eval-queue.tsx
"use client"

import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

type QueueItem = {
  id: string
  created_at: string
  style_node_primary: string | null
  style_node_confidence: number | null
  detected_gender: string | null
  items: unknown[] | null
}

export function EvalQueue({ queue }: { queue: QueueItem[] }) {
  const router = useRouter()

  if (queue.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">All caught up!</p>
  }

  return (
    <div className="space-y-2">
      {queue.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between border border-border rounded-md p-3 hover:bg-muted/50 cursor-pointer"
          onClick={() => router.push(`/admin/eval/${item.id}`)}
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm">
                {new Date(item.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}{" "}
                {new Date(item.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className="text-xs">
                  {item.style_node_primary || "—"}
                  {item.style_node_confidence ? ` (${(item.style_node_confidence * 100).toFixed(0)}%)` : ""}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {Array.isArray(item.items) ? item.items.length : 0} items
                </span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm">
            <ArrowRight className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 개별 리뷰 상세 컴포넌트**

```tsx
// src/components/admin/eval-review-detail.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

type Analysis = {
  id: string
  created_at: string
  ai_raw_response: unknown
  style_node_primary: string | null
  style_node_confidence: number | null
  style_node_secondary: string | null
  detected_gender: string | null
  mood_tags: unknown
  mood_summary: string | null
  sensitivity_tags: string[] | null
  items: unknown[] | null
}

type AnalysisItem = {
  id: string
  category: string
  name: string
  subcategory: string | null
  fabric: string | null
  color: string | null
  fit: string | null
  search_query_original: string | null
}

type Review = {
  id: string
  verdict: string
  comment: string | null
  reviewer_email: string
  created_at: string
}

type Props = {
  analysis: Analysis
  items: AnalysisItem[]
  reviews: Review[]
}

export function EvalReviewDetail({ analysis, items, reviews }: Props) {
  const router = useRouter()
  const [verdict, setVerdict] = useState<"pass" | "fail" | "partial" | null>(null)
  const [comment, setComment] = useState("")
  const [addToGolden, setAddToGolden] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSubmit = async () => {
    if (!verdict) return
    setSaving(true)

    await fetch(`/api/admin/eval/${analysis.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict, comment, addToGoldenSet: addToGolden }),
    })

    setSaving(false)
    setSaved(true)
  }

  const verdictButtons = [
    { value: "pass" as const, label: "Pass", icon: CheckCircle, color: "text-green-500" },
    { value: "fail" as const, label: "Fail", icon: XCircle, color: "text-red-500" },
    { value: "partial" as const, label: "Partial", icon: AlertCircle, color: "text-yellow-500" },
  ]

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/admin/eval")}>
        <ArrowLeft className="size-3.5 mr-1" /> Back
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: AI 분석 결과 */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold">Analysis Result</h2>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Node: {analysis.style_node_primary || "—"}</Badge>
              {analysis.style_node_confidence && (
                <span className="text-xs text-muted-foreground">
                  {(analysis.style_node_confidence * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>
            {analysis.style_node_secondary && (
              <Badge variant="outline" className="text-xs">Secondary: {analysis.style_node_secondary}</Badge>
            )}
          </div>

          {analysis.sensitivity_tags && (
            <div className="flex flex-wrap gap-1">
              {analysis.sensitivity_tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Gender: {analysis.detected_gender || "—"} |{" "}
            {new Date(analysis.created_at).toLocaleString("ko-KR")}
          </p>

          {analysis.mood_summary && (
            <p className="text-sm italic text-muted-foreground">{analysis.mood_summary}</p>
          )}

          {/* Items */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Items ({items.length})</h3>
            {items.map((item) => (
              <div key={item.id} className="border border-border rounded p-2 text-sm space-y-1">
                <p className="font-medium">{item.category}: {item.name}</p>
                <div className="flex flex-wrap gap-1">
                  {item.subcategory && <Badge variant="outline" className="text-[10px]">{item.subcategory}</Badge>}
                  {item.fit && <Badge variant="outline" className="text-[10px]">{item.fit}</Badge>}
                  {item.fabric && <Badge variant="outline" className="text-[10px]">{item.fabric}</Badge>}
                  {item.color && <Badge variant="outline" className="text-[10px]">{item.color}</Badge>}
                </div>
                {item.search_query_original && (
                  <p className="text-xs text-muted-foreground font-mono">Query: {item.search_query_original}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: 평가 입력 */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold">Review</h2>

          {/* 기존 리뷰 */}
          {reviews.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs text-muted-foreground">Previous Reviews</h3>
              {reviews.map((r) => (
                <div key={r.id} className="border border-border rounded p-2 text-sm">
                  <Badge variant={r.verdict === "pass" ? "default" : "secondary"} className="text-xs mb-1">
                    {r.verdict}
                  </Badge>
                  {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{r.reviewer_email} — {new Date(r.created_at).toLocaleString("ko-KR")}</p>
                </div>
              ))}
            </div>
          )}

          {saved ? (
            <div className="text-center py-8">
              <CheckCircle className="size-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm">Review saved</p>
            </div>
          ) : (
            <>
              {/* Verdict buttons */}
              <div className="flex gap-2">
                {verdictButtons.map(({ value, label, icon: Icon, color }) => (
                  <Button
                    key={value}
                    variant={verdict === value ? "default" : "outline"}
                    size="sm"
                    className={cn("flex-1", verdict === value && "ring-2 ring-ring")}
                    onClick={() => setVerdict(value)}
                  >
                    <Icon className={cn("size-3.5 mr-1", verdict === value ? "" : color)} />
                    {label}
                  </Button>
                ))}
              </div>

              {/* Comment */}
              <div className="space-y-2">
                <Label>Comment</Label>
                <Textarea
                  placeholder="Optional: what's wrong, what's good..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Golden set */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="golden"
                  checked={addToGolden}
                  onCheckedChange={(v) => setAddToGolden(v === true)}
                />
                <Label htmlFor="golden" className="text-sm">Add to Golden Set</Label>
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={!verdict || saving}>
                {saving ? "Saving..." : "Submit Review"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Eval 메인 페이지**

```tsx
// src/app/admin/eval/page.tsx
"use client"

import { useState, useEffect } from "react"
import { EvalMetrics } from "@/components/admin/eval-metrics"
import { EvalQueue } from "@/components/admin/eval-queue"

export default function EvalPage() {
  const [data, setData] = useState<{ metrics: any; queue: any[] } | null>(null)

  useEffect(() => {
    fetch("/api/admin/eval?filter=unreviewed")
      .then((r) => r.json())
      .then(setData)
  }, [])

  if (!data) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold">Quality Eval</h1>
      <EvalMetrics metrics={data.metrics} />
      <div>
        <h2 className="text-sm font-medium mb-3">Review Queue ({data.metrics.pending} pending)</h2>
        <EvalQueue queue={data.queue} />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 개별 리뷰 페이지**

```tsx
// src/app/admin/eval/[analysisId]/page.tsx
import { createSupabaseServer } from "@/lib/supabase-server"
import { EvalReviewDetail } from "@/components/admin/eval-review-detail"
import { redirect } from "next/navigation"

export default async function EvalReviewPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params
  const supabase = await createSupabaseServer()

  const [analysisRes, reviewsRes, itemsRes] = await Promise.all([
    supabase.from("analyses").select("*").eq("id", analysisId).single(),
    supabase.from("eval_reviews").select("*").eq("analysis_id", analysisId).order("created_at", { ascending: false }),
    supabase.from("analysis_items").select("*").eq("analysis_id", analysisId).order("item_index"),
  ])

  if (analysisRes.error) redirect("/admin/eval")

  return (
    <EvalReviewDetail
      analysis={analysisRes.data}
      items={itemsRes.data || []}
      reviews={reviewsRes.data || []}
    />
  )
}
```

- [ ] **Step 8: 확인**

```bash
pnpm dev
```
- `/admin/eval` — 지표 카드 + 리뷰 큐 확인
- 큐 항목 클릭 → 개별 리뷰 페이지 이동
- Pass/Fail/Partial 선택 → 코멘트 → Submit 확인
- Golden Set 체크 → 저장 확인

- [ ] **Step 9: 커밋**

```bash
git add src/app/admin/eval/ src/app/api/admin/eval/ src/components/admin/eval-metrics.tsx src/components/admin/eval-queue.tsx src/components/admin/eval-review-detail.tsx
git commit -m "feat: Eval 페이지 — 품질 지표 대시보드 + 리뷰 큐 + 개별 리뷰 상세"
```

---

## Task 8: PWA + 라이트모드 CSS + globals.css 라이트 테마

**Files:**
- Create: `public/manifest.json`
- Modify: `src/app/admin/layout.tsx` (manifest + meta 추가)
- Modify: `src/app/globals.css` (라이트 모드 토큰 추가)

- [ ] **Step 1: PWA manifest**

```json
// public/manifest.json
{
  "name": "portal.ai Admin",
  "short_name": "portal.ai",
  "start_url": "/admin",
  "display": "standalone",
  "background_color": "#09090B",
  "theme_color": "#09090B",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: 라이트모드 CSS 변수 추가**

`src/app/globals.css`의 `:root` 블록 뒤에 추가:

```css
.light {
  --background: #FAFAFA;
  --foreground: #09090B;
  --primary: #09090B;
  --primary-foreground: #FAFAFA;
  --secondary: #F4F4F5;
  --secondary-foreground: #09090B;
  --card: #FFFFFF;
  --card-foreground: #09090B;
  --popover: #FFFFFF;
  --popover-foreground: #09090B;
  --muted: #F4F4F5;
  --muted-foreground: #71717A;
  --accent: #F4F4F5;
  --accent-foreground: #09090B;
  --border: #E4E4E7;
  --input: #E4E4E7;
  --ring: #09090B;
  --chart-1: #09090B;
  --chart-2: #71717A;
  --chart-3: #A1A1AA;
  --chart-4: #D4D4D8;
  --chart-5: #E4E4E7;
  --sidebar: #FFFFFF;
  --sidebar-foreground: #09090B;
  --sidebar-primary: #09090B;
  --sidebar-primary-foreground: #FAFAFA;
  --sidebar-accent: #F4F4F5;
  --sidebar-accent-foreground: #09090B;
  --sidebar-border: #E4E4E7;
  --sidebar-ring: #09090B;
}
```

- [ ] **Step 3: 어드민 레이아웃에 PWA 메타 추가**

`src/app/admin/layout.tsx`의 metadata에 추가:

```ts
export const metadata = {
  title: "portal.ai Admin",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "portal.ai",
  },
  themeColor: "#09090B",
}
```

- [ ] **Step 4: PWA 아이콘 생성**

간단한 텍스트 기반 아이콘 (나중에 교체 가능):

```bash
# 임시 아이콘 — 검은 배경에 "P" 텍스트
node -e "
const { createCanvas } = require('canvas');
// canvas가 없으면 단순 placeholder 생성
const fs = require('fs');
// 1x1 흰색 PNG를 base64로 생성 (placeholder)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('public/icon-192.png', png);
fs.writeFileSync('public/icon-512.png', png);
console.log('placeholder icons created');
"
```

- [ ] **Step 5: 확인**

```bash
pnpm dev
```
- 다크모드 기본 확인
- 헤더 테마 토글 클릭 → 라이트모드 전환 확인
- iOS Safari에서 홈화면 추가 가능 확인 (실기기 또는 시뮬레이터)

- [ ] **Step 6: 커밋**

```bash
git add public/manifest.json public/icon-192.png public/icon-512.png src/app/globals.css src/app/admin/layout.tsx
git commit -m "feat: PWA manifest + 라이트모드 CSS 토큰 + 어드민 메타데이터"
```

---

## Task 9: API 접근 로그 미들웨어 + 최종 확인

**Files:**
- Modify: `src/app/api/analyze/route.ts` (API 로그 삽입 최종 반영)
- Modify: `src/app/api/search-products/route.ts` (API 로그 삽입)

- [ ] **Step 1: analyze route에 접근 로그 완성**

`src/app/api/analyze/route.ts` POST 함수의 try 블록 시작 직후에:

```ts
// API 접근 로그 (fire-and-forget)
const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")
  || "unknown"
const clientUa = request.headers.get("user-agent") || "unknown"
supabase.from("api_access_logs").insert({
  ip: clientIp,
  user_agent: clientUa,
  endpoint: "/api/analyze",
  method: "POST",
}).then()
```

- [ ] **Step 2: search-products route에도 동일 로그 추가**

`src/app/api/search-products/route.ts` POST 함수의 try 블록 시작 직후에 동일 패턴:

```ts
const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")
  || "unknown"
const clientUa = request.headers.get("user-agent") || "unknown"
supabase.from("api_access_logs").insert({
  ip: clientIp,
  user_agent: clientUa,
  endpoint: "/api/search-products",
  method: "POST",
}).then()
```

- [ ] **Step 3: 전체 빌드 확인**

```bash
pnpm build
```
Expected: 빌드 성공, 에러 없음

- [ ] **Step 4: 전체 플로우 수동 테스트**

```
1. pnpm dev
2. localhost:3400 — 메인 앱 정상 동작 확인
3. localhost:3400/admin — 로그인 리다이렉트 확인
4. 회원가입 → 이메일 인증 → 로그인
5. /admin/genome — 브랜드 테이블 + 필터 + 편집
6. /admin/analytics — 분석 로그 + 차트
7. /admin/eval — 지표 + 리뷰 큐
8. 리뷰 항목 클릭 → 평가 제출
9. 테마 토글 (다크↔라이트)
10. 모바일 뷰포트 — 하단 탭바 확인
```

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/analyze/route.ts src/app/api/search-products/route.ts
git commit -m "feat: API 접근 로그 추가 (analyze + search-products)"
```

---

## NOT in scope (이번 플랜에서 제외)

- brand_attributes JSON → Supabase 일괄 임포트 (별도 스크립트 태스크)
- 크롤러 브랜드 셀렉터 수정 + 재크롤링
- 상품(products) CRUD UI
- fashion-genome.ts 코드 동기화 (attributes 기반 검색 전환)
- Golden Set 자동 실행 (CI 연동)
- 실제 PWA 아이콘 디자인
