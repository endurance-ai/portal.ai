# portal.ai

AI 이미지 기반 패션 스타일 분석 & 크로스플랫폼 상품 추천 서비스 (POC)
"One photo. Every option." — 사진 한 장으로 룩 분해 + 크로스플랫폼 상품 검색

> 디렉터리는 `fashion-ai`로 남아있지만 서비스명·문서·UI 카피는 모두 **portal.ai**로 통일.

## 활성 진입점

- `/` — Instagram 포스트 URL → 슬라이드 Vision → 브랜드 매칭 → 상품 추천 (메인)
- `/admin` — 어드민 대시보드 (승인 게이트)

## 작업 규칙

- `docs/archive/` 는 종료된 문서 산출물 보관소. 코드/플랜 작업 시 **탐색·참조하지 않는다**.
- `src/app/_archive-qa/` 는 종료된 코드 보관소(구 Q&A 6단계 플로우). Next.js `_` prefix로 라우팅 제외. **새 작업의 reference로 사용하지 않는다** — v5 재설계 검토 끝나면 일괄 삭제 가능.
- 새 plan/spec은 `docs/plans/` 또는 `docs/research/` 에 작성. 종료 시 archive로 이동.

## 프로젝트 구조

```
src/app/              → App Router 페이지 & API Routes
src/app/page.tsx      → 메인 — Instagram 포스트 URL 입력 + FindClient 마운트
src/app/_components/  → 메인 페이지 전용 클라이언트 컴포넌트 (find-client, find-result, refinement-bar)
src/app/_archive-qa/  → 구 Q&A 6단계 플로우 보관소 (page.tsx + _qa/*; 라우팅 제외, 신규 작업 reference 금지)
src/app/admin/        → 어드민 대시보드 (Genome, Analytics, Eval) + 승인 게이트 (pending 페이지)
src/app/api/analyze/  → GPT-4o-mini Vision/텍스트 분석 (프롬프트 전용 + 이미지 + 프롬프트+이미지) + R2 업로드 + Supabase 로깅
src/app/api/search-products/ → 검색 엔진 v4 (enum 매칭 + 색상 인접 + 한국어 어휘 + 플랫폼 다양성 + 시즌/패턴 + lockedAttributes hard filter + styleTolerance + brandFilter)
src/app/api/feedback/ → 유저 피드백 수집 (rating + tags + comment + email → Supabase user_feedbacks)
src/app/api/instagram/fetch-post/ → Instagram 단일 포스트 스크래퍼 (oEmbed→profile 체인 → R2 이미지 복사 → Supabase 저장)
src/app/api/find/     → 메인 플로우 API (analyze-post: N슬라이드 병렬 Vision; search: brandFilter 브랜드 사전필터 + search-products 인프로세스 팬아웃) — 경로명은 legacy
src/app/api/admin/    → 어드민 API (brands CRUD, analytics, eval, search-quality, products filter-options)
src/components/       → UI 컴포넌트 (shadcn/ui 기반)
  admin/              → 어드민 전용 컴포넌트 (테이블, 필터, 리뷰, 차트)
  layout/             → Header, Footer (헤더 NAV에서 /find 항목 제거됨)
  search/             → SearchBar (채팅 입력 바 — archived flow 잔여)
  upload/             → GenderSelector
  analysis/           → AnalyzingView (Portal Warp 로딩)
src/lib/              → 유틸리티 (supabase.ts, r2.ts, fashion-genome.ts, style-nodes.ts, prompts/)
src/lib/instagram/    → Instagram 포스트 스크래퍼 모듈 (client, post-client, parse-post-url, parse-post-response, save-post-images, types; undici ProxyAgent 선택적)
src/lib/analyze/      → Vision 헬퍼 (run-vision.ts — 단일 이미지 GPT-4o-mini Vision 호출 + isApparel 게이트)
src/lib/find/         → 메인 플로우 전용 유틸 (resolve-brands.ts — IG @handle → products.brand 퍼지 매칭, 모듈 캐시)
src/lib/enums/        → 공유 enum (product-enums, korean-vocab, color-adjacency, season-pattern, enum-display-ko)
src/lib/search/       → 검색 helper (locked-filter — hard filter + tolerance→count) — archived flow 잔여, search-products는 여전히 사용
scripts/              → 크롤러 (crawl.ts), 임포트 (import-*.ts), 평가 (eval-search.ts, eval-prompt.ts, eval-prompt-v2.ts), 플랫폼 설정, AWS 임베딩 배치
scripts/aws/          → embed_products.py (FashionSigLIP) + launch_embed_batch.sh (EC2 g5 Spot 런처) — 풀배치 미실행
scripts/configs/      → 32개 플랫폼 설정 (22 Cafe24 국내 + 10 Shopify 해외)
scripts/lib/          → 크롤 엔진 (cafe24-engine.ts, shopify-engine.ts)
scripts/lib/parsers/  → Strategy Pattern 파서 (detail/, review/ — 사이트별 확장)
supabase/migrations/  → DB 스키마 (001~029)
docs/                 → 참조 문서, 디자인 시스템, 리서치, 스펙
```

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Next.js 16 (App Router) | Turbopack, pnpm, port 3400 |
| UI | React 19, Tailwind 4, shadcn/ui | framer-motion 애니메이션 |
| 폰트 | Roboto + Roboto Mono | M3 기준 |
| 아이콘 | lucide-react | |
| 이미지 분석 | OpenAI GPT-4o-mini Vision | 건당 ~$0.003, max_tokens 2500, detail auto |
| 상품 검색 | 검색 엔진 v4 (Enum+색상인접+어휘+시즌+gradient+brandDna) | product_ai_analysis JOIN, 플랫폼 다양성. v5(임베딩) 전환 인프라만 적용, 풀배치 미실행 |
| 이미지 저장 | Cloudflare R2 | 분석 원본 이미지 저장, @aws-sdk/client-s3 |
| 어드민 인증 | Supabase Auth (이메일/비번) + admin_profiles 승인 게이트 | 신규 가입 → pending 자동, 관리자 DB에서 approved 전환 |
| HTTP 클라이언트 | undici@6 | Instagram 스크래퍼 — ProxyAgent 지원 (선택적) |
| 크롤러 | Playwright (Cafe24) + Shopify /products.json | 32개 플랫폼 (22 Cafe24 국내 + 10 Shopify 해외), ~81,000 상품 (45k 국내 + 35k 해외), 697 브랜드 |
| DB/로깅 | Supabase (PostgreSQL) | 분석 결과 + 검색 쿼리/결과 전체 로깅 |
| 배포 | Vercel | |

