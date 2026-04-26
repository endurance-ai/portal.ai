# Editorial Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** portal.ai 유저-facing UI 전체를 에디토리얼 톤(SSENSE × Mediabus)으로 리디자인. Cream `#fafaf7` + Ink `#111` + Pretendard 단일 패밀리 + PORTAL tracked caps wordmark. 로직 변경 없음 — presentation layer only.

**Architecture:** 기존 `src/app/page.tsx`에 `useReducer` 기반 Q&A Agent 4-step 플로우가 이미 통합돼 있음. 이 플랜은 (1) 토큰 시스템 교체 (`globals.css`, `layout.tsx`), (2) Chrome (Header/Footer) 재작성, (3) Home + AnalyzingView 재작성, (4) 4개 step 컴포넌트 리스타일 (props 인터페이스 유지), (5) 신규 `/about`, `/archive` 라우트 추가 순으로 진행.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4 (`@theme` directive), Pretendard Variable (CDN), TypeScript, shadcn/ui (기존 유지), framer-motion (유지).

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-04-13-editorial-redesign-design.md`
- Design system (AI-facing): `DESIGN.md` (root)
- Handoff: `docs/HANDOFF-2026-04-13-editorial-redesign.md`

**Branch:** `feature/editorial-redesign` (already created from `dev`)

---

## 실행 원칙

1. **Props 인터페이스 유지** — `StepInput`, `StepAttributes`, `StepRefine`, `StepResults`, `AgentProgress`, `AnalyzingView`의 props는 바꾸지 않음. 내부 JSX/className만 교체.
2. **검색 로직 / API / DB 무변경** — `src/app/api/*`, `src/lib/search/*`, `src/lib/enums/*` 건드리지 않음.
3. **Browser verification 필수** — UI 작업이므로 각 Phase 끝에 `pnpm dev` (port 3400) 로 육안 확인.
4. **Git 규칙** — `git add -A` 금지, 변경 파일만 명시적 add, Co-Authored-By 포함, `--no-verify` 금지.
5. **DESIGN.md가 진리** — 색상/폰트/레이아웃 값은 `DESIGN.md` 참조. 이 플랜의 값과 충돌하면 `DESIGN.md` 우선.

---

## File Structure

### 신규 파일 (Create)
| 경로 | 책임 |
|------|------|
| `src/components/ui/section-marker.tsx` | `I. Title — date` 패턴 재사용 컴포넌트 |
| `src/components/ui/wordmark.tsx` | `PORTAL` tracked caps 워드마크 |
| `src/app/about/page.tsx` | About 페이지 (정적 에세이) |
| `src/app/archive/page.tsx` | Archive 페이지 (최근 analyses 리스트) |
| `src/app/archive/page.test.tsx` | Archive 스모크 테스트 |

### 수정 파일 (Modify)
| 경로 | 변경 범위 |
|------|----------|
| `src/app/globals.css` | 토큰 교체 (cream/ink/stone/line/ink-muted), light 테마 활성화, industrial-grid/corner-brackets/scan-line 제거 |
| `src/app/layout.tsx` | Roboto/Roboto_Mono → Pretendard Variable, html에 `light` class |
| `src/app/page.tsx` | main padding, industrial-grid className 제거, "Q&A Agent · Beta" pill + kbd tip 수정 |
| `src/components/layout/header.tsx` | PORTAL wordmark, Index/Archive/About/EN 4항목 nav, flags/UserCircle 제거 |
| `src/components/layout/footer.tsx` | 간소화 (PORTAL · 저작권 한 줄) |
| `src/components/analysis/analyzing-view.tsx` | Portal Warp 파티클 제거 → 숫자 + line 미니멀 |
| `src/app/_qa/agent-progress.tsx` | 4 bars + "01/04" 숫자 스타일 |
| `src/app/_qa/step-input.tsx` | B1 — 헤드라인 H1, 크림 배경, 모노 step label 제거 |
| `src/app/_qa/step-attributes.tsx` | B2 — 2×2 item grid, ink 락 칩 |
| `src/app/_qa/step-refine.tsx` | B3 — 슬라이더 · 가격 · 이유 칩 |
| `src/app/_qa/step-results.tsx` | B4 — 3-col 상품 그리드 · LOCK 칩 · 미니멀 카드 · inline 빈 상태 |

### 이동/이름변경 (Rename)
없음.

### 삭제 (Delete)
| 경로 | 이유 |
|------|------|
| `globals.css` 내 `.industrial-grid`, `.corner-brackets`, `.animate-scan-line` 유틸리티 | 더 이상 참조하지 않음 (Phase 0 마지막에 제거 확인) |

---

## Phase 0: Foundation — 폰트 + 토큰 시스템 교체

**목표:** 전역 크림/잉크 팔레트와 Pretendard가 모든 하위 컴포넌트에 자동 적용되게 한다. 이 Phase가 끝나면 기존 다크 UI가 전부 깨져 보이는 게 정상 — 다음 Phase들에서 순차 복구.

### Task 0.1: Pretendard Variable 로드

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: layout.tsx 헤더 import 교체**

기존 `Roboto`, `Roboto_Mono` import 전부 제거. `next/font/google`은 Pretendard 미지원이므로 `<link rel="stylesheet">`로 CDN 로드.

`src/app/layout.tsx` 전체 교체:

```tsx
import type {Metadata} from "next"
import {Analytics} from "@vercel/analytics/next"
import {ThemeProvider} from "@/components/admin/theme-provider"
import {LocaleProvider} from "@/lib/i18n"
import {Toaster} from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "PORTAL — The look you love, piece by piece.",
  description:
    "Upload a photograph or describe a mood. We return every piece that could belong.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="light h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider>
          <LocaleProvider>
            {children}
          </LocaleProvider>
        </ThemeProvider>
        <Toaster richColors position="bottom-right" />
        <Analytics />
      </body>
    </html>
  )
}
```

주의: `className="light"`를 html 루트에 추가 — 기존 globals.css의 `.light` 셀렉터 활성화 트릭은 쓰지 않고, Phase 0.2에서 `:root`를 아예 cream/ink로 교체한다.

- [ ] **Step 2: dev server 기동 확인**

```bash
cd /Users/hansangho/Desktop/fashion-ai
pnpm dev
```

Expected: 컴파일 성공. 브라우저 http://localhost:3400 — 레이아웃 깨짐 OK (다음 태스크에서 수정).

### Task 0.2: globals.css 토큰 교체

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: `globals.css` 전체 교체**

기존 Roboto/Roboto_Mono 관련 `--font-sans`/`--font-mono` 변수 제거하고 Pretendard 폴백으로 교체. 다크 테마 `:root` 값을 cream/ink로 교체. industrial-grid / corner-brackets / scan-line 유틸리티 제거.

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-sans);
  --font-heading: var(--font-sans);

  /* Editorial tokens */
  --color-cream: var(--cream);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-stone: var(--stone);
  --color-line: var(--line);
  --color-line-mute: var(--line-mute);
  --color-ink-soft: var(--ink-soft);
  --color-ink-quiet: var(--ink-quiet);

  /* shadcn defaults (kept for admin) */
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  /* Editorial palette */
  --cream: #fafaf7;
  --ink: #111111;
  --ink-muted: #3a3a3a;
  --stone: #7b7468;
  --line: #d8d4ca;
  --line-mute: #e0dcd0;
  --ink-soft: #666666;
  --ink-quiet: #888888;

  /* Base mapping (user-facing surfaces) */
  --background: var(--cream);
  --foreground: var(--ink);
  --primary: var(--ink);
  --primary-foreground: var(--cream);
  --secondary: var(--line-mute);
  --secondary-foreground: var(--ink);
  --card: var(--cream);
  --card-foreground: var(--ink);
  --popover: var(--cream);
  --popover-foreground: var(--ink);
  --muted: var(--line-mute);
  --muted-foreground: var(--stone);
  --accent: var(--line-mute);
  --accent-foreground: var(--ink);
  --destructive: oklch(0.577 0.245 27.325);
  --border: var(--line);
  --input: var(--line);
  --ring: var(--ink);

  /* Font stack — Pretendard via CDN */
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
    system-ui, sans-serif;

  /* Radius */
  --radius: 0.375rem;

  /* Charts (admin 전용 — 기존 값 유지) */
  --chart-1: #55B4A8;
  --chart-2: #A1A1AA;
  --chart-3: #71717A;
  --chart-4: #3D9B8F;
  --chart-5: #27272A;

  /* Sidebar (admin 전용) */
  --sidebar: #18181B;
  --sidebar-foreground: #FAFAFA;
  --sidebar-primary: #55B4A8;
  --sidebar-primary-foreground: #09090B;
  --sidebar-accent: #55B4A818;
  --sidebar-accent-foreground: #FAFAFA;
  --sidebar-border: #27272A;
  --sidebar-ring: #55B4A8;
}

