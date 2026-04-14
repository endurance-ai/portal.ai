# portal.ai (fashion-ai)

AI 이미지 기반 패션 스타일 분석 & 크로스플랫폼 상품 추천 서비스 (POC)
"One photo. Every option." — 사진 한 장으로 룩 분해 + 크로스플랫폼 상품 검색

## 프로젝트 구조

```
src/app/              → App Router 페이지 & API Routes
src/app/page.tsx      → 메인 — Q&A 에이전트 6단계 플로우 (input/confirm/hold/conditions/results/feedback)
src/app/_qa/          → 메인의 6단계 컴포넌트 + reducer + 휴리스틱 (Next.js _ prefix로 라우팅 제외)
src/app/admin/        → 어드민 대시보드 (Genome, Analytics, Eval)
src/app/api/analyze/  → GPT-4o-mini Vision/텍스트 분석 (프롬프트 전용 + 이미지 + 프롬프트+이미지) + R2 업로드 + Supabase 로깅
src/app/api/search-products/ → 검색 엔진 v4 (enum 매칭 + 색상 인접 + 한국어 어휘 + 플랫폼 다양성 + 시즌/패턴 + lockedAttributes hard filter + styleTolerance)
src/app/api/feedback/ → 유저 피드백 수집 (rating + tags + comment + email → Supabase user_feedbacks)
src/app/api/admin/    → 어드민 API (brands CRUD, analytics, eval, search-quality)
src/components/       → UI 컴포넌트 (shadcn/ui 기반)
  admin/              → 어드민 전용 컴포넌트 (테이블, 필터, 리뷰, 차트)
  layout/             → Header, Footer
  search/             → SearchBar (채팅 입력 바 — 프롬프트+이미지)
  upload/             → GenderSelector
  analysis/           → AnalyzingView (Portal Warp 로딩)
src/lib/              → 유틸리티 (supabase.ts, r2.ts, fashion-genome.ts, style-nodes.ts, prompts/)
src/lib/enums/        → 공유 enum (product-enums, korean-vocab, color-adjacency, season-pattern, enum-display-ko)
src/lib/search/       → 검색 helper (locked-filter — Q&A hard filter + tolerance→count)
scripts/              → 크롤러 (crawl.ts), 임포트 (import-*.ts), 평가 (eval-search.ts, eval-prompt.ts, eval-prompt-v2.ts), 플랫폼 설정
scripts/configs/      → 22개 편집샵/브랜드몰 플랫폼 설정 (Cafe24)
scripts/lib/          → 크롤 엔진 (cafe24-engine.ts, shopify-engine.ts)
scripts/lib/parsers/  → Strategy Pattern 파서 (detail/, review/ — 사이트별 확장)
supabase/migrations/  → DB 스키마 (001~020)
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
| 상품 검색 | 검색 엔진 v3 (Enum+색상인접+어휘+시즌) | product_ai_analysis JOIN, 플랫폼 다양성 |
| 이미지 저장 | Cloudflare R2 | 분석 원본 이미지 저장, @aws-sdk/client-s3 |
| 어드민 인증 | Supabase Auth (이메일/비번) | 이메일 인증 기반 |
| 크롤러 | Playwright (Cafe24) | 22개 편집샵/브랜드몰, ~26,000 상품 |
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

| 파일 | 설명 |
|------|------|
| `src/app/page.tsx` | 메인 — Q&A 에이전트 useReducer 6단계 state machine (input/confirm/hold/conditions/results/feedback) + 키보드 네비 |
| `src/app/_qa/types.ts` | AgentState, AgentStep(6단계), SimilarityLevel, LockableAttr, INITIAL_AGENT_STATE 정의 |
| `src/app/_qa/agent-reducer.ts` | reducer + AgentAction (~15 액션 타입, CONFIRM_ITEM/EDIT_ITEM_ATTR/SET_SIMILARITY/FEEDBACK_SUBMITTED 포함) |
| `src/app/_qa/recommend-attr.ts` | recommendLockedAttr (★ Pick 휴리스틱) + pickUnlockSuggestion (빈 결과 시 풀 lock 추천) |
| `src/app/_qa/step-input.tsx` | Step 1 — SearchBar 재사용 (이미지/텍스트 진입) |
| `src/app/_qa/step-confirm.tsx` | Step 2 — AI 분석 확인 + 아이템 선택 + 속성 드롭다운 수정 (CustomSelect) |
| `src/app/_qa/step-hold.tsx` | Step 3 — 속성 lock 질문형 체크리스트 (max 3, 0개 허용) |
| `src/app/_qa/step-conditions.tsx` | Step 4 — 3단계 유사도 라디오 (tight/medium/loose) + 예산 입력 |
| `src/app/_qa/step-results.tsx` | Step 5 — 결과 카드 그리드 (4-col) + held 칩 + 빈 결과 시 unlock 추천 (pickUnlockSuggestion 연동) |
| `src/app/_qa/step-feedback.tsx` | Step 6 — 피드백 수집 (rating → tags → comment + email) → /api/feedback |
| `src/app/_qa/agent-progress.tsx` | 01/06 ~ 06/06 진행 인디케이터 (이전 단계 클릭 가능) |
| `src/lib/search/locked-filter.ts` | passesLockedFilter + toleranceToTargetCount (10~20개, search-products와 테스트가 공유) |
| `src/app/api/analyze/route.ts` | GPT-4o-mini Vision/텍스트 — 프롬프트 전용, 프롬프트+이미지, 이미지 전용 3분기 |
| `src/components/search/search-bar.tsx` | 채팅 입력 바 — textarea + 이미지 첨부 + 성별 + 전송 |
| `src/lib/prompts/prompt-search.ts` | 프롬프트 전용 시스템 프롬프트 (텍스트 모드, Vision 안 씀) |
| `src/app/api/search-products/route.ts` | 검색 엔진 v4 — enum 매칭 + 색상 인접 + 스타일 gradient + 브랜드 DNA + 한국어 어휘 + 가격 hard filter |
| `src/lib/enums/product-enums.ts` | 공유 enum 정의 + validation + buildEnumReference() 프롬프트 빌더 |
| `src/lib/enums/korean-vocab.ts` | 한국어 패션 용어 → enum 매핑 (115+항목, 검색엔진/프롬프트 공용) |
| `src/lib/enums/color-adjacency.ts` | 색상 인접 맵 (16색, 검색 시 유사 색상 폴백) |
| `src/lib/enums/style-adjacency.ts` | 스타일 노드 유사도 맵 (15노드, gradient scoring) |
| `src/lib/enums/season-pattern.ts` | season(5종) + pattern(10종) enum 정의 |
| `src/lib/enums/enum-display-ko.ts` | enum 값 → 한국어 디스플레이 매핑 (toKo 함수, UI 표시용) |
| `src/app/api/feedback/route.ts` | 피드백 저장 API (입력 검증 + UUID/이메일/태그 allowlist + 부정 피드백 자동 핀) |
| `src/components/ui/custom-select.tsx` | B&W 커스텀 드롭다운 (네이티브 select 대체, cream/ink 디자인) |
| `src/lib/i18n.tsx` | LocaleProvider + useLocale (localStorage 기반 EN/KO 전환) |
| `src/lib/i18n-dict.ts` | i18n 딕셔너리 (Q&A 플로우 + 피드백 + 속성 라벨 EN/KO) |
| `scripts/eval-search.ts` | 검색 품질 자동 평가 스크립트 (골든셋 기반) |
| `scripts/eval-prompt-v2.ts` | 프롬프트 분석 품질 자동 평가 v2 (일관성/베이스라인/회귀감지) |
| `src/app/admin/search-debugger/page.tsx` | 어드민 검색 디버거 (쿼리 테스트 + score breakdown 시각화) |
| `src/lib/fashion-genome.ts` | 15개 스타일 노드 + 12개 감도 태그 정의 + 프롬프트 빌더 |
| `src/lib/style-nodes.ts` | 노드 컬러/레이블/설명 설정 (어드민 UI용) |
| `src/lib/r2.ts` | Cloudflare R2 이미지 업로드 클라이언트 |
| `src/lib/supabase-server.ts` | Supabase SSR 쿠키 기반 클라이언트 (어드민 인증) |
| `src/lib/supabase-browser.ts` | Supabase 브라우저 클라이언트 (어드민 인증) |
| `src/middleware.ts` | /admin/* 인증 가드 |
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
| `supabase/migrations/001~021` | analyses, brand_nodes, products, eval_reviews, eval_golden_set, api_access_logs, product_ai_analysis, search_quality_logs, analyses.is_pinned, season/pattern, data cleansing, product_reviews, drop rating, analysis_sessions, user_feedbacks |

## 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 프롬프트 → 아이템 추출 | 텍스트 전용 GPT-4o-mini (~200토큰, ~2초) → 카테고리/키워드 추출 |
| 이미지 → 룩 분해 | 각 아이템 개별 분석 + 이미지 내 위치좌표(%) |
| 무드 분석 | 태그 + score + vibe + season + occasion |
| 아이템 상세 | fit, fabric, color, detail, position 추출 |
| 성별 판단 | detectedGender → 검색 쿼리에 men/women 반영 |
| 상품 검색 | enum 매칭 (subcategory 0.25 + colorFamily 0.20 + colorAdjacent 0.10 + styleNode gradient 0.30/0.15 + fit 0.15 + fabric 0.15 + season 0.15 + pattern 0.15 + brandDna 0.20 + moodTags 0.05×N) → tight=10/medium=15/loose=20개, 브랜드당 max 2, 플랫폼당 max 3 |
| Q&A 플로우 | 6단계: input → confirm(AI 확인+수정) → hold(속성 lock 0~3개) → conditions(유사도 3단계+예산) → results → feedback(rating+tags+email) |
| i18n | EN 기본, KO 토글 (헤더), enum 값은 enum-display-ko.ts로 한글 변환, useLocale() + t() 패턴 |
| 가격 필터 | 프롬프트에서 parsePrice로 추출 → priceFilter가 있으면 DB+인메모리 hard filter (null price 제외, 범위 밖 무조건 제거) |
| 분석 로깅 | AI 원본 응답 + 검색 쿼리/결과 전체 Supabase 저장 |
| 파일 제한 | 10MB 이하, JPEG/PNG/WebP/HEIC만 허용 |

## 환경 변수

`.env.local`:
- `OPENAI_API_KEY` — GPT-4o-mini Vision API
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase (데이터 조회)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Auth (어드민)
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` — Cloudflare R2

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
| `docs/superpowers/specs/2026-04-03-admin-dashboard-design.md` | 어드민 대시보드 디자인 스펙 |
| `docs/superpowers/specs/2026-04-03-prompt-search-design.md` | 프롬프트 기반 검색 디자인 스펙 |
| `docs/superpowers/specs/2026-04-03-crawler-enhancement-spec.md` | 크롤러 데이터 보강 스펙 |
| `docs/eval/26-04-07-eval-pipeline-architecture.md` | 프롬프트 평가 파이프라인 아키텍처 |
| `docs/eval/26-04-07-prompt-eval-report.md` | 프롬프트 분석 품질 평가 리포트 |
| `docs/superpowers/specs/2026-04-08-eval-page-improvements.md` | 품질 평가 페이지 개선 스펙 (v2) |
| `docs/plans/26-04-08-crawler-architecture-redesign.md` | 크롤러 Strategy Pattern 리디자인 설계 |
| `docs/superpowers/specs/2026-04-09-user-feedback-and-result-ux-design.md` | 유저 피드백 & 결과 UX 개선 디자인 스펙 |
| `docs/superpowers/plans/2026-04-09-user-feedback-result-ux.md` | 유저 피드백 & 결과 UX 구현 플랜 (14 tasks) |

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