## 개발 명령어

```bash
pnpm dev          # 개발 서버 (localhost:3400)
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
pnpm test         # vitest 단위 테스트 (1회)
pnpm test:watch   # vitest watch 모드
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
- UI 텍스트: 메인 서비스는 영어 (해외 사이트 느낌), 어드민은 한글 (영어 고유명사 유지)

## 핵심 파일

> 활성 코드만 나열. archived 코드는 `src/app/_archive-qa/` 아래에 보존되어 있으며 신규 작업 reference 금지.

| 파일 | 설명 |
|------|------|
| `src/app/page.tsx` | 메인 — IG 포스트 URL 입력 진입점 + FindClient 마운트 |
| `src/app/_components/find-client.tsx` | 메인 클라이언트 오케스트레이터 — fetch-post → analyze-post → search 3단계 순차 실행 + 상태 관리 |
| `src/app/_components/find-result.tsx` | 결과 렌더링 — 강한매칭(브랜드 필터) + 일반매칭 2-섹션 카드 그리드 |
| `src/app/_components/refinement-bar.tsx` | 리파인먼트 바 — cheaper / same-mood / different-vibe / free prompt 4가지 재검색 옵션 |
| `src/lib/search/locked-filter.ts` | passesLockedFilter + toleranceToTargetCount (10~20개) — 현재는 search-products 내부에서만 사용, archived 플로우 잔여 |
| `src/app/api/analyze/route.ts` | GPT-4o-mini Vision/텍스트 — 프롬프트 전용, 프롬프트+이미지, 이미지 전용 3분기 |
| `src/components/search/search-bar.tsx` | 채팅 입력 바 — textarea + 이미지 첨부 + 성별 + 전송 |
| `src/lib/prompts/prompt-search.ts` | 프롬프트 전용 시스템 프롬프트 (텍스트 모드, Vision 안 씀) |
| `src/app/api/search-products/route.ts` | 검색 엔진 v4 — enum 매칭 + 색상 인접 + 스타일 gradient + 브랜드 DNA + 한국어 어휘 + 가격 hard filter + brandFilter (brand_id[] hard filter, /find에서 활성화 시 브랜드당 cap 완화) |
| `src/lib/enums/product-enums.ts` | 공유 enum 정의 + validation + buildEnumReference() 프롬프트 빌더 |
| `src/lib/enums/korean-vocab.ts` | 한국어 패션 용어 → enum 매핑 (115+항목, 검색엔진/프롬프트 공용) |
| `src/lib/enums/color-adjacency.ts` | 색상 인접 맵 (16색, 검색 시 유사 색상 폴백) |
| `src/lib/enums/style-adjacency.ts` | 스타일 노드 유사도 맵 (15노드, gradient scoring) |
| `src/lib/enums/season-pattern.ts` | season(5종) + pattern(10종) enum 정의 |
| `src/lib/enums/enum-display-ko.ts` | enum 값 → 한국어 디스플레이 매핑 (toKo 함수, UI 표시용) |
| `src/app/api/feedback/route.ts` | 피드백 저장 API (입력 검증 + UUID/이메일/태그 allowlist + 부정 피드백 자동 핀) |
| `src/components/ui/custom-select.tsx` | B&W 커스텀 드롭다운 (네이티브 select 대체, cream/ink 디자인) |
| `src/lib/i18n.tsx` | LocaleProvider + useLocale (localStorage 기반 EN/KO 전환) |
| `src/lib/i18n-dict.ts` | i18n 딕셔너리 (피드백 + 속성 라벨 EN/KO; Q&A 키는 archived 플로우 잔여) |
| `scripts/eval-search.ts` | 검색 품질 자동 평가 스크립트 (골든셋 기반) |
| `scripts/eval-prompt-v2.ts` | 프롬프트 분석 품질 자동 평가 v2 (일관성/베이스라인/회귀감지) |
| `src/app/admin/search-debugger/page.tsx` | 어드민 검색 디버거 (쿼리 테스트 + score breakdown 시각화) |
| `src/lib/fashion-genome.ts` | 15개 스타일 노드 + 12개 감도 태그 정의 + 프롬프트 빌더 |
| `src/lib/style-nodes.ts` | 노드 컬러/레이블/설명 설정 (어드민 UI용) |
| `src/lib/r2.ts` | Cloudflare R2 이미지 업로드 클라이언트 |
| `src/lib/supabase-server.ts` | Supabase SSR 쿠키 기반 클라이언트 (어드민 인증) |
| `src/lib/supabase-browser.ts` | Supabase 브라우저 클라이언트 (어드민 인증) |
| `src/lib/admin-auth.ts` | getAdminStatus() + requireApprovedAdmin() 헬퍼 (React.cache 메모이즈) |
| `src/app/admin/pending/page.tsx` | 어드민 승인 대기 페이지 (미승인 가입자 랜딩) |
| `src/middleware.ts` | /admin/* 인증 가드 + admin_profiles 승인 상태 체크 |
| `scripts/import-attributes.ts` | brand-db.json → Supabase brand_nodes.attributes 임포트 |
| `scripts/crawl.ts` | 24개 플랫폼 크롤 CLI (--all, --site=, --probe=, --detail, --reviews) |
| `scripts/lib/parsers/detail/` | 상세 파서 Strategy Pattern (base + adekuver/blankroom/visualaid 사이트별 확장) |
| `scripts/lib/parsers/review/` | 리뷰 파서 Strategy Pattern (board + inline + composite) |
| `scripts/import-brand-nodes.ts` | Fashion Genome v2 엑셀 → Supabase brand_nodes |
| `scripts/import-products.ts` | 크롤링 JSON → Supabase products + product_reviews (자사몰 brand 자동 채움) |
| `src/app/api/admin/crawl-coverage/route.ts` | 크롤링 커버리지 대시보드 API (플랫폼별 description/material/review 수집률) |
| `src/app/api/admin/user-voice/route.ts` | 어드민 User Voice API — 메트릭, 태그분포, 피드백 리스트+세션여정 (legacy 데이터 조회용) |
| `src/components/analysis/analyzing-view.tsx` | 분석 중 — Portal Warp 로딩 (파티클 + 키워드 플로팅 + 프로그레스 링) |
| `src/lib/supabase.ts` | Supabase 서버 클라이언트 (service role) |
| `src/app/globals.css` | M3 테마 + B&W Minimal 토큰 |
| `src/lib/instagram/client.ts` | Instagram web_profile_info 스크래퍼 + 이미지 다운로더 (undici ProxyAgent 선택적; SSRF allowlist + 15MB 캡) |
| `src/lib/instagram/types.ts` | InstagramPostDetail / InstagramPostSlide / InstagramTaggedUser 타입 + 에러 코드 (INVALID_URL, REEL_NOT_SUPPORTED, TOO_OLD 등) |
| `src/lib/instagram/post-client.ts` | oEmbed → web_profile_info 체인으로 단일 포스트 스크래핑 (shortcode 기반 탐색) |
| `src/lib/instagram/parse-post-url.ts` | 포스트 URL 파서 — shortcode 추출, /reel/ 입력 시 REEL_NOT_SUPPORTED reject |
| `src/lib/analyze/run-vision.ts` | Vision 헬퍼 — 단일 이미지 Buffer → GPT-4o-mini Vision 호출; isApparel 필드로 비의류 게이트 |
| `src/lib/find/resolve-brands.ts` | IG @handle → products.brand 퍼지 매칭 (모듈 캐시); /api/find/search의 brandFilter 빌더 |
| `src/app/api/instagram/fetch-post/route.ts` | POST {input} → oEmbed→profile 체인 스크래핑 → R2 이미지 복사 → Supabase instagram_post_scrapes 저장 |
| `src/app/api/find/analyze-post/route.ts` | POST {scrapeId} → slides 로드 → 최대 10장 병렬 Vision 팬아웃 → isApparel 게이트 → 슬라이드별 분석 결과 반환 |
| `src/app/api/find/search/route.ts` | POST {analyses, taggedHandles} → resolve-brands로 brandFilter 빌드 → search-products 핸들러 인프로세스 호출 → strongMatches + general 분리 응답 |
| `scripts/aws/embed_products.py` | EC2 g5.xlarge에서 실행되는 FashionSigLIP 임베딩 인코딩 배치 (Supabase 페이지네이션 + ThreadPool 병렬 다운로드 + bulk RPC upsert). **현재 풀배치 미실행, 테스트만** |
| `scripts/aws/launch_embed_batch.sh` | 로컬 → AWS 프로필 portal-ai로 EC2 Spot 기동, user-data가 끝에 self-terminate |
| `src/components/admin/products-page.tsx` | 어드민 상품 목록 — 6-col dense grid, hover 오버레이, 그룹 필터 바 + active chips + PAGE_SIZE 60 |
| `src/app/api/admin/products/filter-options/route.ts` | 상품 필터 옵션 API — get_product_filter_counts() RPC 호출, 10min CDN cache |
| `supabase/migrations/001~026` | analyses, brand_nodes, products, eval_reviews, eval_golden_set, api_access_logs, product_ai_analysis, search_quality_logs, analyses.is_pinned, season/pattern, data cleansing, product_reviews, drop rating, analysis_sessions, user_feedbacks, admin_profiles 승인 게이트, get_product_filter_counts() RPC |
| `supabase/migrations/027_product_embeddings_and_pgroonga.sql` | v5 인프라 — pgvector + pgroonga extensions, products.embedding vector(768), HNSW 인덱스, pgroonga 한국어 BM25 인덱스, bulk_update_product_embeddings RPC, product_embedding_coverage 뷰 (적용 완료, 풀배치 미실행) |
| `supabase/migrations/028_instagram_post_scrapes.sql` | instagram_post_scrapes (shortcode unique, media_type, tagged_users jsonb, raw_data) + instagram_post_scrape_images (order_index, r2_url, tagged_users jsonb, is_video); RLS deny-all |
| `supabase/migrations/029_drop_instagram_profile_scrapes.sql` | /dna 라우트 제거에 따른 instagram_scrapes / instagram_scrape_images 테이블 드랍 |

## 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 메인 플로우 | IG 포스트 URL → fetch-post → analyze-post(슬라이드별 Vision) → search(brandFilter 강한매칭 + 일반매칭) → 결과 + 리파인먼트 바 |
| Instagram 포스트 스크래핑 | /api/instagram/fetch-post (공개) — oEmbed(~300ms)로 owner_handle 추출 → web_profile_info(~500ms)로 최근 ~12개 포스트에서 shortcode 탐색; owner 최근 12개 밖이면 TOO_OLD; /reel/ URL은 REEL_NOT_SUPPORTED 즉시 reject; 비공개 계정 차단; SSRF 허용 호스트: cdninstagram.com / fbcdn.net; 이미지 15MB 캡 |
| Vision 분석 | 슬라이드 최대 10장 × $0.003 = 약 $0.03/포스트; isApparel=false 스킵; 비디오 슬라이드(is_video=true) 자동 스킵; SSRF 가드: Vision에 넘기는 이미지 URL은 R2_PUBLIC_URL prefix만 허용 |
| 브랜드 필터 | caption @멘션 + slide별 tagged_users → resolve-brands 퍼지 매칭 → brandFilter(brand 이름 배열) → search-products에 투입; 매칭 = strongMatches, 일반 = general; brandFilter 활성 시 브랜드당 max cap 완화 |
| 검색 호출 | /api/find/search에서 search-products 핸들러를 인프로세스 직접 호출 (HTTP fetch 없음) — SSRF 방지 + 쿠키 포워딩 문제 회피 |
| 상품 검색 (v4) | enum 매칭 (subcategory 0.25 + colorFamily 0.20 + colorAdjacent 0.10 + styleNode gradient 0.30/0.15 + fit 0.15 + fabric 0.15 + season 0.15 + pattern 0.15 + brandDna 0.20 + moodTags 0.05×N) → tight=10/medium=15/loose=20개, 브랜드당 max 2, 플랫폼당 max 3 *(v5 임베딩 기반 전환 재설계 중 — `docs/plans/26-04-23-embedding-rewrite-plan.md` 는 reference로만 참조)* |
| 가격 필터 | priceFilter가 있으면 DB+인메모리 hard filter (null price 제외, 범위 밖 무조건 제거) |
| 어드민 승인 | 신규 가입자 → admin_profiles.status = 'pending' 자동 삽입; 관리자가 DB에서 'approved'로 수동 전환해야 /admin 접근 가능 |
| 분석 로깅 | AI 원본 응답 + 검색 쿼리/결과 전체 Supabase 저장 |
| 파일 제한 (archived flow) | 10MB 이하, JPEG/PNG/WebP/HEIC만 허용 — 직접 이미지 업로드 진입점 archived 후 현재는 미사용 |
| i18n | EN 기본, KO 토글 (헤더), enum 값은 enum-display-ko.ts로 한글 변환, useLocale() + t() 패턴 |

## 환경 변수

`.env.local`:
- `OPENAI_API_KEY` — GPT-4o-mini Vision API
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase (데이터 조회)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Auth (어드민)
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` — Cloudflare R2
- `LITELLM_BASE_URL` / `LITELLM_API_KEY` / `LITELLM_MODEL` / `LITELLM_DISABLED` — LiteLLM 프록시 (선택, 현재 OFF — EC2 인스턴스는 존재하나 미가동; v5 인프라 재설계와 함께 재가동 예정)
- `PROXY_HOST` / `PROXY_PORT` / `PROXY_USER` / `PROXY_PASS` — Instagram 스크래퍼 프록시 (선택, 없으면 직접 연결)
- `LOG_LEVEL` — pino 로그 레벨 (선택, 기본 `info`)