/* Admin은 기존 다크 유지 — .dark 클래스를 /admin 레이아웃에서 적용 */
.dark {
  --background: #09090B;
  --foreground: #FAFAFA;
  --primary: #FFFFFF;
  --primary-foreground: #09090B;
  --secondary: #27272A;
  --secondary-foreground: #FAFAFA;
  --card: #18181B;
  --card-foreground: #FAFAFA;
  --popover: #18181B;
  --popover-foreground: #FAFAFA;
  --muted: #27272A;
  --muted-foreground: #A1A1AA;
  --accent: #27272A;
  --accent-foreground: #FAFAFA;
  --border: #27272A;
  --input: #27272A;
  --ring: #FFFFFF;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "ss01", "ss02", "kern";
  }
  html {
    @apply font-sans;
  }
}
```

**중요:** Admin은 `/admin/layout.tsx`가 별도 다크 테마를 쓰고 있으므로 `.dark` 클래스가 여전히 필요하다. Phase 0.2 끝나고 `/admin` 접속해 깨지지 않는지 육안 확인.

- [ ] **Step 2: admin 다크 유지 확인**

`src/app/admin/` 디렉토리의 layout 파일들에 `.dark` 클래스가 적용되는지 확인:

```bash
grep -r "className.*dark" /Users/hansangho/Desktop/fashion-ai/src/app/admin/ | head -5
```

없으면 Task 0.4에서 admin 레이아웃에 `className="dark"` 명시적 추가. 있으면 건드리지 않음.

- [ ] **Step 3: 브라우저 확인**

http://localhost:3400/ — 배경이 cream으로 바뀌었는지 확인 (기존 다크 UI가 거꾸로 뒤집혔을 것 — 텍스트가 안 보일 수도 있음. 정상).

http://localhost:3400/admin/login — 다크 테마 유지되는지 확인. 안 되면 Task 0.4 실행.

### Task 0.4: (Conditional) Admin 레이아웃에 .dark 명시

**조건:** Task 0.3에서 admin이 cream으로 바뀌어 깨진 경우에만 실행.

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: admin layout에 dark 클래스 추가**

```bash
cat /Users/hansangho/Desktop/fashion-ai/src/app/admin/layout.tsx
```

최상위 wrapper `<div>` 또는 `<main>`에 `className="dark"` 추가. 예:

```tsx
<div className="dark min-h-screen bg-background text-foreground">
  {children}
</div>
```

- [ ] **Step 2: 확인 + 커밋**

http://localhost:3400/admin 접속 후 다크 유지 확인.

### Task 0.5: Foundation 커밋

- [ ] **Step 1: 변경 파일만 stage 후 커밋**

```bash
git status --short
git add src/app/globals.css src/app/layout.tsx
# Task 0.4 실행했으면 admin layout도
# git add src/app/admin/layout.tsx
git commit -m "$(cat <<'EOF'
feat(design): Pretendard + cream/ink 토큰 시스템 도입

- globals.css: cream/ink/stone/line 토큰 추가, :root를 에디토리얼 팔레트로
- layout.tsx: Roboto → Pretendard Variable (CDN)
- Admin은 .dark 클래스로 다크 테마 유지

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1: Design System Primitives

### Task 1.1: Wordmark 컴포넌트

**Files:**
- Create: `src/components/ui/wordmark.tsx`

- [ ] **Step 1: Wordmark 컴포넌트 작성**

```tsx
import Link from "next/link"
import {cn} from "@/lib/utils"

interface WordmarkProps {
  href?: string
  className?: string
  size?: "sm" | "md"
}

/**
 * PORTAL tracked caps wordmark.
 * DESIGN.md §4.1 참조. 데스크탑 16px, 모바일 14px.
 */
export function Wordmark({href = "/", className, size = "md"}: WordmarkProps) {
  const inner = (
    <span
      className={cn(
        "font-semibold text-ink uppercase tracking-[0.32em]",
        size === "md" ? "text-base" : "text-sm",
        className,
      )}
    >
      PORTAL
    </span>
  )

  if (!href) return inner
  return (
    <Link href={href} className="hover:opacity-70 transition-opacity">
      {inner}
    </Link>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
pnpm lint
```

Expected: lint 에러 없음 (또는 해당 파일 이슈만).

### Task 1.2: SectionMarker 컴포넌트

**Files:**
- Create: `src/components/ui/section-marker.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import {cn} from "@/lib/utils"

interface SectionMarkerProps {
  numeral: string      // "I.", "II.", "III."
  title: string        // "A look, broken into its parts"
  aside?: string       // "Preview" / date / etc.
  className?: string
}

/**
 * Roman numeral section marker. DESIGN.md §4.4.
 * border-top 1px #111 + padding-top 18px + margin-bottom 28px.
 */
export function SectionMarker({numeral, title, aside, className}: SectionMarkerProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between border-t border-ink pt-[18px] mb-7",
        className,
      )}
    >
      <span className="text-sm font-bold text-ink tracking-[-0.01em]">{numeral}</span>
      <span className="text-sm font-medium text-ink tracking-[-0.01em]">{title}</span>
      {aside ? (
        <span className="text-xs font-medium text-ink-quiet tracking-[-0.01em]">
          {aside}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/ui/wordmark.tsx src/components/ui/section-marker.tsx
git commit -m "$(cat <<'EOF'
feat(design): Wordmark + SectionMarker 프리미티브 추가

- Wordmark: PORTAL tracked caps (0.32em, weight 600)
- SectionMarker: I./II. 로마 숫자 + title + aside 3-column

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Chrome — Header + Footer

### Task 2.1: Header 재작성

**Files:**
- Modify: `src/components/layout/header.tsx`

- [ ] **Step 1: 전체 교체**

```tsx
"use client"

import Link from "next/link"
import {usePathname} from "next/navigation"
import {Wordmark} from "@/components/ui/wordmark"
import {cn} from "@/lib/utils"

