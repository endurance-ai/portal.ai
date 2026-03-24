# MOODFIT (fashion-ai)

AI 이미지 기반 패션 무드 분석 & 크로스플랫폼 상품 추천 서비스 (POC)

## 프로젝트 구조

```
src/app/          → App Router 페이지 & API Routes
src/components/   → UI 컴포넌트 (shadcn/ui 기반)
src/lib/          → 유틸리티, API 클라이언트
docs/             → 참조 문서 (서비스 분석, 패턴 등)
```

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 16 (App Router) | Turbopack, pnpm |
| UI | React 19, Tailwind 4, shadcn/ui (base-nova) | framer-motion 애니메이션 |
| 아이콘 | lucide-react | |
| 이미지 분석 | GPT-4o-mini Vision API | POC, 건당 ~$0.003 |
| 벡터 DB | Qdrant (예정) | 브랜드 DB 검색 |
| 배포 | Vercel | |

## 개발 명령어

```bash
pnpm dev          # 개발 서버 (Turbopack)
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
```

## 코딩 컨벤션

- 컴포넌트: PascalCase, `export default` 사용 안 함 → named export
- 경로 별칭: `@/*` → `src/*`
- shadcn/ui 컴포넌트: `pnpm dlx shadcn@latest add <component>`로 추가
- CSS 변수: oklch 컬러 시스템 (`globals.css` 참조)
- 서버/클라이언트 분리: RSC 기본, 인터랙션 필요 시 `"use client"`

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `src/app/page.tsx` | 메인 페이지 (이미지 업로드) |
| `src/app/globals.css` | 테마 변수, Tailwind 설정 |
| `src/components/ui/` | shadcn/ui 컴포넌트 |
| `src/lib/utils.ts` | cn() 유틸리티 |
| `components.json` | shadcn/ui 설정 |
| `docs/26-03-23-fashion-ai-service-analysis.md` | 서비스 분석 문서 |

## 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 이미지 → 룩 분해 | 업로드 이미지에서 각 아이템(상의/하의/아우터/신발) 개별 분석 |
| 무드 추출 | 스타일 키워드 + confidence score (Street 92% 등) |
| 크로스플랫폼 추천 | 무신사, W컨셉, 29CM, ZARA 등 다수 플랫폼 상품 매칭 |
| 정확 매칭 우선 | 1순위: 동일 상품 찾기, 2순위: 유사 스타일 추천 |

## 환경 변수

`.env.local` 필요 (아직 미생성):
- `OPENAI_API_KEY` — GPT-4o-mini Vision API

## 상세 참조 문서

| 문서 | 내용 |
|------|------|
| `docs/26-03-23-fashion-ai-service-analysis.md` | 시장분석, 파이프라인, 비용, 경쟁분석 |
| `docs/patterns.md` | API/코드 패턴 |
| `AGENTS.md` | Next.js 에이전트 규칙 |

## docs 파일명 컨벤션

`yy-mm-dd-{설명}.md` — 예: `26-03-03-system-architecture.md`
- 설명은 다른 문서와 구분될 정도로 구체적으로 작명
- `docs/plans/` 하위도 동일 컨벤션 적용
- 단, `docs/ARCHITECTURE.md`는 제외하며 업데이트 시에도 네이밍을 그대로 유지