## GitHub

- **조직**: endurance-ai
- **레포**: endurance-ai/moodfit (private)
- **기본 브랜치**: dev
- **워크플로우**: dev → feature branch → PR → squash merge

## 상세 참조 문서

> 종료된 산출물은 `docs/archive/` 로 이동 — **개발 작업 시 archive는 탐색·참조하지 않는다.**

### 활성 문서 (계속 보는 것)

| 문서 | 내용 |
|------|------|
| `DESIGN.md` (root) | 디자인 시스템 — Editorial spine (cream/ink, Pretendard) |
| `docs/ARCHITECTURE.md` | 아키텍처 (부분 stale — 차주 리라이트 예정) |
| `docs/PATTERNS.md` | API/코드 패턴 |
| `docs/AGENTS.md` | Next.js 에이전트 규칙 |
| `docs/guides/platform-parser-guide.md` | 크롤러 플랫폼 파서 작성 가이드 |

### 활성 plan (실행 대기)

| 문서 | 내용 |
|------|------|
| `docs/plans/26-04-23-embedding-rewrite-plan.md` | 검색 엔진 v5 임베딩 전환 플랜 (재설계 예정) |
| `docs/plans/26-04-24-aws-embedding-infra.md` | FashionSigLIP AWS EC2 Spot 배치 인프라 스펙 |