const NAV = [
  {href: "/", label: "Index"},
  {href: "/archive", label: "Archive"},
  {href: "/about", label: "About"},
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 w-full z-50 bg-cream border-b border-line">
      <nav className="flex justify-between items-center px-12 md:px-14 py-5 max-w-[1280px] mx-auto">
        <Wordmark />
        <div className="flex items-center gap-[22px]">
          {NAV.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-[13px] font-medium tracking-[-0.01em] transition-colors",
                  isActive ? "text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            )
          })}
          <span className="text-[13px] font-medium text-ink-soft tracking-[-0.01em]">
            EN
          </span>
        </div>
      </nav>
    </header>
  )
}
```

주의: `LocaleProvider`의 `useLocale`은 여기서 쓰지 않음 (EN 전용). KR 토글은 다음 트랙.

- [ ] **Step 2: 브라우저 확인**

http://localhost:3400/ — 상단에 `PORTAL    Index · Archive · About · EN` 나타나고, cream 배경에 ink 텍스트.

### Task 2.2: Footer 간소화

**Files:**
- Modify: `src/components/layout/footer.tsx`

- [ ] **Step 1: 읽어서 현재 내용 파악 후 교체**

```bash
cat /Users/hansangho/Desktop/fashion-ai/src/components/layout/footer.tsx
```

`src/components/layout/footer.tsx` 전체 교체:

```tsx
export function Footer() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="max-w-[1280px] mx-auto px-12 md:px-14 py-6 flex justify-between items-baseline">
        <span className="text-xs font-medium text-ink-quiet tracking-[-0.01em]">
          © PORTAL · an index of garments
        </span>
        <span className="text-xs font-medium text-ink-quiet tracking-[-0.01em]">
          Seoul · Spring 2026
        </span>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/layout/header.tsx src/components/layout/footer.tsx
git commit -m "$(cat <<'EOF'
feat(design): Header/Footer 에디토리얼 재작성

- Header: PORTAL wordmark + Index/Archive/About/EN nav. 국기 이모지/UserCircle 제거
- Footer: 크림 배경, ink-quiet 2줄 카피라이트

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Home — Main Layout Shell + Step Input

Home(`/`)은 Q&A flow 전체 껍데기. `page.tsx`는 step state에 따라 step-* 컴포넌트를 렌더. 여기서는 main 래퍼 스타일과 "Q&A Agent · Beta" pill 제거, step-input 리스타일을 다룸.

### Task 3.1: page.tsx main 래퍼 정리

**Files:**
- Modify: `src/app/page.tsx` (라인 280 근처 `<main>` · 393–420 라인 근처 kbd hint)

- [ ] **Step 1: main 래퍼 className 교체**

`src/app/page.tsx` 277–280 라인 (`return` 이후 첫 `<main>`):

변경 전:
```tsx
<main className="flex-grow flex flex-col items-center px-6 pt-24 pb-12 relative overflow-x-hidden industrial-grid min-h-screen">
```

변경 후:
```tsx
<main className="flex-grow flex flex-col items-center px-6 md:px-14 pt-28 pb-12 relative min-h-screen">
```

변경점: `industrial-grid` 제거, `overflow-x-hidden` 제거, `px-6` → `px-6 md:px-14`, `pt-24` → `pt-28` (header와의 간격).

- [ ] **Step 2: "Q&A Agent · Beta" pill 제거**

386–397 라인:

변경 전:
```tsx
{state.step === "input" && !state.searching && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.3 }}
    className="mt-12 text-center"
  >
    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
      Q&amp;A Agent · Beta
    </p>
  </motion.div>
)}
```

변경 후: 전체 삭제 (주석도 제거). 편의를 위해 해당 블록 자리에:

```tsx
{/* Beta pill 제거 — 에디토리얼 톤은 UI 설명을 하지 않음 */}
```

(주석만 남긴다. 실제 `motion.div` 블록은 제거.)

- [ ] **Step 3: kbd hint 재스타일**

399–420 라인의 kbd 힌트 블록:

변경 전:
```tsx
{(state.step === "attributes" || state.step === "refine") && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.4 }}
    className="mt-8 flex items-center justify-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50"
  >
    <span className="hidden md:inline">
      <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-foreground">
        Enter
      </kbd>{" "}
      next
    </span>
    <span className="hidden md:inline opacity-50">·</span>
    <span className="hidden md:inline">
      <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-foreground">
        Esc
      </kbd>{" "}
      back
    </span>
  </motion.div>
)}
```

변경 후:
```tsx
{(state.step === "attributes" || state.step === "refine") && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.4 }}
    className="mt-8 hidden md:flex items-center justify-center gap-3 text-[11px] font-medium text-ink-quiet tracking-[-0.01em]"
  >
    <span>
      <kbd className="px-2 py-0.5 border border-line bg-cream text-ink text-[11px] font-medium">
        Enter
      </kbd>{" "}
      next
    </span>
    <span className="text-line">·</span>
    <span>
      <kbd className="px-2 py-0.5 border border-line bg-cream text-ink text-[11px] font-medium">
        Esc
      </kbd>{" "}
      back
    </span>
  </motion.div>
)}
```

- [ ] **Step 4: 브라우저 확인**

http://localhost:3400/ — 레이아웃 중앙에 빈 공간 + step-input (기존 스타일) 나타남. pill 없음. attributes step으로 진입해 kbd 스타일 확인.

### Task 3.2: step-input.tsx 재작성 (B1 screen)

**Files:**
- Modify: `src/app/_qa/step-input.tsx`

- [ ] **Step 1: 전체 교체**

기존 76라인 전체 교체:

```tsx
"use client"

import {motion} from "framer-motion"
import {SearchBar} from "@/components/search/search-bar"
import {type Gender, GenderSelector} from "@/components/upload/gender-selector"

interface StepInputProps {
  gender: Gender
  onGenderChange: (g: Gender) => void
  onSubmit: (data: { prompt?: string; file?: File }) => void
  error: string | null
  loading: boolean
  loadingLabel?: string
}

export function StepInput({
  gender,
  onGenderChange,
  onSubmit,
  error,
  loading,
  loadingLabel,
}: StepInputProps) {
  return (
    <motion.div
      key="step-input"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[1024px] mx-auto pt-12 pb-8"
    >
      <div className="grid md:grid-cols-[1.2fr_1fr] gap-10 md:gap-16 items-end">
        {/* Headline */}
        <h1 className="text-[52px] md:text-[82px] font-medium text-ink tracking-[-0.045em] leading-[0.96]">
          The look you love,
          <br />
          <b className="font-bold">piece by piece.</b>
        </h1>

        {/* Caption + input */}
        <div className="pb-3">
          <p className="text-[15px] font-normal text-ink-muted leading-[1.55] tracking-[-0.01em] max-w-[360px]">
            Upload a photograph or describe a mood. We read the outfit — fabric, cut,
            proportion — and return <b className="font-semibold text-ink">every piece
            that could belong</b>.
          </p>

          {error && (
            <p className="mt-4 text-[13px] font-medium text-destructive">{error}</p>
          )}

          <div className="mt-8">
            <SearchBar
              gender={gender}
              onGenderChange={onGenderChange}
              onSubmit={onSubmit}
              disabled={loading}
            />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <GenderSelector value={gender} onChange={onGenderChange} />
            {loading && loadingLabel && (
              <p className="text-[11px] font-medium text-ink-quiet tracking-[-0.01em] animate-pulse">
                {loadingLabel}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
```

**알림:** `SearchBar`와 `GenderSelector`는 기존 스타일이라 이 화면 안에서 혼자 튈 수 있음 — Phase 3.3에서 최소 패치.

- [ ] **Step 2: 브라우저 확인**

http://localhost:3400/ — 에디토리얼 헤드라인 "The look you love, **piece by piece.**" + 오른쪽 캡션+입력 보여야 함. SearchBar 자체는 아직 다크 톤일 수 있음.

### Task 3.3: SearchBar 최소 패치 (cream 배경 조화)

**Files:**
- Modify: `src/components/search/search-bar.tsx` (라인별 부분 수정, 337 라인 파일 전체는 건드리지 않음)

