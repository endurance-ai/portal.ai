# portal.ai (fashion-ai)

AI 이미지 기반 패션 스타일 분석 & 크로스플랫폼 상품 추천 서비스 (POC)
"One photo. Every option." — 사진 한 장으로 룩 분해 + 크로스플랫폼 상품 검색

## 프로젝트 구조

```
src/app/              → App Router 페이지 & API Routes
src/app/api/analyze/  → GPT-4o-mini Vision 이미지 분석 + Supabase 로깅
src/app/api/search-products/ → SerpApi 상품 검색 + Supabase 로깅
src/components/       → UI 컴포넌트 (shadcn/ui 기반)
  layout/             → Header, Footer
  upload/             → UploadZone, StyleChips, GenderSelector
  analysis/           → AnalyzingView (progress bar + technical readout)
  result/             → LookBreakdown (accordion + hotspot + horizontal scroll)
src/lib/              → 유틸리티 (supabase.ts, utils.ts)
supabase/migrations/  → DB 스키마 (analyses 테이블)
docs/                 → 참조 문서, 디자인 시스템, 리서치
```

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 16 (App Router) | Turbopack, pnpm, port 3400 |
| UI | React 19, Tailwind 4, shadcn/ui | framer-motion 애니메이션 |
| 폰트 | Roboto + Roboto Mono | M3 기준 |
| 아이콘 | lucide-react | |
| 이미지 분석 | OpenAI GPT-4o-mini Vision | 건당 ~$0.003, max_tokens 1500, detail auto |
| 상품 검색 | 자체 DB (Fashion Genome) + SerpApi fallback | DB 우선, 부족 시 SerpApi |
| DB/로깅 | Supabase (PostgreSQL) | 분석 결과 + 검색 쿼리/결과 전체 로깅 |
| 배포 | Vercel | |

## 개발 명령어

```bash
pnpm dev          # 개발 서버 (localhost:3400)
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
```

## 디자인 시스템: B&W Minimal

- **테마**: Dark mode (`#09090B`) + White (`#FFFFFF`) accent — 컬러리스
- **텍스처**: 미니멀 그리드 (32px, 저투명도 흰색) + 코너 브래킷
- **M3 토큰**: `primary (#FFF)`, `foreground`, `card`, `border`, `muted-foreground`, `outline`, `on-surface-variant` 등
- **커스텀 토큰**: `primary-dim`, `primary-container`, `surface-dim`, `outline-focus`
- **디자인 철학**: 유저 이미지가 유일한 컬러 소스, UI는 뒤로 빠짐

## 코딩 컨벤션

- 컴포넌트: PascalCase, named export (`export default`는 page만)
- 경로 별칭: `@/*` → `src/*`
- shadcn/ui: `pnpm dlx shadcn@latest add <component>`
- CSS: M3 컬러 토큰 + 커스텀 유틸리티 (`.industrial-grid`, `.corner-brackets`, `.animate-scan-line`)
- 서버/클라이언트 분리: RSC 기본, 인터랙션 시 `"use client"`
- UI 텍스트: 영어 (해외 사이트 느낌)

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `src/app/page.tsx` | 메인 — 3-screen 상태 전환 + 스트리밍 UX (분석 즉시 결과, 상품 백그라운드) |
| `src/app/api/analyze/route.ts` | GPT-4o-mini Vision + 위치좌표 + Supabase insert + after() |
| `src/app/api/search-products/route.ts` | 자체 DB + SerpApi fallback + 스코어링 + Supabase update |
| `src/components/result/look-breakdown.tsx` | 결과 — sticky 이미지 + 핫스팟 + 아코디언 + 가로스크롤 상품 |
| `src/components/analysis/analyzing-view.tsx` | 분석 중 — progress bar + terminal readout |
| `src/components/upload/upload-zone.tsx` | 이미지 드래그 & 드롭 업로드 + 클라이언트 압축 (1280px, JPEG 0.8) |
| `src/lib/supabase.ts` | Supabase 서버 클라이언트 (service role) |
| `src/app/globals.css` | M3 테마 + B&W Minimal 토큰 |
| `supabase/migrations/001_create_analyses.sql` | analyses 테이블 스키마 |

## 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 이미지 → 룩 분해 | 각 아이템 개별 분석 + 이미지 내 위치좌표(%) |
| 무드 분석 | 태그 + score + vibe + season + occasion |
| 아이템 상세 | fit, fabric, color, detail, position 추출 |
| 성별 판단 | detectedGender → 검색 쿼리에 men/women 반영 |
| 상품 검색 | 자체 DB (스타일 노드 부스트) + SerpApi fallback → 상위 5개 |
| 분석 로깅 | AI 원본 응답 + 검색 쿼리/결과 전체 Supabase 저장 |
| 파일 제한 | 10MB 이하, JPEG/PNG/WebP/HEIC만 허용 |

## 환경 변수

`.env.local`:
- `OPENAI_API_KEY` — GPT-4o-mini Vision API
- `SERPAPI_KEY` — Google Shopping 상품 검색
- `SUPABASE_URL` — Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase 서비스 롤 키

## GitHub

- **조직**: endurance-ai
- **레포**: endurance-ai/moodfit (private)
- **기본 브랜치**: dev
- **워크플로우**: dev → feature branch → PR → squash merge

## 상세 참조 문서

| 문서 | 내용 |
|------|------|
| `docs/research/26-03-23-fashion-ai-service-analysis.md` | 시장분석, 파이프라인, 비용, 경쟁분석 |
| `docs/research/26-03-24-daydream-benchmark-and-differentiation.md` | Daydream 벤치마킹, 차별화 전략 |
| `docs/superpowers/specs/2026-03-29-industrial-stellar-design.md` | Industrial Stellar 디자인 스펙 |
| `docs/PATTERNS.md` | API/코드 패턴 |
| `docs/DESIGN.md` | 디자인 시스템 (레거시 — Digital Atelier) |
| `docs/AGENTS.md` | Next.js 에이전트 규칙 |

## 브레인스토밍 & 플래닝 보충 규칙

### Scope Challenge (brainstorming 질문 단계에서)
- "이거 진짜 필요한가?" — 기존 코드/라이브러리로 해결 가능한지 먼저 확인
- 최소 범위는 뭔가? 절반으로 줄일 수 있나?
- 복잡도 냄새 테스트: 설명에 "그리고"가 3번 이상 나오면 분해 필요

### AI Slop 블랙리스트 (디자인 제시 단계에서)
UI 제안 시 아래 패턴 금지:
- 보라색 그라디언트, 3칼럼 피처 그리드
- 장식용 이모지, 전부 가운데 정렬
- 균일한 border-radius, blob/divider 장식
- 제네릭 카피 ("Unlock your potential" 류)
- 쿠키커터 리듬 (같은 카드 패턴 반복)

### NOT in scope (플랜 작성 시)
- 모든 플랜 문서에 "NOT in scope" 섹션 필수
- 명시적으로 "이번에 안 하는 것" 나열
- 스코프 크리프 방지용 기준선 역할

## docs 파일명 컨벤션

`yy-mm-dd-{설명}.md` — 예: `26-03-03-system-architecture.md`
- 설명은 다른 문서와 구분될 정도로 구체적으로 작명
- `docs/plans/` 하위도 동일 컨벤션 적용
- 단, `docs/ARCHITECTURE.md`는 제외하며 업데이트 시에도 네이밍을 그대로 유지
