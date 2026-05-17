# kiko.ai — 아키텍처 (Overview)

> 시스템 전체 그림 + 도메인별 doc 매핑. 깊은 내용은 각 `features/*` / `infra/*` 참조.
> 최종 업데이트: 2026-05-15 (brand_nodes 슬림화 067 + ai 스키마 GRANT 068 + admin reskin)

## 한 줄 요약

> "Paste any Instagram post. We'll tell you where to buy the fit." — IG 포스트 URL 한 장 → 슬라이드 룩 분해 → 32개 자사몰 ~81k SKU에서 매칭 상품 추천. 단일 Next.js 앱.

별도 백엔드 서버 없음. Next.js App Router(API Routes) 한 덩어리에 분석·검색·어드민이 모두 들어있다. **크롤링은 [`endurance-ai/crawler`](https://github.com/endurance-ai/crawler) 외부 리포** (EC2 batch). AI 인코딩 배치는 AWS EC2 Spot 단발 인스턴스로 외부화.

---

## 활성 진입점

| 경로 | 역할 | 입력 |
|---|---|---|
| `/` | 메인 플로우 — IG 포스트 → 슬라이드 picker → 아이템 picker → 상품 추천. 상세는 [features/main-flow.md](features/main-flow.md) | IG 포스트 URL (`?img_index=N` 옵션) |
| `/admin` | 운영 대시보드 (Genome, Analytics, Eval, Search Debugger, Products, User Voice 등) | — |

**메인 플로우 v2 핵심 (PR #31, 2026-04-26)**:
- 임의 IG post URL fetch (Apify 스크래퍼 사용 — 기존 `web_profile_info` 의 TOO_OLD 한계 제거)
- URL 의 `?img_index=N` 파싱 → 캐러셀 직접 점프
- img_index 없으면 슬라이드 picker UI 노출 → 사용자가 1장 선택
- 단일 슬라이드 Vision 분석 → 다중 아이템 검출 → 사용자가 1개 선택
- 선택된 1개 + 그 포스트의 tagged_users로 brandFilter 빌드 → strongMatches + general 검색
- `instagram_post_scrapes.shortcode` 로 캐시 (재요청 시 Apify 호출 스킵)

> 구 `/` (Q&A 6단계 에이전트)는 `src/app/_archive-qa/` 로 이동, 라우터 제외. PR #30(2026-04-26)에서 `/dna`, `/about`, `/archive` 도 제거됨.

---

## 시스템 토폴로지

```mermaid
graph TB
    subgraph Browser["🖥️ Browser"]
        U1["/ — IG post URL"]
        U2["/admin — dashboards"]
    end

    subgraph Vercel["⚡ dev-app EC2 — Next.js 16 App Router (standalone)"]
        MW["middleware.ts<br/>/admin/* auth gate"]
        API_IG["/api/instagram/fetch-post<br/>(cache lookup → Apify fallback)"]
        API_FIND_AN["/api/find/analyze-post<br/>(single slide, slideIndex)"]
        API_FIND_S["/api/find/search<br/>(AI server first → v4 fallback)"]
        API_SEARCH["/api/search-products<br/>v4 search engine (fallback)"]
        API_ADMIN["/api/admin/*<br/>brand-nodes/ai-insights/style-nodes/[code]/brands"]
        API_INTERNAL["/api/internal/classify-brand<br/>(X-Internal-Key, brand VLM)<br/>LiteLLM 토글 (LITELLM_DISABLED 가드)"]
    end

    subgraph External["🌐 External Services"]
        APIFY["Apify<br/>instagram-post-scraper<br/>(run-sync, ~5-10s)"]
        OAI["OpenAI<br/>GPT-4o-mini Vision"]
        AISERVER["AI Server (EC2)<br/>endurance-ai/ai-server<br/>FastAPI + Modal embed"]
        LITELLM["LiteLLM proxy<br/>(EC2, AI 서버 옆 컨테이너)"]
    end

    subgraph Data["💾 Persistence"]
        SB["dev-app Postgres 16<br/>+ pgvector + pgroonga<br/>+ PostgREST nginx shim<br/>public schema (app_user)"]
        AIDB["ai schema (ai_user 소유)<br/>card_impression / log_conversation_event<br/>user_taste_profile / user_session<br/>app_user = SELECT-only (068)"]
        R2["Cloudflare R2<br/>analyses/ + instagram-posts/"]
    end

    subgraph Batch["🛠️ Offline Batch"]
        CRAWL["endurance-ai/crawler<br/>(별도 리포 — EC2 batch<br/>Cafe24 Playwright + Shopify JSON)"]
        EMBED["scripts/aws/<br/>EC2 g5 Spot — FashionSigLIP<br/>(test only)"]
        BRANDSCRIPTS["scripts/<br/>fill_brand_meta.py (LiteLLM gpt-4o-mini)<br/>umap_brand_layout.py (BGE-m3 1024D → 2D)"]
    end

    U1 --> API_IG
    API_IG -. cache HIT .-> SB
    API_IG -. cache MISS .-> APIFY
    APIFY --> R2
    API_IG --> SB

    U1 --> API_FIND_AN
    API_FIND_AN --> OAI
    API_FIND_AN -.optional.-> LITELLM --> OAI

    U1 --> API_FIND_S
    API_FIND_S -->|HTTP /recommend| AISERVER
    API_FIND_S -. fallback .-> API_SEARCH
    AISERVER --> SB
    API_SEARCH --> SB

    U2 --> MW --> API_ADMIN
    API_ADMIN --> SB
    API_ADMIN --> AIDB

    CRAWL --> SB
    CRAWL -->|POST X-Internal-Key| API_INTERNAL
    API_INTERNAL -.litellm ON.-> LITELLM
    API_INTERNAL -.litellm OFF.-> OAI
    API_INTERNAL --> SB
    EMBED --> SB
    BRANDSCRIPTS --> SB

    classDef vercel fill:#1565c0,stroke:#0d47a1,color:#fff
    classDef ext fill:#6a1b9a,stroke:#4a148c,color:#fff
    classDef data fill:#2e7d32,stroke:#1b5e20,color:#fff
    classDef batch fill:#f57f17,stroke:#e65100,color:#fff

    class MW,API_SEARCH,API_IG,API_FIND_AN,API_FIND_S,API_ADMIN,API_INTERNAL vercel
    class APIFY,OAI,LITELLM,AISERVER ext
    class SB,R2,AIDB data
    class CRAWL,EMBED,BRANDSCRIPTS batch
```

---

## 외부 서비스 매트릭스

| 서비스 | 용도 | 상세 |
|---|---|---|
| dev-app EC2 | Next.js 16 호스팅 (output: standalone, GitHub Actions CI/CD, SPEC-INFRA-MIGRATE-001 P5). 2026-05-10 Vercel pause | [infra/deployment.md](infra/deployment.md) |
| dev-app Postgres 16 | 영속 데이터 + RLS + pgvector + pgroonga (자체호스팅, SPEC-INFRA-MIGRATE-001 P2/P4. Auth는 Auth.js v5로 전환 완료) | [infra/data-model.md](infra/data-model.md) |
| **PostgREST + nginx shim** | dev-app EC2 자체 호스팅 — Supabase.com REST 대신 로컬 PostgREST 라우팅 (SPEC-INFRA-MIGRATE-001 P6) | aws-infra 리포 |
| Cloudflare R2 | 이미지 저장 (단일 버킷, prefix 분리) | [infra/deployment.md](infra/deployment.md#cloudflare-r2--이미지-저장) |
| **Apify** (`instagram-post-scraper`) | Instagram 포스트 단발 스크래핑 — `run-sync-get-dataset-items`, ~5-10s, $0.0023/post | [features/main-flow.md](features/main-flow.md#step-1--instagram-포스트-스크래핑) |
| OpenAI | GPT-4o-mini Vision (단일 슬라이드 분석) + 브랜드 메타 추론 (`fill_brand_meta.py` via LiteLLM) + **brand-VLM 분류** (`/api/internal/classify-brand`, 5-image multimodal, LiteLLM 토글 가능 — `LITELLM_DISABLED !== "true"` 가드) | [features/main-flow.md](features/main-flow.md#step-2--슬라이드별-vision-분석) |
| **AI Server** ([endurance-ai/ai-server](https://github.com/endurance-ai/ai-server)) | v5 검색 오케스트레이션 (Modal embed + dev-app PostgREST RPC + 다양성 캡). `/api/find/search` 가 호출 | [features/search-engine.md](features/search-engine.md) |
| **Modal serverless** | FashionSigLIP `/embed` (이미지 임베딩, T4 GPU, scale-to-zero) — AI 서버가 호출 | (ai-server repo) |
| LiteLLM proxy | LLM 라우팅 + Langfuse callback (AI 서버 EC2 컨테이너, `54.116.116.225:4000`). 브랜드 메타 추론 배치에서도 사용 | [infra/deployment.md](infra/deployment.md) |
| Langfuse self-host | 관측성 (LLM/embed/파이프라인 trace) — AI 서버 EC2 컨테이너 | (ai-server repo) |

> **AI 서버는 별도 repo.** Python FastAPI. `AI_SERVER_URL` 미설정 또는 5xx/timeout 시 자동 v4 폴백.

---

## 도메인별 doc

| 영역 | doc |
|---|---|
| 메인 플로우 (IG → Vision → 검색) | [features/main-flow.md](features/main-flow.md) |
| 검색 엔진 (v4 + v5 인프라) | [features/search-engine.md](features/search-engine.md) |
| 크롤러 (외부 리포) | [endurance-ai/crawler](https://github.com/endurance-ai/crawler) — 데이터 흐름은 [features/crawler.md](features/crawler.md) |
| DB 스키마 / 마이그레이션 / RLS | [infra/data-model.md](infra/data-model.md) |
| 환경변수 / AWS 프로필 | [infra/env.md](infra/env.md) |
| 배포 / EC2 Spot / Git 워크플로 | [infra/deployment.md](infra/deployment.md) |
| 코드 패턴 (API route, DB/PostgREST, LLM, 프론트) | [PATTERNS.md](PATTERNS.md) |
| 디자인 시스템 | [design/system.md](design/system.md) |

아래 두 영역은 별도 doc 없이 본 문서에 직접.

---

## 어드민 (`/admin`)

3중 가드 (SPEC-INFRA-MIGRATE-001 P3, 2026-05-10 — Auth.js v5 전환):

1. `src/middleware.ts` — Auth.js `authorized` 콜백 → JWT 유효 + `admin_profiles.status = 'approved'` 아니면 `/admin/pending` 리다이렉트
2. `src/app/admin/layout.tsx` — RSC에서 `requireApprovedAdmin()` 재확인
3. `/api/admin/*` 라우트 핸들러 — 동일 헬퍼로 한번 더 검증

대시보드 (4섹션 카테고리화 — 2026-05-15 reskin): **분류 체계** (스타일 노드 / 브랜드 노드 / 프롬프트) / **검수 대기** (브랜드 노드 검수 / 브랜드 검수큐) / **시각화·분석** (브랜드 클러스터 / 분석 로그 / 검색 디버거) / **운영** (상품 DB / AI 인사이트 / 품질 평가 / 유저 보이스). 브라우저 탭·사이드바 타이틀 "portal.ai Admin" → **"kiko.ai Admin"** 변경.

Eval 모듈: migration 048 (2026-05-13) 로 eval_golden_queries / eval_golden_set / eval_judgments / eval_runs 4 테이블 + 관련 API 7개 드랍. `/admin/eval` 은 queue-only 단일 탭으로 단순화. `eval_reviews` 만 유지. 상세: `docs/features/search-engine.md` 의 "Evaluation Infrastructure" 섹션.

인증 모델 (P3 — Auth.js v5 Credentials Provider):
- 로그인: `signIn("credentials", {email, password})` → bcryptjs hash 검증 → JWT 발급
- 인증 경로: `/api/auth/[...nextauth]` (NextAuth handler)
- DB 직접 접근: `src/lib/db.ts` (pg Pool) → `admin_profiles.password_hash` 조회 (Supabase service role 대신 pg 직접)
- 세션: JWT 쿠키 기반 (구 Supabase SSR 쿠키 → Auth.js JWT)

승인 흐름:
- `/admin/signup` — 셀프 가입 비활성화됨 (redirect). 계정은 관리자가 DB 직접 생성
- 관리자가 DB에서 수동 `'approved'` 전환
- 다음 로그인부터 통과

⚠️ `admin_profiles` 는 own-row SELECT 정책 필수 (RLS 미설정 시 middleware가 null 받아서 무한 리다이렉트). 회고는 메모리 `feedback_supabase_middleware_rls.md`.

핵심 파일:
- `src/auth.ts` (NextAuth 설정), `src/middleware.ts`, `src/lib/admin-auth.ts`, `src/lib/db.ts`
- `src/app/api/auth/[...nextauth]/route.ts`, `src/app/admin/login/page.tsx`
- `src/app/admin/layout.tsx`, `src/app/admin/pending/page.tsx`

브랜드 그래프 관련 신규 (2026-05-10):
- ~~`src/app/admin/brand-graph/page.tsx`~~ — **067 후 redirect → `/admin/brand-clusters`** (037 BGE-m3 자산 폐기)
- `src/app/admin/brand-proposals/page.tsx` — LLM 추론 검수큐 테이블 뷰
- `src/app/api/admin/brand-graph/route.ts` (노드 + SKU 카운트), `neighbors/route.ts`, `detail/route.ts`
- `src/app/api/admin/brand-proposals/route.ts`, `bulk/route.ts` (일괄 승인/거절)
- ~~`src/components/admin/brand-detail-panel.tsx`~~ — **삭제됨** (브랜드 그래프 페이지 폐기와 함께), `src/lib/brand-normalize.ts`

스타일 노드 taxonomy 관리 신규 (SPEC-NODE-REDESIGN-001, 2026-05-13):
- `src/app/admin/style-nodes/page.tsx` — 노드 리스트 (is_active 필터 토글)
- `src/app/admin/style-nodes/new/page.tsx` — 노드 생성 폼
- `src/app/admin/style-nodes/[code]/page.tsx` — 노드 편집 + 소프트 삭제 (is_active=false)
- `src/app/api/admin/style-nodes/route.ts` — `GET` / `POST`
- `src/app/api/admin/style-nodes/[code]/route.ts` — `GET` / `PATCH` / `DELETE` (soft)
- `src/app/api/style-nodes/route.ts` — `GET` (admin-gated, taxonomy 공개 노출)
- `src/lib/style-nodes-db.ts` — DB fetch wrapper (5 min cache + in-flight dedup, `fetchActiveStyleNodes` / `buildNodeReference` / `getActiveNodeCodes`)

프롬프트 레지스트리 신규 (SPEC-PROMPT-REGISTRY-001, 2026-05-14):
- `src/app/admin/prompts/page.tsx` — situation 별 grouped 리스트 (Server Component)
- `src/app/admin/prompts/[id]/page.tsx` — 편집 + activate/deactivate (Client)
- `src/app/admin/prompts/new/page.tsx` — 신규 생성 / clone (Client)
- `src/app/api/admin/prompts/route.ts` — `GET` / `POST` (requireApprovedAdmin gate)
- `src/app/api/admin/prompts/[id]/route.ts` — `GET` / `PATCH` / `DELETE` (soft)
- `src/lib/prompts/registry.ts` — DB fetch + 5 min cache + in-flight dedup + placeholder resolver (style_nodes / static / enums / runtime 4종)
- `src/lib/prompts/analyze.ts` — thin wrapper → `buildPrompt("vision-analyze")`
- `src/lib/prompts/prompt-search.ts` — thin wrapper → `buildPrompt("prompt-search")`

Brand Node Review admin (SPEC-BRAND-NODE-001 P6, 2026-05-14):
- `src/app/admin/brand-node-review/page.tsx` — Server Component. brand_node_review_queue open 목록, reason별 grouped, pending rerun 카운트 표시
- `src/app/admin/brand-node-review/[id]/page.tsx` — Client Component. brand 상세 + VLM output + representative images + 4 액션 (Approve VLM / Manual 지정 / Rerun / Dismiss)
- `src/app/api/admin/brand-node-review/route.ts` — `GET` (list, ?reason/?status/?limit 필터)
- `src/app/api/admin/brand-node-review/[id]/route.ts` — `GET` (단건+brand 상세) / `PATCH` (approve/manual/dismiss/rerun 4 actions, atomic resolve WHERE resolved_at IS NULL)
- `src/app/api/admin/brand-node-review/process-reruns/route.ts` — `POST` (admin_note='RERUN_REQUESTED' 일괄 처리, 동시성 4, max 50건, 127.0.0.1 self-fetch SSRF 가드, AbortSignal.timeout 25s)
- `src/components/admin/process-reruns-button.tsx` — Client, POST 후 result 표시 + router.refresh

브랜드 노드 관리 페이지 + AI 인사이트 신규 (2026-05-15 admin reskin):
- `src/app/admin/brand-nodes/page.tsx` — 브랜드 노드 목록 (구 `/admin/genome` redirect 대상). 검색 + style_node 필터 + 페이지네이션. 행 클릭 시 detail drawer (brand-node-detail.tsx)
- `src/app/admin/brand-nodes/brand-node-detail.tsx` — 브랜드 상세 Sheet. products 대표이미지 + 유사 브랜드 + price_min/max_usd
- `src/app/admin/genome/page.tsx` — redirect → `/admin/brand-nodes`
- `src/app/admin/ai-insights/page.tsx` — 대화형 봇 운영 통계 3탭 (추천 성과 CTR / 대화 로그 / 세션). ai 스키마 raw SQL (pg Pool). recharts 시각화
- `src/app/api/admin/brand-nodes/route.ts` — `GET` (list, ?page&search&node_code 필터). PostgREST supabase 클라이언트 경유
- `src/app/api/admin/ai-insights/route.ts` — `GET` (3 영역 집계). **pg Pool 직접 + ai schema-qualified SQL** (`ai.card_impression`, `ai.log_conversation_event`, `ai.user_session`)
- `src/app/api/admin/ai-insights/user/route.ts` — `GET` (단일 user_key 전체 이벤트 시계열)
- `src/app/api/admin/style-nodes/[code]/brands/route.ts` — `GET` (해당 노드에 분류된 brand 목록 + representatives, ?role=primary|secondary|both)
- `src/components/admin/sidebar.tsx` — 4섹션 구조 (`NAV_SECTIONS`)로 리팩터링 + "kiko.ai Admin" 타이틀
- `src/lib/currency-to-usd.ts` — 어드민용 정적 USD 환산 유틸 (`toUsd` / `fmtUsd`). 대상 통화: USD/KRW/GBP/EUR/JPY/CNY

Brand-VLM 분류 endpoint (SPEC-BRAND-NODE-001 P2b + P3', 2026-05-14):
- `src/app/api/internal/classify-brand/route.ts` — `POST` (X-Internal-Key 인증). 흐름: classify_brand_acquire RPC → is_brand_representative 이미지 5장 → buildPrompt('brand-vlm') → OpenAI multimodal → confidence ≥ 0.7 → brand_nodes UPDATE / 미만 → review_queue. 응답: `{ ok, result: 'classified' | 'queued' | 'skipped' }`
- `src/lib/auth/internal.ts` — `requireInternalKey()` 헬퍼 (crypto.timingSafeEqual, 최소 16자)

---

## Brand Graph Infra (2026-05-10)

브랜드 유사도 그래프 + 메타 자율 추론 인프라. 검색 품질 향상의 사전 준비.

토폴로지:
- DB: 마이그레이션 037~043 + 055~056. **migration 067 (2026-05-15)** — brand_nodes.embedding/x_umap/y_umap/sensitivity_tags/brand_keywords/aliases/representative_image_urls/category_type/price_band 포함 13 컬럼 DROP + price_min_usd/price_max_usd 신규. `brand_similar` 그래프(42k edges) + `brand_attribute_proposals` 검수큐 + `brand_sku_counts` materialized view 는 유지. **brand_nodes.id bigserial** (056), primary/secondary_node_id FK + review_queue (055), pg_trgm (056)
- 배치: `scripts/fill_brand_meta.py` (gpt-4o-mini via LiteLLM 메타 추론 — brand_keywords 067 drop으로 dead), `scripts/umap_brand_layout.py` (1024D UMAP — 037 자산 dead), `scripts/register_unmatched_brands.ts`
- API: 5 라우트 (`/api/admin/brand-graph`, `neighbors`, `detail`, `/api/admin/brand-proposals`, `bulk`)
- UI: ~~`/admin/brand-graph`~~ (→ redirect `/admin/brand-clusters`, 037 자산 폐기), `/admin/brand-proposals` (검수큐)

상세: `HANDOFF-brand-graph.md`
스키마: `docs/infra/data-model.md` 의 brand_similar / brand_attribute_proposals 항목

---

## ~~Search Engine v6 Evaluation Infra~~ (드랍됨, 2026-05-13)

> **Migration 048** 로 전체 드랍. eval_golden_queries / eval_golden_set / eval_judgments / eval_runs 4 테이블 삭제. `src/lib/eval/` 전체 삭제. API 7 라우트 삭제. eval_reviews 만 유지. v6 재설계 시 새 SPEC.

SPEC: SPEC-V6-EVAL (완료→드랍), SPEC-V6-EVAL-V2 (완료→드랍)

---

## 코드 구조 — SPEC-ARCH-APP-001 재배치 (2026-05-17)

stack-internal 아키텍처 재설계. **언어·동작·화면 불변**, 레이어만 분리. 옛 `src/lib/*` / `src/app/api/*` 경로는 **thin re-export shim** 으로 남아 동작하며, 실체는 아래로 이동:

| 신규 위치 | 내용 |
|---|---|
| `src/shared/{enums,utils}/` | 순수 enum·유틸 (korean-vocab / color·style-adjacency / locked-filter / currency / format / utils) |
| `src/repositories/clients/` | 단일 DB 접근층 — `postgrest.ts` / `pg-pool.ts` (옛 `src/lib/{supabase,db}.ts`) |
| `src/domains/search-v4/` | v4 검색 엔진 (engine/scorer/ranker/query-builder/constants/types). `api/search-products/route.ts` 는 852→207 LOC thin 위임 |
| `src/domains/instagram/` · `src/domains/vision/` | IG 스크래퍼 · Vision 분석 (analyze-post 는 라우트 유지) |
| `src/domains/brand-resolution/` | resolve-brands / brand-normalize / brand-embed |
| `src/domains/admin-tools/{brand-management,style-taxonomy,products,prompts,eval,analytics}/` | 28개 admin 라우트 본문. `api/admin/*/route.ts` 는 전부 `export *` thin shim |

> 옛 경로 import 는 shim 으로 전부 유효 — 본 문서 내 다른 `src/lib/...` / `api/admin/...` 표기는 호환 경로이며 실체는 위 신규 위치다. 신규 코드는 신규 위치를 직접 참조.

**구 `src/app/_archive-qa/` (Q&A 6단계 플로우) 는 step 8 에서 삭제됨** (live import 0 검증, dead test 2파일 동반 제거). v4 가 쓰던 enum(korean-vocab/color·style-adjacency 등)은 `src/shared/enums/` 로 살아있음.

> ⚠️ ai-fence: `api/find/search` (v5 클라이언트) + SEARCH-UNIFY 포트는 본 SPEC 범위 외 — ai `/recommend` 계약 freeze 의존, 미접촉.
> 📝 doc-sync: `docs/features/main-flow.md` 경로 표기 갱신 ✅ 완료 (PR #57 머지 후 dev→feature 병합 + 상단 SPEC-ARCH-APP-001 노트 추가).

---

## 다음 단계 (v5 재설계와 묶일 결정 항목)

1. **검색 엔진 v5 분기 작성** — `/api/search-products` 에 dense + sparse + RRF 통합 쿼리 + 피처 플래그 `SEARCH_ENGINE_VERSION`
2. **FashionSigLIP 81k 풀배치 실행** — 인프라/스크립트만 준비됨, 실행 미시도
3. **LiteLLM 재가동** — EC2 인스턴스 OFF 상태, v5 인프라 잡을 때 같이 켜기
4. **`product_ai_analysis` 드랍** — v5 검증 완료 후
5. ~~**archived 코드 처분**~~ — ✅ 완료 (SPEC-ARCH-APP-001 step 8 — `_archive-qa/` 삭제, v4 사용 enum 은 `src/shared/enums/` 존치)

---

## 변경 이력

| 날짜 | 사건 |
|---|---|
| 2026-05-15 | **brand_nodes 슬림화 + admin reskin** — migration 067: brand_nodes 13 컬럼 drop (037 BGE-m3 텍스트 임베딩 자산: embedding/embedding_model/embedding_text_hash/embedded_at/x_umap/y_umap/umap_at + 옛 LLM 메타: sensitivity_tags/brand_keywords/aliases/category_type/representative_image_urls + price_band) + price_min_usd/price_max_usd (numeric) 신규 + products 기준 USD backfill. migration 068: app_user → ai 스키마 SELECT-only GRANT (card_impression/log_conversation_event/user_taste_profile/user_session). 신규 admin 페이지 `/admin/brand-nodes` (구 genome rename + redirect), `/admin/ai-insights` (ai 스키마 대화형 봇 통계 3탭). 신규 admin API `/api/admin/brand-nodes`, `/api/admin/ai-insights`, `/api/admin/ai-insights/user`, `/api/admin/style-nodes/[code]/brands`. `/admin/brand-graph` → `/admin/brand-clusters` redirect. 사이드바 4섹션 + "kiko.ai Admin" rebrand + 파비콘 교체. 삭제: brand-detail-panel/edit-panel/table/filters components, `src/lib/brand-cluster.ts`. search-products v4 brandDna 로드 disable (sensitivity_tags 067 drop). `src/lib/currency-to-usd.ts` 신규. |
| 2026-05-15 | **Brand Multimodal Embedding (SPEC-BRAND-EMBED-001)** — migration 063~066: `brand_multimodal_embeddings` (FashionSigLIP 768 halfvec, HNSW), `node_centroids`, `find_similar_brands` RPC, `brand_multimodal_umap`. 스크립트 5종 (`embed_brand_multimodal.py` / `build_node_centroids.py` / `build_adjacency_from_centroids.py` / `build_brand_umap.py` / `refresh_brand_embeddings_all.sh` wrapper). `style_node_adjacency` 자동 채움 인프라 완성 (source='embedding_derived', manual 보존). 신규 admin `/admin/brand-clusters` (UMAP 2D scatter, recharts) + `GET /api/admin/brand/[id]/similar`. `src/lib/brand-embed.ts` helper. **검색 엔진 미통합** — SPEC-SEARCH-V6 가 결합. **현재 11 brand 임베딩**, crawler bulk 완료 후 풀배치 예정. 037 BGE-m3 텍스트 임베딩은 stale (옛 15 코드 풀) — SPEC 5 정리 대상. 상세: `features/brand-embed.md`. |
| 2026-05-10 | **Auth.js v5 마이그 (SPEC-INFRA-MIGRATE-001 P3)** — Supabase Auth 제거 → Auth.js Credentials Provider + bcryptjs + pg Pool. 신규: `src/auth.ts`, `src/lib/db.ts`, `src/middleware.ts`, `/api/auth/[...nextauth]`. 삭제: `src/proxy.ts`, `src/lib/supabase-browser.ts`, `src/lib/supabase-server.ts`, `@supabase/ssr` |
| 2026-05-10 | **PostgREST 자체 호스팅 (SPEC-INFRA-MIGRATE-001 P6)** — dev-app EC2 내부에 PostgREST + nginx shim 구성. Supabase.com REST 엔드포인트 대체 (aws-infra 리포 반영됨) |
| 2026-05-14 | **Brand-VLM 분류 endpoint (SPEC-BRAND-NODE-001 P2b + P3')** — migration 059 (brand-vlm v1 prompt seed, gpt-4o-mini multimodal 5-image). migration 060 (PL/pgSQL 2 함수: `classify_brand_acquire` SELECT FOR UPDATE + 60초 mutex, `enqueue_brand_review` partial unique upsert). `POST /api/internal/classify-brand` 신규 (X-Internal-Key, 크롤러 전용). `src/lib/auth/internal.ts` requireInternalKey (timingSafeEqual). crawler → kiko.ai 내부 API 채널 개통. |
| 2026-05-14 | **Brand Node Review admin UI + LiteLLM 토글 (SPEC-BRAND-NODE-001 P6)** — `/admin/brand-node-review` (Server, grouped by reason, pending rerun count) + `[id]` (Client, 4 actions: approve/manual/rerun/dismiss). admin API 3개 (`GET list`, `GET/PATCH [id]`, `POST process-reruns`). atomic resolve (WHERE resolved_at IS NULL), SSRF 가드 (127.0.0.1 self-fetch), XSS 가드 (http/https URL 검증). classify-brand LiteLLM 토글 (`LITELLM_DISABLED !== "true"` — analyze/route.ts 와 동일 패턴). 사이드바 "브랜드 노드 검수" 메뉴 추가. |
| 2026-05-14 | **Brand Node Redesign schema (SPEC-BRAND-NODE-001 PR-X)** — brand_nodes 에 primary/secondary_node_id FK + node_confidence + representative_image_urls (055). brand_nodes.id uuid → bigserial 전환 + 4 FK bigint swap (brand_similar/brand_attribute_proposals/brand_node_review_queue) + pg_trgm extension (056). `brand_node_review_queue` 신설. 4 admin TS 파일 brand_id 타입 string → number. `supabase/migrations/` → `database/migrations/` 디렉토리 rename (50+ 파일). |
| 2026-05-14 | **Prompt Registry (SPEC-PROMPT-REGISTRY-001)** — `prompts` 테이블 (052) + seed 2 row (053: vision-analyze v1 / prompt-search v1) + `activate_prompt(bigint)` PL/pgSQL RPC (054, atomic activate). `src/lib/prompts/analyze.ts` + `prompt-search.ts` 하드코딩 170+ 라인 → thin wrapper. `PROMPT_SEARCH_USER` sync export 제거 → `getPromptSearchUser()` async. 어드민 프롬프트 CRUD 3 페이지 + API 4 라우트. |
| 2026-05-13 | **Style Node taxonomy DB 이전 (SPEC-NODE-REDESIGN-001)** — `style_nodes` 테이블 (049, A~T 20 node seed via 050) + `style_node_adjacency` (051, 빈 테이블 — SPEC-BRAND-EMBED-001 가 채울 예정). `fashion-genome.ts` STYLE_NODES const → DB fetch wrapper (`style-nodes-db.ts`). Prompt builder 시그니처 const → async fn. 어드민 style-nodes CRUD 3 페이지 + API 4 라우트. |
| 2026-05-13 | **DB cleanup (migrations 044~048)** — legacy 5종 drop (item_search_results, set_hnsw_ef_search, rls_auto_enable, handle_new_admin_user, brand_nodes.platform), PAI v6 axis 8 컬럼 추가 (045), 테이블/컬럼 한글 COMMENT (046), pgcrypto extension drop (047), eval 4 테이블 drop + admin/eval queue-only 단순화 (048) |
| 2026-05-10 | **브랜드 유사도 그래프** — 마이그레이션 037~043 (brand_similar/embedding/proposals/aliases/UMAP/SKU 카운트) + 어드민 2 페이지 + 5 API 라우트 + 배치 스크립트 3종. EC2 self-host CI/CD (Dockerfile + deploy-dev.yml, SPEC-INFRA-MIGRATE-001 P5) |
| 2026-05-05 | **크롤러 외부 리포 분리** — `scripts/crawl.ts` + 32 플랫폼 파서 → [`endurance-ai/crawler`](https://github.com/endurance-ai/crawler). DB 가 양 리포의 계약. kiko.ai package.json 에서 `playwright` 제거 |
| 2026-05-04 | **검색 v6 평가 인프라 (SPEC-V6-EVAL)** — eval_golden_queries / eval_judgments / eval_runs 3 테이블 + NDCG@10/Precision@5 lib + 6 API 라우트 + admin/eval 5탭 UI → 2026-05-13 전체 드랍 |
| 2026-04-26 | **메인 플로우 v2 머지 (PR #31)** — Apify 스크래퍼 + 단일 슬라이드/아이템 정밀 매칭 + 캐시 + 4-step picker UI |
| 2026-04-26 | `/find` 메인 승격 + 구 Q&A `_archive-qa/` 이동 + 문서 도메인별 분할 |
| 2026-04-26 | `/dna`, `/about`, `/archive` 라우트 + 관련 DB 제거 (PR #30) |
| 2026-04-24 | v5 인프라 마이그레이션 027 적용 (pgvector + pgroonga + bulk RPC) |
| 2026-04-23 | 해외 Shopify 자사몰 10개 크롤 — 35,746 SKU 추가 |