- [ ] **Step 1: 현재 파일 확인**

```bash
cat /Users/hansangho/Desktop/fashion-ai/src/components/search/search-bar.tsx | head -60
```

주요 수정 포인트: 최상위 wrapper의 `bg-*`, `border-*` 클래스를 cream/line 토큰 기반으로 교체.

- [ ] **Step 2: 구체적 수정**

`src/components/search/search-bar.tsx`에서 다음 패턴을 찾아 수정:

| 기존 | 변경 |
|------|------|
| `bg-card` / `bg-muted` / `bg-background` (입력 영역) | `bg-cream` 또는 제거 (border만) |
| `border-border` | `border-line` |
| `text-foreground` | `text-ink` |
| `text-muted-foreground` | `text-ink-quiet` 또는 `text-stone` |
| `placeholder:text-muted-foreground` | `placeholder:text-ink-quiet` |
| `rounded-*` (`rounded-lg`, `rounded-xl` 등 굵은 것) | `rounded-none` 또는 더 작게 (`rounded-sm`) |

**중요:** 전체 로직/구조 바꾸지 말고 className만 교체. placeholder 텍스트는 유지하되 "Describe a mood, or drop a photograph"로 통일하고 싶으면 해당 i18n 키도 확인.

Grep으로 변경 범위 확인:

```bash
grep -n "bg-card\|bg-muted\|border-border\|text-foreground\|text-muted-foreground\|rounded-" /Users/hansangho/Desktop/fashion-ai/src/components/search/search-bar.tsx
```

각 줄 수동으로 확인하며 Editorial 토큰으로 교체. 20~40개 수정 예상.

- [ ] **Step 3: 브라우저 확인**

http://localhost:3400/ — SearchBar가 cream 배경과 자연스럽게 어울림 (밝은 배경 + ink 테두리 + ink placeholder).

### Task 3.4: GenderSelector 최소 패치

**Files:**
- Modify: `src/components/upload/gender-selector.tsx`

- [ ] **Step 1: 파일 읽고 동일 패턴으로 수정**

```bash
cat /Users/hansangho/Desktop/fashion-ai/src/components/upload/gender-selector.tsx
```

Task 3.3과 동일한 치환 패턴 적용. 선택된 버튼: `bg-ink text-cream`, 비선택: `text-ink-soft border-line`.

- [ ] **Step 2: Phase 3 커밋**

```bash
git add src/app/page.tsx src/app/_qa/step-input.tsx src/components/search/search-bar.tsx src/components/upload/gender-selector.tsx
git commit -m "$(cat <<'EOF'
feat(design): Home hero + step-input 에디토리얼 리스타일

- page.tsx: industrial-grid 제거, main padding 조정, Beta pill 제거
- step-input: 헤드라인 "The look you love, piece by piece." + asymmetric 1.2fr:1fr grid
- SearchBar/GenderSelector: cream/ink 토큰으로 최소 치환

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: AnalyzingView (A2)

### Task 4.1: AnalyzingView 전체 재작성

**Files:**
- Modify: `src/components/analysis/analyzing-view.tsx`

- [ ] **Step 1: 기존 파일 읽고 props 인터페이스 파악**

```bash
head -30 /Users/hansangho/Desktop/fashion-ai/src/components/analysis/analyzing-view.tsx
```

Props: `{imageUrl, promptText, progress, progressLabel}` — 이 인터페이스는 유지.

- [ ] **Step 2: 전체 교체**

`src/components/analysis/analyzing-view.tsx`:

```tsx
"use client"

import Image from "next/image"
import {motion} from "framer-motion"

interface AnalyzingViewProps {
  imageUrl: string
  promptText: string
  progress: number          // 0–100
  progressLabel: string
}

/**
 * A2 — 에디토리얼 로딩 화면. DESIGN.md §9 A2.
 * 큰 숫자 percent + 얇은 progress line. 파티클/스캔라인 없음.
 */
export function AnalyzingView({imageUrl, promptText, progress, progressLabel}: AnalyzingViewProps) {
  return (
    <motion.div
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      transition={{duration: 0.4}}
      className="w-full max-w-[640px] mx-auto pt-16 pb-8 flex flex-col items-center text-center gap-4"
    >
      {/* 유저 이미지(있으면) 작게 표시 */}
      {imageUrl && (
        <div className="relative w-[120px] h-[150px] mb-2">
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover grayscale"
            unoptimized
          />
        </div>
      )}

      {/* 프롬프트 텍스트 (있으면) */}
      {promptText && (
        <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] max-w-[320px] line-clamp-2">
          &ldquo;{promptText}&rdquo;
        </p>
      )}

      {/* Percent — 크게 */}
      <div className="text-[96px] font-light text-ink leading-none tracking-[-0.06em] tabular-nums mt-2">
        {progress}
      </div>

      {/* 라벨 */}
      <p className="text-[13px] font-medium text-ink-muted tracking-[-0.01em] max-w-[360px]">
        {progressLabel || "Reading the look — fabric, cut, proportion."}
      </p>

      {/* Progress line */}
      <div className="w-full max-w-[320px] h-px bg-line-mute mt-6 relative">
        <motion.div
          className="absolute left-0 top-0 h-full bg-ink"
          initial={{width: "0%"}}
          animate={{width: `${progress}%`}}
          transition={{duration: 0.4, ease: "easeOut"}}
        />
      </div>
    </motion.div>
  )
}
```

**제거된 것:** Portal Warp 파티클 애니메이션, 플로팅 키워드, 스캔 라인 — 전부 삭제.

- [ ] **Step 3: 브라우저 확인**

홈에서 이미지 업로드 + 전송 → 분석 중 화면이 숫자 중심으로 나타나는지.

- [ ] **Step 4: 커밋**

```bash
git add src/components/analysis/analyzing-view.tsx
git commit -m "$(cat <<'EOF'
feat(design): AnalyzingView 에디토리얼 재작성

Portal Warp 파티클 → 숫자 percent + 얇은 progress line.
기존 props 인터페이스 유지.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: AgentProgress (공통 4-step 인디케이터)

### Task 5.1: AgentProgress 재작성

**Files:**
- Modify: `src/app/_qa/agent-progress.tsx`

- [ ] **Step 1: 전체 교체**

