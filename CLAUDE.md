# MOODFIT (fashion-ai)

AI 이미지 기반 패션 무드 분석 & 크로스플랫폼 상품 추천 서비스 (POC)

## 프로젝트 구조

```
src/app/              → App Router 페이지 & API Routes
src/app/api/analyze/  → GPT-4o-mini Vision 이미지 분석
src/app/api/search-products/ → SerpApi 상품 검색
src/components/       → UI 컴포넌트 (shadcn/ui 기반)
  layout/             → Header, Footer
  upload/             → UploadZone, MoodChips
  analysis/           → AnalyzingView (로딩 화면)
  result/             → LookBreakdown, HotspotImage, ProductCard
src/lib/              → 유틸리티
docs/                 → 참조 문서, 디자인 시스템, 리서치
```

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 16 (App Router) | Turbopack, pnpm, port 3400 |
| UI | React 19, Tailwind 4, shadcn/ui (base-nova) | framer-motion 애니메이션 |
| 아이콘 | lucide-react | |
| 이미지 분석 | OpenAI GPT-4o-mini Vision | 건당 ~$0.003 |
| 상품 검색 | SerpApi (Google Shopping) | 월 100회 무료, 10개 fetch → 상위 4개 |
| 벡터 DB | Qdrant (예정) | 브랜드 DB 검색 |
| 배포 | Vercel | |

## 개발 명령어

```bash
pnpm dev          # 개발 서버 (localhost:3400)
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
```

## 코딩 컨벤션

- 컴포넌트: PascalCase, named export (`export default` 사용 안 함)
- 경로 별칭: `@/*` → `src/*`
- shadcn/ui: `pnpm dlx shadcn@latest add <component>`
- CSS: oklch 컬러 + MOODFIT 커스텀 변수 (`--color-moodfit-*`)
- 서버/클라이언트 분리: RSC 기본, 인터랙션 시 `"use client"`

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `src/app/page.tsx` | 메인 — 3-screen 상태 전환 (upload → analyzing → result) |
| `src/app/api/analyze/route.ts` | GPT-4o-mini Vision 호출, 무드/팔레트/아이템 분석 |
| `src/app/api/search-products/route.ts` | SerpApi Google Shopping 검색, 성별 필터링 |
| `src/components/result/look-breakdown.tsx` | 결과 화면 — 핫스팟, 커넥터 라인, 상품 카드 |
| `src/components/upload/upload-zone.tsx` | 이미지 드래그 & 드롭 업로드 |
| `src/components/analysis/analyzing-view.tsx` | 분석 중 화면 — 스캔 애니메이션 |
| `src/app/globals.css` | 테마 변수 (MOODFIT 컬러 시스템) |
| `src/lib/mock-data.ts` | 목 데이터 (레거시, 제거 예정) |

## 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 이미지 → 룩 분해 | 각 아이템(상의/하의/아우터/신발/악세서리) 개별 분석 |
| 무드 분석 | 태그 + score + vibe + season + occasion |
| 아이템 상세 | fit, fabric, color, detail 추출 |
| 성별 판단 | detectedGender → 검색 쿼리에 men/women 반영 |
| 상품 검색 | SerpApi → 관련성 + 평점 스코어링 → 상위 4개 |
| 크로스플랫폼 | 가격대 무관, 여러 쇼핑몰 결과 혼합 |

## 환경 변수

`.env.local`:
- `OPENAI_API_KEY` — GPT-4o-mini Vision API
- `SERPAPI_KEY` — Google Shopping 상품 검색

## 상세 참조 문서

| 문서 | 내용 |
|------|------|
| `docs/research/26-03-23-fashion-ai-service-analysis.md` | 시장분석, 파이프라인, 비용, 경쟁분석 |
| `docs/research/26-03-24-daydream-benchmark-and-differentiation.md` | Daydream 벤치마킹, 차별화 전략 |
| `docs/PATTERNS.md` | API/코드 패턴 |
| `docs/DESIGN.md` | 디자인 시스템 (Digital Atelier) |
| `docs/AGENTS.md` | Next.js 에이전트 규칙 |

## docs 파일명 컨벤션

`yy-mm-dd-{설명}.md` — 예: `26-03-03-system-architecture.md`
- 설명은 다른 문서와 구분될 정도로 구체적으로 작명
- `docs/plans/` 하위도 동일 컨벤션 적용
- 단, `docs/ARCHITECTURE.md`는 제외하며 업데이트 시에도 네이밍을 그대로 유지
