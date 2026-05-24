# 00 — 인수인계 START HERE

> - 작성일: 2026-05-24
> - 상태: 인수인계 (handoff) — 운영 이관용. 작성 시점 기준 스냅샷
> - 대상·목적: kiko.ai 시스템을 **이어받아 셋업·배포·운영**할 후임/제3자. 이 폴더(`app/docs/handoff/`)만 읽고 시스템 전체를 파악·기동할 수 있게 한다
> - 검증 기준: 4개 repo(ai/app/web/crawler) 코드·마이그레이션·`.env.example`·CI 워크플로 직접 확인 (2026-05-24)
> - 인계자: 한상호(@bbang_dev) · 인계 사유: 운영 종료/이관

---

## 0. 한 줄 정의

**텔레그램 봇(`@kiko_fashion_ai_bot`)으로 사용자가 패션 사진·텍스트·Pinterest 링크를 보내면, 대화하며 비슷한 옷을 추천**하는 서비스. 카탈로그는 32개+ 자사몰에서 수집한 약 **118,504개 상품(SKU)**. 핵심 기술 = **FashionSigLIP 이미지 임베딩 + pgvector cosine 검색** + 그 위의 **LLM 대화 에이전트** + **Claude Haiku 4.5 Vision**(이미지 → 패션 속성 추출).

## 1. 현재 상태 (인계 시점) ⚠️ 먼저 읽을 것

| 항목 | 상태 |
|---|---|
| 운영 단계 | **단일 dev 환경 POC · 무사용자/저트래픽** — 이중화·오토스케일·DR 없음 |
| 사용자 접점 | **텔레그램 봇 하나** (`ai` repo). iMessage 채널은 미구현(예정만) |
| `app`의 공개 웹 플로우 | **제거됨** (2026-05-22, admin 전용 전환). `/` → `/admin` redirect |
| 임베딩 커버리지 | **전량(~118k) 완료** (풀배치 2026-05-19). 단 크롤러가 신규 SKU 추가 시 다음 배치 전까지 미임베딩 = 검색 제외 |
| 비용 특성 | Modal scale-to-zero(유휴 GPU $0) + EC2 2대 상시. 상세 [`docs/260519-cost-estimate.md`](../../../docs/260519-cost-estimate.md) |
| 인계 후 선택 | **계속 운영** / **중단·보존** 둘 다 가능 — 중단 절차는 [05](05-operations-runbook.md) §중단 |

> 이 시스템은 **봇이 제품 본체**, `app`은 사용자와 직접 대면하지 않는 **백엔드(DB·웹·어드민·인증)** 다. `app`의 "IG 포스트 → Vision → 추천" 코드는 잔존하나 운영 미사용(레거시).

## 2. 4개 repo 한눈에

| repo | 로컬 경로 | 역할 | 스택 | 사용자 대면 |
|---|---|---|---|---|
| **ai** | `kikoai/ai` | **제품 본체** — 텔레그램 봇 + LangGraph ReAct 대화 에이전트 + 검색 오케스트레이션 | FastAPI · Python · uv | O (봇) |
| **app** | `kikoai/app` | 백엔드 — **DB 스키마 소유** + 어드민 + 인증(Auth.js) + 웹 호스팅 | Next.js 16 · pnpm | 어드민만 |
| **web** | `kikoai/web` | 마케팅 랜딩 1페이지 | Next.js · pnpm | O (정적) |
| **crawler** | `kikoai/crawler` | 46개 플랫폼 SKU 수집 → DB write | Node 22 · TypeScript · Playwright · pnpm | X (오프라인 배치) |

> 4개 repo의 **유일한 공유 접점은 dev-app의 Postgres**. 봇은 `app`을 거치지 않고 DB에 직결한다.

## 3. 인계 문서 맵 (읽는 순서)

| # | 문서 | 언제 읽나 |
|---|---|---|
| **00** | 이 문서 | 가장 먼저 — 전체 그림 + 현황 |
| **01** | [`01-architecture.md`](01-architecture.md) | 시스템 토폴로지·데이터 흐름·인프라 이해 |
| **02** | [`02-repos-and-setup.md`](02-repos-and-setup.md) | 코드 받아서 로컬에서 돌려볼 때 |
| **03** | [`03-environment-and-secrets.md`](03-environment-and-secrets.md) | **인계받을 계정·키·시크릿 목록** (가장 실무적) |
| **04** | [`04-data-and-database.md`](04-data-and-database.md) | DB 스키마·마이그레이션·임베딩 데이터·백업 |
| **05** | [`05-operations-runbook.md`](05-operations-runbook.md) | 배포·서버 기동/정지·장애 대응·**중단 절차** |
| **06** | [`06-status-and-known-issues.md`](06-status-and-known-issues.md) | 미완·레거시·알려진 이슈 + **인수 체크리스트** |

### 더 깊은 레퍼런스 (워크스페이스 `docs/` — 인계 폴더 밖)

이 핸드오프는 인수인계 관점으로 재구성한 요약이고, **설계 의도·내부 로직 상세**는 아래 원본 레퍼런스에 있다 (중복 최소화 위해 링크만):

| 주제 | 원본 문서 |
|---|---|
| 시스템 개요 | [`docs/00-overview.md`](../../../docs/00-overview.md) |
| 인프라/아키텍처 (상세) | [`docs/01-architecture.md`](../../../docs/01-architecture.md) |
| 검색엔진 v6 (필터·랭킹·degrade) | [`docs/02-search-engine-v6.md`](../../../docs/02-search-engine-v6.md) |
| 이미지 임베딩 | [`docs/03-image-embedding.md`](../../../docs/03-image-embedding.md) |
| LLM 에이전트 + LLMOps | [`docs/04-llm-agent-llmops.md`](../../../docs/04-llm-agent-llmops.md) |
| 데이터 모델 + 크롤러 | [`docs/05-data-crawler.md`](../../../docs/05-data-crawler.md) |
| 비용 추정 | [`docs/260519-cost-estimate.md`](../../../docs/260519-cost-estimate.md) |

## 4. 인계 직후 첫 30분 (빠른 길잡이)

1. **이 문서 + [01](01-architecture.md)** 읽고 전체 그림 잡기.
2. **[03](03-environment-and-secrets.md)** 으로 인계받아야 할 계정/키 체크 — 무엇이 누구 소유인지 확인.
3. **[06](06-status-and-known-issues.md)** 의 인수 체크리스트로 접근 권한(AWS·GitHub·서버 SSH) 실제 확인.
4. 계속 운영할지 / 중단할지 결정 → [05](05-operations-runbook.md).

> **별도 첨부 예정**: 운영 DB 덤프(dump)가 이 핸드오프와 **함께 묶여 전달**된다 (복원 방법은 [04](04-data-and-database.md) §백업·복구).