```tsx
"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {type AgentStep} from "./types"

const STEPS: {id: AgentStep; label: string}[] = [
  {id: "input", label: "Reference"},
  {id: "attributes", label: "Lock"},
  {id: "refine", label: "Refine"},
  {id: "results", label: "Results"},
]

interface AgentProgressProps {
  current: AgentStep
  onStepClick?: (step: AgentStep) => void
}

/**
 * DESIGN.md §4.8 — 4 얇은 bar + "01 / 04" 숫자.
 * 완료 #111, 미완료 #d8d4ca.
 */
export function AgentProgress({current, onStepClick}: AgentProgressProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === current)

  return (
    <div className="w-full max-w-[640px] mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-medium text-ink-quiet tracking-[-0.01em] tabular-nums">
          {String(currentIdx + 1).padStart(2, "0")}
        </span>

        <div className="flex-1 flex items-center gap-[3px]">
          {STEPS.map((s, i) => {
            const isActive = i === currentIdx
            const isPast = i < currentIdx
            const clickable = isPast && onStepClick
            return (
              <button
                key={s.id}
                type="button"
                onClick={clickable ? () => onStepClick(s.id) : undefined}
                disabled={!clickable}
                aria-current={isActive ? "step" : undefined}
                aria-label={
                  isActive
                    ? `Current step: ${s.label}`
                    : isPast
                      ? `Go back to ${s.label}`
                      : `${s.label} — complete previous steps to access`
                }
                className={cn(
                  "relative flex-1 h-[1.5px] transition-colors",
                  isActive || isPast ? "bg-ink" : "bg-line",
                  clickable && "cursor-pointer hover:opacity-80",
                )}
              >
                {isPast && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 bg-ink"
                    initial={{scaleX: 0, originX: 0}}
                    animate={{scaleX: 1}}
                    transition={{duration: 0.3}}
                  />
                )}
              </button>
            )
          })}
        </div>

        <span className="text-[11px] font-medium text-ink-quiet tracking-[-0.01em] tabular-nums">
          {String(STEPS.length).padStart(2, "0")}
        </span>
      </div>

      {/* 현재 step label */}
      <div className="mt-3 text-center">
        <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-ink">
          {STEPS[currentIdx]?.label}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 브라우저 확인**

각 step으로 이동 (이미지 업로드 → attributes → refine → results) 하며 bar 채워지는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/app/_qa/agent-progress.tsx
git commit -m "$(cat <<'EOF'
feat(design): AgentProgress 4-bar + 01/04 숫자 인디케이터

원형 숫자 + 점선 → 얇은 bar 4개 + 양끝 "01"/"04" 숫자 + 아래 현재 스텝 라벨.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Step 2 — Attributes (B2 screen)

### Task 6.1: step-attributes.tsx 재작성

**Files:**
- Modify: `src/app/_qa/step-attributes.tsx`

- [ ] **Step 1: 현재 파일 읽기**

```bash
cat /Users/hansangho/Desktop/fashion-ai/src/app/_qa/step-attributes.tsx
```

Props 인터페이스 파악: `{imageUrl, items, selectedItemId, lockedAttrs, onSelectItem, onToggleLock, onBack, onNext}`.

- [ ] **Step 2: 재작성 전략**

현재 파일(278 라인)은 복잡함 (item 카드 + lock 칩 + 섹션 마커). 핵심:
1. 섹션 마커 `I. Which piece holds the feeling?` 추가
2. items를 2-col grid (또는 items.length ≤ 3이면 자동 조절)로 표시
3. 각 item 카드: 이미지(정사각) + name + 3-5개 attribute 칩 (클릭 시 락 토글)
4. 선택된 item: `border-2 border-ink`, 비선택: `border border-line`
5. 락된 칩: `bg-ink text-cream`, 비선택: `text-ink-soft border-line`
6. 하단 action bar: `Back` (secondary) + `Continue — {n} locked` (primary, disabled if locked < 1)

전체 교체. 현재 파일 구조를 참고하되 위 규칙으로 재작성. 상단에 import 유지 (`framer-motion`, `lucide-react` 등). 파일 통째로 재작성할 때 아래 테마 참조:

```tsx
// step-attributes.tsx 교체 (요약 구조)
"use client"
import {motion} from "framer-motion"
import Image from "next/image"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {ATTR_LABELS, LOCKABLE_ATTRS, MAX_LOCKED_ATTRS, type AnalyzedItem, type LockableAttr} from "./types"

interface StepAttributesProps {
  imageUrl: string
  items: AnalyzedItem[]
  selectedItemId: string | null
  lockedAttrs: LockableAttr[]
  onSelectItem: (id: string) => void
  onToggleLock: (attr: LockableAttr) => void
  onBack: () => void
  onNext: () => void
}

