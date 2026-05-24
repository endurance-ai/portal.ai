# 02 — 리포 & 로컬 셋업

> - 작성일: 2026-05-24
> - 상태: 인수인계 — repo별 스택·실행 방법
> - 대상·목적: 후임이 4개 repo를 받아 로컬에서 빌드·실행할 수 있게
> - 검증 기준: 각 repo `CLAUDE.md`·`package.json`/`pyproject.toml`·`.github/workflows/` 직접 확인

---

## 1. repo 요약

| repo | GitHub (org `endurance-ai`) | 스택 | 패키지 매니저 | 기본 브랜치 |
|---|---|---|---|---|
| **ai** | `ai-server` | FastAPI · Python · LangGraph `>=1.1.10` · Pydantic v2 | **uv** | `dev` |
| **app** | `kiko.ai-app` | Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · shadcn/ui · Auth.js v5 | **pnpm** | `dev` |
| **web** | `kiko.ai-web` | Next.js (랜딩) | pnpm | `dev` |
| **crawler** | `crawler` | Node 22 · TypeScript · Playwright 1.58 · Shopify JSON fetcher | pnpm | — |

> 흐름: `dev → feature → PR → squash merge`. `git add -A` 금지, force push 금지.

## 2. ai — 제품 본체 (FastAPI + 텔레그램 봇)

```bash
cd kikoai/ai
uv sync                                            # 의존성 설치
uv run uvicorn app.main:app --reload --port 8000   # 로컬 실행
uv run ruff check . && uv run ruff format .        # 린트 + 포맷
uv run pytest                                      # 테스트
docker compose up -d                               # 로컬 스택 (AI 서버만)
```

- 엔트리: `app/main.py` (FastAPI lifespan — DB 워밍업 + messenger adapter + setWebhook + Redis pool).
- 주요 API: `POST /webhooks/telegram`(봇), `POST /recommend`(내부, X-Internal-Token), `/health`, `/debug/*`(어드민 5개).
- 에이전트: `app/agents/` (ReAct loop + 8-tool registry), 그래프 `app/graphs/` (LangGraph StateGraph).
- DB 접근: PostgREST RPC(`search_products_v6`) via supabase-py async, 엔드포인트는 dev-app nginx shim.
- DB 마이그레이션(`ai` 스키마): `uv run alembic upgrade head` (`ai/migrations/`).
- 디렉토리 상세는 `ai/CLAUDE.md` 참조.

## 3. app — 백엔드 + 어드민 (Next.js 16)

```bash
cd kikoai/app
pnpm install
pnpm dev          # 개발 서버 (localhost:3400)
pnpm build        # 프로덕션 빌드 (Turbopack, standalone)
pnpm lint         # ESLint
pnpm test         # vitest
```

- **활성 진입점**: `/admin` (승인 게이트, 유일 활성 표면). `/` → `/admin` redirect.
- 인증: Auth.js v5 (Credentials Provider + bcryptjs + pg Pool).
- 검색(어드민 디버거): `/api/admin/search-v6-debug` → `search_products_v6` RPC + `product_embeddings`.
- **DB 스키마 소유**: `app/database/migrations/` (SQL, 089까지) — 시스템 전체의 `public` 스키마 정본. → [04](04-data-and-database.md).
- 경로 별칭 `@/*` → `src/*`. 서버 모듈은 `import "server-only"` 가드.
- 문서 매핑은 `app/CLAUDE.md` §문서 매핑 참조 (`docs/ARCHITECTURE.md`, `docs/infra/*` 등).

## 4. web — 랜딩 (Next.js)

```bash
cd kikoai/web
pnpm install
pnpm dev
pnpm build
```

- 순수 마케팅 1페이지. **앱 자체 환경변수 0개** (빌드 설정 외 런타임 시크릿 없음) — 인계 부담 최소.
- dev-app EC2 `:81` 에서 호스팅, ALB apex(`kikoai.me`)가 라우팅.

## 5. crawler — SKU 수집 (Node 22 + Playwright)

```bash
cd kikoai/crawler
pnpm install
pnpm exec playwright install   # 브라우저 바이너리
# 엔트리: src/cli.ts — crawl / import-products / import-attributes / import-brand-nodes / probe-reviews
```

- 엔진: Cafe24 KR(Playwright real Chrome, Akamai 우회) + Shopify global(`/products.json` fetcher).
- 플랫폼 config: `src/configs/platforms.ts` (46 SiteConfig).
- 쓰기: dev-app Postgres에 `upsert onConflict:"product_url"` (자연키). **임베딩/AI 분석 없음** — 순수 SKU·메타 수집.
- **자동 배포 없음** — CI는 lint/test만 (`deploy-dev.yml` 없음). 수동 실행.

## 6. 공통 주의

- 4개 repo 모두 **MoAI-ADK** 워크플로 적용 (`.moai/`, `.claude/rules/moai/`). 커밋 attribution은 MoAI 표준(`🗿 MoAI`).
- 로컬 실행에는 `.env`(또는 `.env.local`)가 필요하다 — 변수 목록·소스는 [03](03-environment-and-secrets.md).
- ARM64(EC2 t4g) 타겟 — Docker 빌드 시 `linux/arm64`.
