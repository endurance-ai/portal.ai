# 06 — 현황 · 알려진 이슈 · 인수 체크리스트

> - 작성일: 2026-05-24
> - 상태: 인수인계 — 미완·레거시·리스크 + 인수자가 직접 확인할 체크리스트
> - 대상·목적: 후임이 "겉보기와 다른 부분"과 "건드리면 위험한 부분"을 미리 알게
> - 검증 기준: 각 repo CLAUDE.md, `docs/00-overview.md` §6, `docs/01-architecture.md` §6, `docs/05-data-crawler.md` §6 직접 확인

---

## 1. 레거시 / 미사용 (코드는 있으나 안 도는 것)

| 항목 | 상태 |
|---|---|
| `app` 공개 IG "snitch" 플로우 | **제거됨** (2026-05-22). admin 전용 전환. `/api/find`·`/api/instagram`·`/api/analyze` 등 일괄 삭제 |
| `app` IG 포스트 → Vision → 추천 | 잔존 코드 일부 있으나 **운영 미사용** (봇이 Postgres 직결이라 무관) |
| `subcategory` 컬럼 / RPC 파라미터 | products에서 거의 100% NULL인데 RPC 파라미터로 잔존 (데드) |
| 평가(eval) 인프라 | 골든셋·eval 테이블 migration 048에서 DROP — **검색 품질 자동 평가 없음** |
| iMessage 채널 | 미구현 (예정만) |
| Supabase / Vercel | 2026-05-10 폐기 컷오버 완료. 현재 EC2 자체호스팅 |

## 2. 알려진 이슈 / 리스크

| # | 이슈 | 영향 | 대응/메모 |
|---|---|---|---|
| R1 | **Modal `min_containers=0`** (코드) vs docstring "min_containers=1" 불일치 | idle 후 첫 임베딩 콜드스타트 → 추천 지연 | 비용↔지연 트레이드오프 의식적 결정 필요 |
| R2 | **HNSW 직렬 빌드 강제** (`/dev/shm` 64MB < 병렬 ~533MB) | 재인덱싱 시 테이블 lock 길어짐 | 근본해결 = compose `db`에 `shm_size: 1g` |
| R3 | **모델 설정 drift**: `config.py` 기본값 `nova-lite` ↔ 배포 `.env` `claude-haiku-4-5` | 운영 모델 추적 혼선 | 운영 진실은 **서버 `.env` 기준** |
| R4 | **단일 EC2·단일 Postgres** | dev-app에 매일 19:00 UTC pg_backup→S3 cron은 **있으나** EC2 running 시에만 — 중단(stop) 기간 백업 누락. 이중화/DR 없음 | 중단 정책에 맞춰 백업 재점검 ([04](04-data-and-database.md) §6.3) |
| R10 | **`/health/ready` 의 `supabase: disconnected` false-negative** | 응답 status=`degraded`/503 로 보이나 **실제 검색 경로는 정상** (운영 중 `/recommend` 200·5건, shim `/products?limit=1` 200 확인 2026-05-24). readiness 프로브가 shim 루트(`/`, nginx 404)를 보는 것으로 추정 | 패닉 금지 — `/recommend` 또는 shim `/products?limit=1` 로 실판정. green 필요 시 `app/api/health.py` 프로브 경로 점검 |
| R5 | **시크릿이 서버 `.env`에** (Parameter Store 미전환) | 서버 접근 잃으면 시크릿도 잃음 | 인계 시 `.env` 안전 채널 전달 필수 ([03](03-environment-and-secrets.md)) |
| R6 | `brand_nodes.primary_style_node_id` 배정(brand-VLM, 1300+/2072) 정확도 미평가 | FILTER1 토대인데 신뢰도 불명 | `docs/05-data-crawler.md` §6 E1 |
| R7 | `category_canonical` 752행 수작업 | 신규 카테고리 미매핑 → `other` → 게이트 무력화(조용한 저하) | 신규 플랫폼 추가 시 수동 매핑 |
| R8 | 데이터 신선도(in_stock 갱신)·크롤 실패 모니터링 없음 | stale 상품 노출 가능 | E2 |
| R9 | 봇 검색은 "image-first" 표방하나 멀티턴은 사실상 **text-first** | 검색 적합도는 Vision 텍스트 품질이 병목 | `docs/02`·`docs/04` |

> 더 깊은 리뷰 포인트·미검증 질문은 [`docs/260519-qna.md`](../../../docs/260519-qna.md) (설계 검토 Q&A).

## 3. 인수 체크리스트

받자마자 **접근 권한이 실제로 작동하는지** 확인. (값 확인이 아니라 "들어가지는지")

### 접근

- [ ] **AWS 콘솔** 로그인 (`ap-northeast-2`) — EC2 2대(dev-ai/dev-app), ECR `kikoai-dev/*`, ALB, ACM `*.kikoai.me` 보이는지
- [ ] **SSH** — `kikoai-key.pem` 으로 dev-ai(54.116.116.225)·dev-app(54.116.104.193) 접속되는지
- [ ] **GitHub** `endurance-ai` org 4개 repo(ai-server/kiko.ai-app/crawler/kiko.ai-web) 접근 + repo별 Actions Secrets 확인
- [ ] **도메인** `kikoai.me` 등록기관 계정 (⚠️ 어디인지 확인)
- [ ] **Modal** 워크스페이스 (portal-embed 앱 + Volume)
- [ ] **Cloudflare** R2 버킷
- [ ] **Apify** 계정 + actor
- [ ] **Telegram** BotFather에서 `@kiko_fashion_ai_bot` 제어 가능한지

### 서버 시크릿 (.env)

- [ ] dev-ai `.env` 확보 (봇 토큰·Modal·LiteLLM·Langfuse·Apify·DB)
- [ ] dev-app `.env` 확보 (`DATABASE_URL`·`AUTH_SECRET`·DB·Modal·R2)
- [ ] crawler `.env.local` 확보

### 데이터

- [ ] **DB 덤프 수령** (이 핸드오프와 함께 묶여 전달) + 복원 테스트 1회 ([04](04-data-and-database.md))
- [ ] Postgres 마이그레이션 적용 상태 확인 (`public` 089까지 / `ai` alembic head)

### 동작 확인

- [ ] 봇에 사진 1장 보내 추천 카드 받아보기 (end-to-end)
- [ ] `dev-app.kikoai.me/admin` 로그인 (어드민)
- [ ] Langfuse UI에서 trace 들어오는지

### 운영 결정

- [ ] 계속 운영 / 정지(보존) / 완전 종료 결정 → [05](05-operations-runbook.md) §중단

## 4. 인계 마무리 (인계자 측)

- [ ] DB 덤프 떠서 핸드오프와 함께 전달
- [ ] 서버 `.env` 3종 안전 채널로 전달
- [ ] 계정 소유권/권한 이전 ([03](03-environment-and-secrets.md) §ⓐ)
- [ ] IaC 레포(인프라 정의·Modal 스크립트·복구 runbook) 위치/접근 공유
- [ ] ⚠️ 미검증 3건(도메인 등록기관 / R2 키 변수명 / OpenAI 실사용) 답 채워주기
