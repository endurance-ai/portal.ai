---
type: project
updated: 2026-05-04
---

# kiko.ai — 기술 스택

## 프라이머리 스택

| 영역 | 기술 | 버전 |
|---|---|---|
| 언어 | TypeScript | 5 |
| 프레임워크 | Next.js | 16.2.4 |
| UI 런타임 | React | 19.2.4 |
| 패키지 매니저 | pnpm | 10.23.0 |
| 번들러 | Turbopack (Next.js 내장) | — |
| 스타일 | Tailwind CSS | 4 |
| 컴포넌트 | shadcn/ui | latest |
| 애니메이션 | framer-motion | 12.38 |

## 프레임워크 선택 이유

**Next.js 16 App Router + RSC**: 별도 백엔드 서버 없이 단일 모놀리스로 페이지, API Route, 서버 컴포넌트를 통합. 인증 게이트(`proxy.ts`), 서버 전용 모듈(`server-only`), Supabase SSR 쿠키 세션을 자연스럽게 연결할 수 있다. 소규모 팀에서 배포·유지보수 복잡도를 낮추는 데 적합.

**Turbopack**: Next.js 16 내장 번들러로 HMR 속도를 높이고 별도 webpack 설정 없이 개발 서버를 구동한다.

**Supabase SSR (`@supabase/ssr`)**: 쿠키 기반 세션 관리로 서버/클라이언트 양쪽에서 일관된 인증 컨텍스트를 유지. RLS 정책으로 어드민 데이터 격리를 DB 레이어에서 강제한다.

## 외부 서비스

| 서비스 | 역할 | 비용 추정 | 토글 여부 |
|---|---|---|---|
| Supabase Postgres | 주 DB + Auth + pgvector + pgroonga | Pro 플랜 | 항상 ON |
| Cloudflare R2 | 이미지 오브젝트 스토리지 (analyses/, instagram-posts/) — 이그레스 무료 | 스토리지 기준 | 항상 ON |
| OpenAI GPT-4o-mini | Vision 단일 슬라이드 분석 | ~$0.003/슬라이드 | 항상 ON |
| Apify instagram-post-scraper | Instagram 포스트 run-sync 스크래핑 | ~$0.0023/포스트 | 항상 ON |
| AI Server (Python FastAPI) | v5 검색 오케스트레이션 (Modal embed + Supabase RPC) | 별도 EC2 | ON (5xx → v4 폴백) |
| Modal serverless | FashionSigLIP 이미지 임베딩 (T4 GPU, scale-to-zero) | 사용량 기준 | AI 서버 통해 호출 |
| LiteLLM proxy | LLM 라우팅 + Langfuse callback | EC2 컨테이너 | 현재 OFF |
| Langfuse self-host | LLM/임베딩/파이프라인 관측성 | EC2 컨테이너 | 현재 OFF |
| Vercel | Next.js 16 호스팅 + CDN + Analytics | 사용량 기준 | 항상 ON |

AI 서버는 별도 Python 레포(`endurance-ai/ai-server`). `AI_SERVER_URL` 미설정 또는 5xx/timeout 시 `/api/search-products` v4 폴백으로 자동 전환.

## 의존성 카테고리

### UI

| 패키지 | 역할 |
|---|---|
| tailwindcss 4 | 유틸리티 CSS + 디자인 토큰 |
| shadcn/ui | 재사용 컴포넌트 기반 |
| framer-motion 12 | UX 애니메이션 |
| sonner 2.0 | 토스트 알림 |
| recharts 3 | 어드민 대시보드 차트 |
| @vercel/analytics | Web Vitals 수집 |

### 데이터 / 인프라

| 패키지 | 역할 |
|---|---|
| @supabase/ssr 0.10 | SSR 쿠키 인증 |
| @supabase/supabase-js 2.100 | DB 클라이언트 + pgvector + pgroonga |
| @aws-sdk/client-s3 | Cloudflare R2 접근 (S3-compatible) |

### AI

| 패키지 | 역할 |
|---|---|
| openai 6.32 | GPT-4o-mini Vision API |

### 개발 / 테스트

| 패키지 | 역할 |
|---|---|
| vitest | 단위 테스트 |
| typescript 5 | 타입 안전성 |
| eslint | 코드 품질 |

크롤러(Playwright 기반)는 2026-05-05 부로 외부 리포 [`endurance-ai/crawler`](https://github.com/endurance-ai/crawler) 로 분리되어, kiko.ai 본체에서는 playwright 의존성이 제거됨.

## 개발 환경

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 (localhost:3400, Turbopack) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm lint` | ESLint |
| `pnpm test` | vitest 1회 실행 |
| `pnpm test:watch` | vitest watch 모드 |

환경변수 전체 목록 및 AWS 프로필 매핑: `docs/infra/env.md` 참조.

## 배포

| 레이어 | 기술 | 설명 |
|---|---|---|
| 메인 앱 | Vercel | `dev` 브랜치 → preview, `main` 브랜치 → prod |
| 임베딩 배치 | AWS EC2 g5.xlarge Spot | Deep Learning AMI, FashionSigLIP 실행 후 단발 종료 |
| 이미지 스토리지 | Cloudflare R2 | 단일 버킷, prefix 분리 (analyses/, instagram-posts/) |

Git 워크플로: `dev → feature → PR → squash merge`. 브랜치 상세 및 EC2 Spot 운영: `docs/infra/deployment.md` 참조.

> 최신 토폴로지 및 외부 서비스 상세: `docs/ARCHITECTURE.md` 참조
> 환경변수 전체 목록: `docs/infra/env.md` 참조
> 배포 운영 상세: `docs/infra/deployment.md` 참조
