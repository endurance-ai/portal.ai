---
type: project
updated: 2026-05-04
---

# kiko.ai — 코드베이스 구조

## 디렉토리 트리 (상위 2 레벨)

```
kikoai/app/
├── src/
│   ├── app/                    # Next.js App Router 진입점
│   │   ├── api/                # 19개 API Route 핸들러
│   │   │   ├── instagram/      # fetch-post (Apify 스크래퍼 + 캐시)
│   │   │   ├── find/           # analyze-post (Vision), search (AI서버→v4 폴백)
│   │   │   ├── search-products/ # v4 검색엔진 (10-dim 가중합)
│   │   │   └── admin/          # analytics, brands, crawl-coverage, eval,
│   │   │                       #   pipeline-health, products, user-voice
│   │   ├── admin/              # 어드민 대시보드 13개 모듈
│   │   │   ├── layout.tsx      # requireApprovedAdmin() RSC 가드
│   │   │   ├── login/          # 어드민 로그인
│   │   │   ├── signup/         # admin_profiles 생성 (status=pending)
│   │   │   ├── pending/        # 승인 대기 화면
│   │   │   ├── genome/         # 브랜드 Genome 관리
│   │   │   ├── analytics/      # 검색 분석 차트
│   │   │   ├── eval/           # 검색 결과 골든셋 레이블링
│   │   │   ├── search-debugger/ # v4/v5 검색 쿼리 인스펙트
│   │   │   ├── products/       # 상품 CRUD + 일괄 내보내기
│   │   │   ├── user-voice/     # 사용자 피드백 수집
│   │   │   ├── pipeline-health/ # 배치 파이프라인 상태
│   │   │   └── crawl-coverage/ # 32 플랫폼 파싱 상태
│   │   ├── _archive-qa/        # [잠금] 구 Q&A 6단계 플로우 — 참조 금지
│   │   ├── layout.tsx          # 루트 레이아웃 (Pretendard, global CSS)
│   │   ├── page.tsx            # 메인 진입점 (/)
│   │   └── globals.css         # Tailwind 4 + 디자인 토큰
│   ├── components/             # UI 컴포넌트 모음
│   │   ├── admin/              # 어드민 전용 컴포넌트
│   │   ├── analysis/           # Vision 분석 결과 표시
│   │   ├── find/               # 슬라이드/아이템 picker, 검색 결과 카드
│   │   ├── layout/             # Header, Footer, 공통 레이아웃
│   │   ├── search/             # 검색 UI 컴포넌트
│   │   ├── upload/             # URL 입력 + 이미지 업로드
│   │   └── ui/                 # shadcn/ui 기반 범용 컴포넌트
│   ├── lib/                    # 비즈니스 로직 + 서버 전용 모듈
│   │   ├── enums/              # 색상, 스타일, 한국어 어휘 (v4 검색 열거형)
│   │   ├── search/             # 검색 알고리즘 (locked-filter 등)
│   │   ├── analyze.ts          # Vision 분석 결과 파싱
│   │   ├── find.ts             # 아이템 검색 오케스트레이션
│   │   ├── instagram.ts        # Apify 클라이언트 래퍼
│   │   ├── prompts.ts          # GPT-4o-mini 시스템 프롬프트
│   │   ├── supabase-server.ts  # Supabase SSR 클라이언트 (서버 전용)
│   │   ├── supabase-client.ts  # Supabase 브라우저 클라이언트
│   │   ├── r2.ts               # Cloudflare R2 클라이언트 (server-only)
│   │   └── admin-auth.ts       # requireApprovedAdmin() (server-only)
│   ├── proxy.ts                # 어드민 인증 게이트 (Next.js 16.2+ proxy 컨벤션)
│   └── middleware.ts           # (proxy.ts로 이전됨)
├── supabase/
│   ├── migrations/             # 순번 SQL 마이그레이션 (027개+)
│   └── seed.sql                # 개발 시드 데이터
├── scripts/
│   ├── crawl.ts                # 32 플랫폼 크롤러 (Playwright + Shopify JSON)
│   ├── import-products.ts      # SKU → DB 적재
│   ├── analyze-products.ts     # 상품 AI 분석 배치
│   ├── eval-*.ts               # 검색 평가 스크립트
│   └── aws/                    # EC2 Spot 론칭 + FashionSigLIP 임베딩 배치
├── docs/                       # 프로젝트 문서 (단일 진실 원천)
│   ├── ARCHITECTURE.md         # 전체 토폴로지 + 외부 서비스 매트릭스
│   ├── PATTERNS.md             # API route / Supabase / 프론트 코딩 패턴
│   ├── features/               # main-flow, search-engine, crawler
│   ├── infra/                  # data-model, env, deployment
│   ├── design/                 # system.md (디자인 시스템)
│   ├── plans/                  # 활성 실행 계획
│   └── research/               # 경쟁사·차별화 리서치
└── public/                     # 정적 에셋
```

## 핵심 파일 위치

| 파일 | 역할 |
|---|---|
| `src/proxy.ts` | 어드민 인증 1차 게이트 — Supabase SSR 쿠키로 `admin_profiles.status` 확인 |
| `src/lib/admin-auth.ts` | `requireApprovedAdmin()` 헬퍼 — RSC + API route 공유 (server-only) |
| `src/lib/supabase-server.ts` | SSR Supabase 클라이언트 — 쿠키 기반 세션 (server-only) |
| `src/app/api/find/search/route.ts` | AI 서버 `/recommend` 호출 → 5xx 시 v4 폴백 진입점 |
| `src/app/api/search-products/route.ts` | v4 검색엔진 — 10-dim 가중합 + 다양성 캡 |
| `src/app/api/instagram/fetch-post/route.ts` | Apify 스크래퍼 + `shortcode` 캐시 |
| `src/app/api/find/analyze-post/route.ts` | GPT-4o-mini Vision 단일 슬라이드 분석 |
| `src/lib/r2.ts` | Cloudflare R2 업로드/서명 URL (server-only) |

## 모듈 경계

### Server-Only (클라이언트 노출 금지)

`import "server-only"` 가드 적용:
- `src/lib/r2.ts` — R2 API 키
- `src/lib/supabase-server.ts` — service-role 세션
- `src/lib/admin-auth.ts` — 어드민 검증 로직

### RSC vs Client Component

| 기본 | RSC (React Server Component) — 데이터 페치, 레이아웃 |
|---|---|
| "use client" 적용 | 인터랙션 필요 컴포넌트 — picker UI, 검색 결과 카드, 폼 |

### API Route (19개 활성)

- `/api/instagram/*` — 스크래핑 + 캐시
- `/api/find/*` — Vision 분석 + 검색 오케스트레이션
- `/api/search-products` — v4 검색엔진 (v5 폴백 대상)
- `/api/admin/*` — 어드민 CRUD (requireApprovedAdmin 가드 필수)

### Archived Zone (참조 금지)

`src/app/_archive-qa/` — 구 Q&A 6단계 플로우. Next.js `_` prefix로 라우팅 제외. 신규 작업의 reference 및 import 금지. v5 검색 재설계 완료 시 일괄 삭제 대상.

> 최신 토폴로지 전체: `docs/ARCHITECTURE.md` 참조
> 코딩 패턴 상세: `docs/PATTERNS.md` 참조
