---
type: codemap
updated: 2026-05-04
---

# kiko.ai — 모듈 설명

## src/lib — 비즈니스 로직 레이어

### 검색 (search/)

| 모듈 | 책임 | 주요 export |
|---|---|---|
| `src/lib/search/` | v4 10차원 가중합 알고리즘, locked-filter 유틸 | `scoredSearch`, `buildFilter` |
| `src/lib/enums/` | 색상·스타일·한국어 어휘 열거형 (v4 검색 차원 정의) | `ColorEnum`, `StyleEnum`, `VocabMap` |

- `locked-filter` 관련 코드는 구 Q&A 플로우 잔재. `src/app/_archive-qa/`와 함께 v5 전환 시 삭제 대상.
- v5 RPC 클라이언트(AI Server `/recommend` 호출)는 `src/lib/find.ts`가 직접 수행.

### 오케스트레이션 (find.ts)

| 파일 | 책임 | 주요 export |
|---|---|---|
| `src/lib/find.ts` | 아이템 검색 전체 오케스트레이션 — AI Server 호출, 5xx 시 v4 폴백 진입, 브랜드 필터 resolve | `findProducts`, `resolveHandles` |

### Instagram 스크래핑 (instagram.ts)

| 파일 | 책임 | 주요 export |
|---|---|---|
| `src/lib/instagram.ts` | Apify `instagram-post-scraper` run-sync 래퍼, shortcode 추출 유틸 | `scrapeInstagramPost`, `extractShortcode` |

### Vision 분석 (analyze.ts)

| 파일 | 책임 | 주요 export |
|---|---|---|
| `src/lib/analyze.ts` | GPT-4o-mini Vision API 응답 파싱, items[] 추출, isApparel 게이트 | `parseAnalysisResponse`, `AnalyzedItem` |

### 프롬프트 템플릿 (prompts.ts)

| 파일 | 책임 | 주요 export |
|---|---|---|
| `src/lib/prompts.ts` | GPT-4o-mini Vision 시스템 프롬프트 + 유저 프롬프트 빌더 | `buildVisionPrompt`, `SYSTEM_PROMPT` |

### Supabase 클라이언트

| 파일 | 책임 | 주요 export | 접근 범위 |
|---|---|---|---|
| `src/lib/supabase-server.ts` | SSR 쿠키 기반 Supabase 클라이언트, service-role 세션 | `createServerClient`, `createServiceRoleClient` | server-only |
| `src/lib/supabase-client.ts` | 브라우저 Supabase 클라이언트 (Auth 상태 구독용) | `createBrowserClient` | 클라이언트 허용 |

### R2 스토리지 (r2.ts)

| 파일 | 책임 | 주요 export | 접근 범위 |
|---|---|---|---|
| `src/lib/r2.ts` | Cloudflare R2 업로드, 서명 URL 생성 (`@aws-sdk/client-s3` S3 호환) | `uploadToR2`, `getSignedUrl` | server-only |

### 어드민 인증 (admin-auth.ts)

| 파일 | 책임 | 주요 export | 접근 범위 |
|---|---|---|---|
| `src/lib/admin-auth.ts` | `requireApprovedAdmin()` — admin_profiles.status 확인 후 미승인 시 redirect | `requireApprovedAdmin` | server-only |

---

## src/app/api — API Route 레이어

### 메인 플로우 (4개)

| 경로 | 책임 |
|---|---|
| `/api/instagram/fetch-post` | shortcode 캐시 조회 → MISS 시 Apify 스크래핑 + R2 이미지 복사 |
| `/api/find/analyze-post` | 단일 슬라이드 GPT-4o-mini Vision 분석 → items[] 반환 |
| `/api/find/search` | AI Server /recommend 호출 → 5xx 시 v4 폴백, 다양성 캡 적용 |
| `/api/search-products` | v4 10-dim 가중합 검색 엔진 (strongMatches + general) |

### 어드민 API (13개)

| 경로 | 책임 |
|---|---|
| `/api/admin/analytics` | 검색 로그 집계 + 차트 데이터 |
| `/api/admin/brands` | 브랜드 CRUD + Genome 메타 |
| `/api/admin/crawl-coverage` | 32 플랫폼 파싱 상태 조회 |
| `/api/admin/eval` | 골든셋 레이블 read/write |
| `/api/admin/pipeline-health` | 배치 파이프라인 상태 |
| `/api/admin/products` | 상품 조회·수정·일괄 내보내기 |
| `/api/admin/user-voice` | 사용자 피드백 목록 |
| 기타 6개 | 어드민 세부 기능 (로그인, 승인 관리 등) |

모든 `/api/admin/*` 라우트는 `requireApprovedAdmin()` 호출로 접근 제어.

### 아카이브 (참조 금지)

`src/app/_archive-qa/` — 구 Q&A 6단계 플로우. Next.js `_` prefix로 라우팅 제외. 신규 작업 reference 금지.

---

## src/components — UI 컴포넌트 레이어

| 디렉토리 | 책임 | 렌더 방식 |
|---|---|---|
| `components/admin/` | 어드민 전용 — 데이터 테이블, 폼, 차트 래퍼 | 혼합 (RSC + Client) |
| `components/analysis/` | Vision 분석 결과 표시 — 아이템 목록, 신뢰도 배지 | Client (인터랙션) |
| `components/find/` | 슬라이드 picker, 아이템 picker, 검색 결과 카드 | Client (핵심 UX) |
| `components/layout/` | Header, Footer, 전역 레이아웃 쉘 | RSC (정적) |
| `components/search/` | 검색 UI 컴포넌트 (필터 패널, 결과 그리드) | 혼합 |
| `components/upload/` | URL 입력 폼, 이미지 업로드 핸들러 | Client (폼 제출) |
| `components/ui/` | shadcn/ui 기반 범용 원자 컴포넌트 (Button, Card, Dialog 등) | RSC 기본 |

---

## src/proxy.ts — 어드민 게이트 진입점

Next.js 16.2+ 컨벤션을 따르는 서버-사이드 어드민 인증 1차 게이트. Supabase SSR 쿠키로 세션을 읽어 `admin_profiles.status`를 확인하고, 미승인 사용자를 `/admin/pending`으로 redirect.

> 자세히: `docs/features/main-flow.md`, `docs/features/search-engine.md`, `docs/PATTERNS.md`