### 활성 reference (차별화·경쟁사 분석)

| 문서 | 내용 |
|------|------|
| `docs/research/26-04-12-daydream-competitive-analysis.md` | Daydream 경쟁 분석 |
| `docs/research/26-04-12-screenshop-competitor-analysis.md` | ScreenShop 경쟁 분석 |
| `docs/research/26-04-12-alwayz-gabi-competitor-analysis.md` | Alwayz/GABI 경쟁 분석 |
| `docs/research/26-04-13-alta-competitive-analysis.md` | ALTA 경쟁 분석 |
| `docs/research/26-04-13-gabi-ux-deep-analysis.md` | GABI UX 딥 분석 |
| `docs/research/26-04-12-search-engine-differentiation-research.md` | 검색 엔진 차별화 |
| `docs/research/26-04-13-product-direction-qa-synthesis.md` | Q&A 에이전트 방향 합성 (현재 메인 플로우 근거) |
| `docs/research/26-04-14-qa-agent-architecture-and-differentiation.md` | Q&A 에이전트 아키텍처·차별화 |
| `docs/superpowers/specs/2026-04-10-gpu-batch-analysis-design.md` | GPU 배치 인프라 패턴 (v5 임베딩 인프라 reference) |
| `docs/superpowers/specs/2026-04-10-llm-infra-roadmap.md` | LLM 인프라 로드맵 |

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