export function StepAttributes({
  imageUrl, items, selectedItemId, lockedAttrs,
  onSelectItem, onToggleLock, onBack, onNext,
}: StepAttributesProps) {
  const selected = items.find((i) => i.id === selectedItemId) ?? items[0]
  const canAdvance = lockedAttrs.length > 0 && lockedAttrs.length <= MAX_LOCKED_ATTRS

  // 각 item에서 실제 채워진 속성만 노출
  const attrsFor = (item: AnalyzedItem) =>
    LOCKABLE_ATTRS.filter((a) => typeof item[a as keyof AnalyzedItem] === "string" && item[a as keyof AnalyzedItem])

  return (
    <motion.div
      key="step-attributes"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[960px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="II." title="Which piece holds the feeling?" aside="Step 2" />

      <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] mb-8 max-w-[520px]">
        Pick one piece. Lock 1–2 attributes to anchor the search.
        You can choose up to {MAX_LOCKED_ATTRS}.
      </p>

      {/* Items grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {items.map((item) => {
          const isSel = item.id === selected?.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item.id)}
              className={cn(
                "group text-left p-3 transition-colors",
                isSel ? "border-2 border-ink" : "border border-line hover:border-ink-soft",
              )}
            >
              <div className="relative aspect-square bg-line-mute overflow-hidden mb-3">
                {imageUrl && (
                  <Image src={imageUrl} alt="" fill className="object-cover" unoptimized />
                )}
              </div>
              <div className="text-[14px] font-semibold text-ink tracking-[-0.02em]">
                {item.name || item.subcategory || item.category}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attrsFor(item).slice(0, 4).map((attr) => {
                  const val = item[attr as keyof AnalyzedItem] as string
                  return (
                    <span
                      key={attr}
                      className="text-[11px] font-medium text-ink-soft border border-line px-2 py-0.5 tracking-[-0.01em]"
                    >
                      {val}
                    </span>
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>

      {/* Lock chips for selected item */}
      {selected && (
        <div className="border-t border-line pt-6">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[13px] font-semibold text-ink tracking-[-0.01em]">
              Lock up to {MAX_LOCKED_ATTRS} attributes of{" "}
              <em className="font-medium italic">{selected.name || selected.subcategory}</em>
            </span>
            <span className="text-[11px] font-medium text-ink-quiet tabular-nums">
              {lockedAttrs.length} / {MAX_LOCKED_ATTRS}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {attrsFor(selected).map((attr) => {
              const val = selected[attr as keyof AnalyzedItem] as string
              const isLocked = lockedAttrs.includes(attr)
              const isDisabled = !isLocked && lockedAttrs.length >= MAX_LOCKED_ATTRS
              return (
                <button
                  key={attr}
                  type="button"
                  onClick={() => !isDisabled && onToggleLock(attr)}
                  disabled={isDisabled}
                  className={cn(
                    "text-[13px] font-medium px-3 py-1.5 border transition-colors tracking-[-0.01em]",
                    isLocked
                      ? "bg-ink text-cream border-ink"
                      : "border-line text-ink-soft hover:border-ink hover:text-ink",
                    isDisabled && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <span className="text-ink-quiet mr-1.5 text-[11px] uppercase tracking-[0.05em]">
                    {ATTR_LABELS[attr]}
                  </span>
                  <span>{val}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-12 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className={cn(
            "text-[13px] font-semibold px-5 py-2 border transition-colors tracking-[-0.01em]",
            canAdvance
              ? "bg-ink text-cream border-ink hover:opacity-85"
              : "border-line text-ink-quiet cursor-not-allowed",
          )}
        >
          Continue →
        </button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: 브라우저 확인**

홈 → 이미지 업로드 → 분석 완료 후 step 2 진입. item 2×2 grid + lock 칩 스타일 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/_qa/step-attributes.tsx
git commit -m "$(cat <<'EOF'
feat(design): step-attributes B2 재작성

SectionMarker II. · item 2-col grid · lock 칩 ink/cream.
기존 props 인터페이스 유지.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Step 3 — Refine (B3 screen)

### Task 7.1: step-refine.tsx 재작성

**Files:**
- Modify: `src/app/_qa/step-refine.tsx`

- [ ] **Step 1: 파일 읽기**

```bash
cat /Users/hansangho/Desktop/fashion-ai/src/app/_qa/step-refine.tsx
```

Props: `{tolerance, priceMin, priceMax, reason, onSetTolerance, onSetPrice, onSetReason, onBack, onNext}`.

- [ ] **Step 2: 전체 교체**

```tsx
"use client"

import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {type RefineReason} from "./types"

interface StepRefineProps {
  tolerance: number
  priceMin: number | null
  priceMax: number | null
  reason: RefineReason | null
  onSetTolerance: (value: number) => void
  onSetPrice: (min: number | null, max: number | null) => void
  onSetReason: (reason: RefineReason | null) => void
  onBack: () => void
  onNext: () => void
}

const REASONS: {id: RefineReason; label: string}[] = [
  {id: "price", label: "Price"},
  {id: "size", label: "Size"},
  {id: "variety", label: "Variety"},
  {id: "brand", label: "Brand"},
]

export function StepRefine({
  tolerance, priceMin, priceMax, reason,
  onSetTolerance, onSetPrice, onSetReason, onBack, onNext,
}: StepRefineProps) {
  const handleMin = (v: string) => {
    const n = v.trim() === "" ? null : Number(v.replace(/[^0-9]/g, ""))
    onSetPrice(Number.isFinite(n) ? (n as number) : null, priceMax)
  }
  const handleMax = (v: string) => {
    const n = v.trim() === "" ? null : Number(v.replace(/[^0-9]/g, ""))
    onSetPrice(priceMin, Number.isFinite(n) ? (n as number) : null)
  }

  return (
    <motion.div
      key="step-refine"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[640px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="III." title="Exact, or loose?" aside="Step 3" />

      {/* Style tolerance */}
      <div className="mb-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet mb-3">
          Style tolerance
        </div>
        <div className="relative h-[2px] bg-line-mute">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tolerance}
            onChange={(e) => onSetTolerance(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Style tolerance slider"
          />
          <div
            className="absolute h-[2px] bg-ink top-0 left-0"
            style={{width: `${tolerance * 100}%`}}
          />
          <div
            className="absolute w-3 h-3 bg-ink rounded-full -top-[5px]"
            style={{left: `calc(${tolerance * 100}% - 6px)`}}
          />
        </div>
        <div className="mt-3 flex justify-between text-[12px] font-medium text-ink-quiet tracking-[-0.01em]">
          <span className={cn(tolerance < 0.5 && "text-ink font-semibold")}>Tight</span>
          <span className={cn(tolerance > 0.5 && "text-ink font-semibold")}>Loose</span>
        </div>
      </div>

      {/* Price */}
      <div className="border-t border-line pt-6 mb-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet mb-3">
          Price (KRW, optional)
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-baseline border-b border-ink pb-2 gap-2">
            <span className="text-[11px] text-ink-quiet uppercase tracking-[0.08em] min-w-[28px]">Min</span>
            <input
              inputMode="numeric"
              placeholder="—"
              value={priceMin ?? ""}
              onChange={(e) => handleMin(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[15px] font-medium text-ink tabular-nums tracking-[-0.01em] placeholder:text-ink-quiet"
            />
          </label>
          <label className="flex items-baseline border-b border-ink pb-2 gap-2">
            <span className="text-[11px] text-ink-quiet uppercase tracking-[0.08em] min-w-[28px]">Max</span>
            <input
              inputMode="numeric"
              placeholder="—"
              value={priceMax ?? ""}
              onChange={(e) => handleMax(e.target.value)}
              className="flex-1 bg-transparent outline-none text-[15px] font-medium text-ink tabular-nums tracking-[-0.01em] placeholder:text-ink-quiet"
            />
          </label>
        </div>
      </div>

      {/* Reason */}
      <div className="border-t border-line pt-6 mb-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet mb-3">
          Why another?
        </div>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => {
            const isOn = reason === r.id
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSetReason(isOn ? null : r.id)}
                className={cn(
                  "text-[13px] font-medium px-4 py-1.5 border rounded-full transition-colors tracking-[-0.01em]",
                  isOn
                    ? "bg-ink text-cream border-ink"
                    : "border-line text-ink-soft hover:border-ink hover:text-ink",
                )}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-12 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
        >
          Find pieces →
        </button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: 브라우저 확인**

attributes → refine 진입. 슬라이더 드래그, 가격 입력, reason 칩 토글 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/_qa/step-refine.tsx
git commit -m "$(cat <<'EOF'
feat(design): step-refine B3 재작성

SectionMarker III. + 슬라이더(tight/loose) + 가격 2필드 + reason 4칩.
각 섹션 border-top으로 구획, 기존 props 인터페이스 유지.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: Step 4 — Results (B4 screen)

### Task 8.1: step-results.tsx 재작성

**Files:**
- Modify: `src/app/_qa/step-results.tsx`

- [ ] **Step 1: 파일 읽기**

```bash
cat /Users/hansangho/Desktop/fashion-ai/src/app/_qa/step-results.tsx
```

Props: `{imageUrl, selectedItem, lockedAttrs, products, searching, error, onRefineAgain, onUnlockAttr, onReset}`.

- [ ] **Step 2: 전체 교체**

```tsx
"use client"

import {motion} from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {ATTR_LABELS, type AgentProduct, type AnalyzedItem, type LockableAttr} from "./types"

interface StepResultsProps {
  imageUrl: string
  selectedItem: AnalyzedItem
  lockedAttrs: LockableAttr[]
  products: AgentProduct[]
  searching: boolean
  error: string | null
  onRefineAgain: () => void
  onUnlockAttr: (attr: LockableAttr) => void
  onReset: () => void
}

export function StepResults({
  selectedItem, lockedAttrs, products, searching, error,
  onRefineAgain, onUnlockAttr, onReset,
}: StepResultsProps) {
  const hasProducts = products.length > 0

  return (
    <motion.div
      key="step-results"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[1120px] mx-auto pt-8 pb-12"
    >
      <SectionMarker
        numeral="IV."
        title={
          hasProducts
            ? `${products.length} pieces, closely related.`
            : searching
              ? "Searching…"
              : "No matches — yet."
        }
        aside="Step 4"
      />

      {/* Locked attribute chips (현재 어떤 속성으로 좁혔는지) */}
      {lockedAttrs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-quiet">
            Locked:
          </span>
          {lockedAttrs.map((attr) => {
            const val = selectedItem[attr as keyof AnalyzedItem]
            return (
              <button
                key={attr}
                type="button"
                onClick={() => onUnlockAttr(attr)}
                className="text-[12px] font-medium bg-ink text-cream px-2.5 py-1 hover:opacity-80 transition-opacity tracking-[-0.01em]"
                aria-label={`Unlock ${ATTR_LABELS[attr]}`}
              >
                {ATTR_LABELS[attr]}: {String(val)} ×
              </button>
            )
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[13px] text-destructive mb-6">{error}</p>
      )}

      {/* Empty state */}
      {!searching && !hasProducts && !error && (
        <div className="py-16 text-center flex flex-col items-center gap-4">
          <p className="text-[15px] text-ink-muted max-w-[360px]">
            Try loosening the look or raising the price range.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Looser cut", "More color", "Raise budget"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={onRefineAgain}
                className="text-[12px] font-medium px-3 py-1 border border-ink text-ink hover:bg-ink hover:text-cream transition-colors tracking-[-0.01em]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Products grid */}
      {hasProducts && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((p, idx) => (
            <ProductCard key={`${p.link}-${idx}`} product={p} lockVisible={lockedAttrs.length > 0} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-12 flex items-center justify-between border-t border-line pt-6">
        <button
          type="button"
          onClick={onReset}
          className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
        >
          Start again
        </button>
        <button
          type="button"
          onClick={onRefineAgain}
          className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
        >
          Refine again →
        </button>
      </div>
    </motion.div>
  )
}

function ProductCard({product, lockVisible}: {product: AgentProduct; lockVisible: boolean}) {
  return (
    <Link
      href={product.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <div className="relative aspect-[4/5] bg-line-mute overflow-hidden mb-2">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.title ?? product.brand}
            fill
            sizes="(max-width:768px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-quiet text-xs">
            —
          </div>
        )}
        {lockVisible && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold text-ink bg-cream px-1.5 py-0.5 tracking-[0.1em]">
            LOCK
          </span>
        )}
        {/* Hover overlay: 매칭 이유 (있으면) */}
        {product.matchReasons && product.matchReasons.length > 0 && (
          <div
            className={cn(
              "absolute inset-0 bg-ink/80 flex items-end p-3 opacity-0",
              "group-hover:opacity-100 transition-opacity duration-200",
            )}
          >
            <div className="flex flex-wrap gap-1">
              {product.matchReasons.slice(0, 3).map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] font-medium text-cream bg-transparent border border-cream/60 px-2 py-0.5 tracking-[-0.01em]"
                >
                  {r.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="text-[13px] font-semibold text-ink tracking-[-0.02em] line-clamp-1">
        {product.brand}
      </div>
      <div className="text-[12px] font-medium text-ink-soft tracking-[-0.01em] tabular-nums">
        {product.price}
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: 브라우저 확인**

전체 플로우 (upload → attributes → refine → results)로 step 4 진입. 상품 그리드, LOCK 칩, hover 오버레이, empty state 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/_qa/step-results.tsx
git commit -m "$(cat <<'EOF'
feat(design): step-results B4 재작성

SectionMarker IV. · 3-4 col 상품 그리드 · LOCK 칩 · hover 매칭 이유 오버레이.
브랜드+가격만 기본 노출 (lean 원칙). inline empty state 포함.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: 신규 라우트 — About + Archive

### Task 9.1: About 페이지

**Files:**
- Create: `src/app/about/page.tsx`

- [ ] **Step 1: 정적 페이지 작성**

```tsx
import type {Metadata} from "next"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {SectionMarker} from "@/components/ui/section-marker"

export const metadata: Metadata = {
  title: "PORTAL — About",
  description:
    "PORTAL reads the look inside a photograph — fabric, cut, proportion — and returns the wardrobe behind it.",
}

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="flex-grow px-6 md:px-14 pt-28 pb-20 min-h-screen">
        <div className="max-w-[640px] mx-auto">
          <SectionMarker numeral="I." title="What it is" aside="PORTAL / 2026" />

          <h1 className="text-[52px] md:text-[72px] font-medium text-ink tracking-[-0.045em] leading-[0.96] mb-12">
            Read the look.
            <br />
            <b className="font-bold">Return the pieces.</b>
          </h1>

          <div className="space-y-5 text-[15px] font-normal text-ink-muted leading-[1.65] tracking-[-0.01em]">
            <p>
              PORTAL takes a single image — a photograph, an editorial, a screenshot —
              and reads the outfit inside it. Fabric, cut, proportion, the weather it
              belongs to.
            </p>
            <p>
              Then it returns the wardrobe behind it, drawn from a quiet index of
              ateliers. You lock what matters, loosen what does not, and the search
              narrows to what could belong.
            </p>
          </div>

          <div className="mt-14 pt-6 border-t border-line grid grid-cols-3 gap-6 text-[13px] font-medium tracking-[-0.01em]">
            <div>
              <div className="text-ink-quiet text-[11px] uppercase tracking-[0.1em] mb-1">Index</div>
              <div className="text-ink font-semibold">22 ateliers</div>
            </div>
            <div>
              <div className="text-ink-quiet text-[11px] uppercase tracking-[0.1em] mb-1">Located</div>
              <div className="text-ink font-semibold">Seoul</div>
            </div>
            <div>
              <div className="text-ink-quiet text-[11px] uppercase tracking-[0.1em] mb-1">Season</div>
              <div className="text-ink font-semibold">Spring 2026</div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: 브라우저 확인**

http://localhost:3400/about — 에세이 레이아웃 표시.

### Task 9.2: Archive 페이지 (최근 analyses 리스트)

**Files:**
- Create: `src/app/archive/page.tsx`

- [ ] **Step 1: 현재 analyses 스키마 확인**

```bash
grep -l "analyses" /Users/hansangho/Desktop/fashion-ai/src/lib/supabase*.ts
```

`supabase` 서버 클라이언트로 `analyses` 테이블에서 최근 20개 읽기. 스키마 확인:

```bash
grep -A 20 "analyses" /Users/hansangho/Desktop/fashion-ai/supabase/migrations/*.sql | head -60
```

- [ ] **Step 2: Archive 페이지 RSC 작성**

```tsx
import type {Metadata} from "next"
import Image from "next/image"
import {supabaseServer} from "@/lib/supabase"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {SectionMarker} from "@/components/ui/section-marker"

export const metadata: Metadata = {
  title: "PORTAL — Archive",
}

interface AnalysisRow {
  id: string
  created_at: string
  image_url: string | null
  prompt_text: string | null
  style_node: {primary?: string} | null
}

async function fetchRecent(): Promise<AnalysisRow[]> {
  try {
    const {data} = await supabaseServer
      .from("analyses")
      .select("id, created_at, image_url, prompt_text, style_node")
      .order("created_at", {ascending: false})
      .limit(20)
    return (data ?? []) as AnalysisRow[]
  } catch {
    return []
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {month: "short", day: "numeric"})
}

export default async function ArchivePage() {
  const rows = await fetchRecent()

  return (
    <>
      <Header />
      <main className="flex-grow px-6 md:px-14 pt-28 pb-20 min-h-screen">
        <div className="max-w-[880px] mx-auto">
          <SectionMarker
            numeral="I."
            title="A look, archived"
            aside={`${rows.length} entries`}
          />

          {rows.length === 0 ? (
            <p className="text-[15px] text-ink-muted">Nothing archived yet.</p>
          ) : (
            <ul className="border-t border-ink">
              {rows.map((row, idx) => (
                <li
                  key={row.id}
                  className="grid grid-cols-[32px_56px_1fr_80px] items-center gap-4 py-4 border-b border-line"
                >
                  <span className="text-[12px] font-medium text-ink-quiet tabular-nums">
                    {String(idx + 1).padStart(3, "0")}
                  </span>
                  <div className="relative w-[56px] h-[72px] bg-line-mute overflow-hidden">
                    {row.image_url && (
                      <Image
                        src={row.image_url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover grayscale"
                        unoptimized
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink tracking-[-0.02em] truncate">
                      {row.prompt_text?.trim() || row.style_node?.primary || "Untitled look"}
                    </div>
                    <div className="text-[12px] font-medium text-ink-quiet tracking-[-0.01em] mt-0.5">
                      {row.style_node?.primary ?? "—"}
                    </div>
                  </div>
                  <span className="text-[12px] font-medium text-ink-quiet tabular-nums text-right tracking-[-0.01em]">
                    {formatDate(row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
```

**주의:** `supabaseServer`의 실제 export 이름은 코드베이스에 따라 다를 수 있음. Task 9.2 Step 1에서 정확히 확인 후 import.

- [ ] **Step 3: 스모크 테스트 추가**

**Files:**
- Create: `src/app/archive/page.test.tsx`

```tsx
import {describe, it, expect} from "vitest"
import ArchivePage from "./page"

describe("ArchivePage", () => {
  it("exports a default React component", () => {
    expect(typeof ArchivePage).toBe("function")
  })
})
```

- [ ] **Step 4: 테스트 실행**

```bash
pnpm exec vitest run src/app/archive/page.test.tsx
```

Expected: 1 passed.

- [ ] **Step 5: 브라우저 확인**

http://localhost:3400/archive — 최근 분석 리스트가 보여야 (analyses 테이블에 데이터가 있다면).

- [ ] **Step 6: 커밋**

```bash
git add src/app/about/ src/app/archive/
git commit -m "$(cat <<'EOF'
feat(page): About + Archive 라우트 신규 추가

- /about: 에세이 톤 소개. 22 ateliers · Seoul · Spring 2026 메타.
- /archive: Supabase analyses 테이블 최근 20개 리스트. 번호 + 썸네일 + 제목 + 날짜.
- page.test.tsx: Archive RSC 스모크 테스트.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Phase 10: 반응형 + 최종 정리

### Task 10.1: 모바일 반응형 검증

- [ ] **Step 1: 각 화면 모바일 뷰 확인 (<768px)**

브라우저 DevTools로 iPhone 14 Pro (393×852) 에뮬레이션 + 다음 체크리스트:

- [ ] `/` 홈: 헤드라인 세로 스택, 입력 아래로
- [ ] Analyzing: 중앙 정렬 유지
- [ ] Attributes (B2): items grid 1-col로 붕괴
- [ ] Refine (B3): 가격 2필드는 2-col 유지, 슬라이더 풀폭
- [ ] Results (B4): 상품 2-col
- [ ] About: 1-col 유지
- [ ] Archive: 리스트 row 그대로

- [ ] **Step 2: 필요 시 반응형 수정**

대부분 `max-w-*` + `grid-cols-1 sm:grid-cols-2`로 이미 대응됨. 특히 체크:

- step-input: `grid md:grid-cols-[1.2fr_1fr]` → 모바일에서 자동 1-col ✓
- step-results: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` ✓

이상 있으면 해당 파일만 수정.

### Task 10.2: 레거시 CSS 정리

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 잔존 유틸리티 사용처 확인**

```bash
grep -rn "industrial-grid\|corner-brackets\|animate-scan-line" /Users/hansangho/Desktop/fashion-ai/src/
```

`/admin` 이외에서는 사용 없어야 함.

- [ ] **Step 2: (Phase 0에서 이미 제거됐는지 확인)**

Phase 0.2에서 교체한 `globals.css`에는 이 유틸리티들이 이미 포함돼 있지 않음. 추가로 삭제할 것 없으면 skip.

### Task 10.3: lint + build

- [ ] **Step 1: lint**

```bash
pnpm lint
```

Expected: 0 errors, 0 warnings (혹은 기존 무관한 warning만).

- [ ] **Step 2: build**

```bash
pnpm build
```

Expected: 성공. TypeScript 에러 없어야 함.

- [ ] **Step 3: 기존 vitest 회귀 확인**

```bash
pnpm exec vitest run
```

Expected: 모든 기존 테스트 통과. Archive 스모크 테스트 추가로 통과.

### Task 10.4: 최종 수동 QA 체크리스트

- [ ] **Step 1: 전체 플로우 수동 확인**

체크리스트 (http://localhost:3400):
- [ ] 홈에서 이미지 업로드 → 분석 진행 → B2 진입 성공
- [ ] B2에서 item 선택 + attr 2개 락 → Continue 활성화
- [ ] B3에서 슬라이더/가격/이유 조작 → Find pieces
- [ ] B4 상품 그리드 로드 → LOCK 칩 표시 → hover 시 매칭 이유 오버레이
- [ ] B4에서 lock 칩 클릭 (unlock) → 재검색 트리거
- [ ] Refine again → B3 상태 유지
- [ ] Start again → B1 초기화
- [ ] /about 정상 렌더
- [ ] /archive 최근 분석 리스트 렌더
- [ ] /admin 접속 → 다크 테마 유지, 동작 무손상
- [ ] 모바일 뷰 (<768px) 주요 화면 확인

### Task 10.5: 최종 커밋 + PR

- [ ] **Step 1: 남은 변경사항 확인**

```bash
git status --short
git log --oneline origin/dev..HEAD
```

Phase 0–9에서 나온 커밋들이 순서대로 있어야 함.

- [ ] **Step 2: PR 생성 (feature-finalize 워크플로우)**

**중요:** 이 프로젝트는 `feature-finalize` 워크플로우 필수 (memory: `feedback_feature_finalize_workflow.md`). 직접 main/dev 머지 금지.

PR 생성:

```bash
git push -u origin feature/editorial-redesign

gh pr create --base dev --title "feat(design): 에디토리얼 전면 리디자인 (PORTAL · Pretendard · cream/ink)" --body "$(cat <<'EOF'
## Summary

- 에디토리얼 톤으로 유저-facing UI 전면 리디자인 (12 스크린)
- PORTAL tracked caps 워드마크, Pretendard Variable 단일 패밀리, cream #fafaf7 + ink #111 팔레트
- Q&A Agent 4-step UI 전면 재스타일 (props 인터페이스 무변경)
- About / Archive 신규 라우트 추가
- Admin은 `.dark` 클래스로 다크 테마 유지, 로직/API/DB 무변경

## Test plan

- [ ] 홈 → 이미지 업로드 → B2 → B3 → B4 전체 플로우
- [ ] lock/unlock 토글 → 재검색 정상 동작
- [ ] Refine again / Start again
- [ ] /about 렌더
- [ ] /archive 최근 분석 20개 리스트
- [ ] /admin 다크 테마 유지 + 기능 무손상
- [ ] 모바일 뷰 (<768px) 주요 화면
- [ ] pnpm lint / pnpm build / pnpm exec vitest run 전부 통과

## References

- Spec: `docs/superpowers/specs/2026-04-13-editorial-redesign-design.md`
- DESIGN.md (루트)
- Handoff: `docs/HANDOFF-2026-04-13-editorial-redesign.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: 사용자에게 PR URL 전달 + 머지 대기**

PR URL 받으면 사용자 리뷰 후 squash merge. 머지는 사용자가 수행 (직접 하지 말 것).

---

## Self-Review Notes (플랜 작성 후 확인 완료)

- [x] **Spec coverage** — §1–11 전부 태스크로 분해됨. §12 open questions는 플랜에 다음과 같이 반영:
  - Q1 (A3 hotspot 제거) → Phase 해당 없음 (A3 = Result classic 라우트 자체 삭제됨, Q&A Step 4로 흡수)
  - Q2 (A2 simulated progress) → Task 4.1에서 유지
  - Q3 (nav Index/Archive/About/EN) → Task 2.1 구현
  - Q4 (About copy) → Task 9.1에서 초안 그대로 사용
  - Q5 (Archive 데이터 소스) → Task 9.2에서 `analyses` 테이블 최근 20개 (익명, 인증 X)
  - Q6 (Pretendard 서브셋) → Task 0.1에서 CDN 사용 (경량화는 별도 최적화 트랙)
  - Q7 (framer-motion) → 모든 step 컴포넌트에서 entrance motion 유지

- [x] **Placeholder scan** — TBD/TODO/"implement later" 없음. 모든 코드 블록 완전.

- [x] **Type consistency** — `StepInputProps`, `StepAttributesProps` 등 props 이름은 기존 파일과 일치. `AgentStep`, `LockableAttr`, `RefineReason`, `AnalyzedItem`, `AgentProduct` 전부 `src/app/_qa/types.ts` 기존 정의 사용.

- [x] **Scope** — 단일 프로젝트, presentation layer only. 분할 불필요.
