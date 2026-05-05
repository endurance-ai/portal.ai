# Crawler 리포 분리 Plan

> portal/app 의 `scripts/` 크롤링 코드를 `endurance-ai/crawler` 신규 리포로 분리한다. ZARA/H&M/29CM/무신사/유니클로/후르츠 추가 작업은 분리 완료 후 새 리포에서 시작.

작성일: 2026-05-05
기준 커밋: `5e3e7a0` (feature/spec-v6-core)

---

## 배경

- 현재 `scripts/` 안에 81k SKU / 697 브랜드를 수집하는 크롤러가 portal/app 본체와 같이 살고 있음
- Playwright 등 무거운 deps 가 웹 빌드와 무관하게 lockfile 에 박혀있음
- 신규 6개 플랫폼 (ZARA/H&M/29CM/무신사/유니클로/후르츠) 추가 예정 — anti-bot, proxy 등 웹과 완전히 다른 도메인
- 결론: **별도 리포로 분리**, DB(Supabase) 를 계약으로 유지. 마이크로서비스/API 게이트웨이는 도입하지 않음.

## 결정사항 (사전 합의)

| 항목 | 결정 |
|---|---|
| 리포 위치 | `endurance-ai/crawler` (조직) |
| 가시성 | public |
| 히스토리 | 새로 시작 (git filter-repo 미사용, README 에 ported-from 명시) |
| 시점 | 분리 → 그 후 신규 6 플랫폼 추가 |
| DB owner | portal/app 가 `supabase/migrations/` 계속 보유 |
| 통신 방식 | DB write-only (Supabase service-role 직접) |

## NOT in scope

- ❌ REST API / gRPC / 이벤트 버스 도입
- ❌ Kafka / SQS / BullMQ + Redis (Phase 1 에서는 cron 충분)
- ❌ K8s / ECS / Fargate
- ❌ portal/app 의 `scripts/aws/embed_products.py` (임베딩 배치) 이전 — 이건 portal/app 에 남김 (검색 도메인)
- ❌ `scripts/eval-*.ts`, `scripts/seed-eval-*.ts` (검색 평가용) — portal/app 에 남김
- ❌ ZARA/H&M 등 신규 플랫폼 구현 (분리 완료 후 별도 작업)

---

## 기술 스택 (이전 후)

| 영역 | 기술 | 비고 |
|---|---|---|
| 런타임 | Node.js + tsx (TS 직접 실행) | portal/app 와 동일 |
| 브라우저 자동화 | Playwright ^1.58 | Cafe24 22 사이트 |
| HTTP fetch | 표준 fetch | Shopify 10 사이트 |
| DB | @supabase/supabase-js (service-role) | DB 자체는 portal/app 와 공유 |
| 이미지 | Cloudflare R2 (S3 호환) | 동일 R2 버킷 공유 |
| 언어 | TypeScript | no transpile |

## 운영 (Phase 1, 분리 직후 ~ 6개월)

```
EC2 1대 (c6i.large 또는 t3.medium, Spot)
  └ /opt/crawler (git clone)
  └ systemd timer 또는 cron
       매일 새벽 3시 → pnpm tsx src/cli.ts crawl --platform=all
       → Supabase 직접 write + R2 이미지 업로드
  └ stdout → CloudWatch Logs (또는 파일)
  └ 실패 시 Discord webhook (선택)
```

Phase 2/3 은 플랫폼 20+ 또는 팀 확장 시점에 재검토. 지금은 Phase 1 만.

---

## 이전 대상 / 비대상 매핑

### crawler 리포로 이전

```
scripts/crawl.ts                       → src/cli.ts (또는 src/commands/crawl.ts)
scripts/import-products.ts             → src/commands/import-products.ts
scripts/import-attributes.ts           → src/commands/import-attributes.ts
scripts/import-brand-nodes.ts          → src/commands/import-brand-nodes.ts
scripts/probe-reviews.ts               → src/commands/probe-reviews.ts
scripts/test-detail-crawl.ts           → src/commands/test-detail-crawl.ts
scripts/test-parser.ts                 → src/commands/test-parser.ts
scripts/analyze-products.ts            → src/commands/analyze-products.ts
scripts/configs/platforms.ts           → configs/platforms.ts
scripts/configs/analyze-prompt.ts      → configs/analyze-prompt.ts
scripts/lib/cafe24-engine.ts           → engines/cafe24/index.ts
scripts/lib/shopify-engine.ts          → engines/shopify/index.ts
scripts/lib/parsers/detail/*           → engines/cafe24/parsers/detail/*
scripts/lib/parsers/review/*           → engines/cafe24/parsers/review/*
scripts/lib/types.ts                   → lib/types.ts
scripts/lib/body-info-extractor.ts     → lib/body-info-extractor.ts
scripts/lib/product-analyzer.ts        → lib/product-analyzer.ts
scripts/output/                        → output/ (gitignore)
```

### portal/app 에 남김

```
scripts/aws/embed_products.py          ← 임베딩 (검색 도메인)
scripts/aws/launch_embed_batch.sh      ← 임베딩 배치 스크립트
scripts/eval-prompt.ts, eval-prompt-v2.ts
scripts/eval-prompt-cases*.json
scripts/eval-search.ts
scripts/seed-eval-golden-queries.ts
scripts/seed-eval-golden-queries.test.ts
supabase/migrations/                   ← DB 스키마 owner
```

---

## 단계별 작업

### Phase A — crawler 리포 부트스트랩

A1. `endurance-ai/crawler` 신규 public 리포 생성 (gh cli 또는 웹)

A2. 로컬에 clone 후 초기 스캐폴드:
```
crawler/
  src/
    cli.ts                ← 진입점, commander 또는 단순 switch
    commands/             ← crawl, import-*, probe-* 등
  engines/
    cafe24/
      index.ts            ← 엔진 본체
      parsers/{detail,review}/
    shopify/
      index.ts
  configs/
    platforms.ts
    analyze-prompt.ts
  lib/
    types.ts
    body-info-extractor.ts
    product-analyzer.ts
  output/                 ← gitignore
  package.json
  tsconfig.json
  .env.example
  .gitignore
  README.md
```

A3. `package.json` 작성 (deps: playwright, tsx, typescript, @supabase/supabase-js, @aws-sdk/client-s3, dotenv 등 — 실제 portal/app `package.json` 에서 크롤러가 쓰는 것만 식별해서 옮김)

A4. `.env.example`:
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

A5. `README.md`:
- 프로젝트 목적 (포탈AI 크롤러)
- 빠른 시작 (clone → pnpm install → .env → pnpm tsx)
- 플랫폼 추가 가이드 (configs/platforms.ts 에 객체 추가)
- "Ported from endurance-ai/portal.ai @ commit 5e3e7a0 on 2026-05-05"
- 라이선스 (포탈.AI 와 동일)

### Phase B — 코드 이전

B1. portal/app 의 `scripts/` 에서 크롤러 관련 파일을 위 매핑대로 crawler 리포에 복사 (cp, 깃 히스토리 안 따라감)

B2. import 경로 수정: portal/app 안에서 `@/lib/...` 등 alias 썼다면 → crawler 내부 상대경로로 변경

B3. portal/app 의 `src/lib/...` 를 import 하는 부분이 있으면 → crawler 안으로 코드 복사 (의존성 끊기). 식별 대상:
- Supabase 클라이언트 헬퍼
- R2 업로드 헬퍼
- 타입 정의

B4. Supabase 타입: crawler 리포에서 자체적으로 `supabase gen types typescript --project-id <id> > lib/database.types.ts` 실행

B5. tsconfig.json: ESM, target ES2022, strict 모드

B6. `.gitignore`: `node_modules`, `output/`, `.env`, `*.log`

### Phase C — 동작 검증

C1. crawler 리포에서 1개 가벼운 Shopify 스토어 (예: 가장 작은 1개) 대상으로 dry-run:
```
pnpm tsx src/cli.ts crawl --platform=<shopify-test> --dry-run
```
→ DB write 없이 stdout 결과 확인

C2. 실제 write 1회: 같은 플랫폼 1개만 → Supabase 에서 row 생성 확인

C3. R2 이미지 업로드 1건 검증

C4. Cafe24 1개 스토어 (Playwright 경로) 도 동일하게 dry-run + 1회 write

C5. 웹 (portal/app `pnpm dev`) 메인 플로우 — 크롤러 결과가 검색에 정상 노출되는지 확인

### Phase D — portal/app 정리

D1. `scripts/` 에서 이전 대상 파일 삭제 (Phase A 매핑의 "이전" 목록만)

D2. `package.json` 에서 크롤러 전용 deps 제거:
- `playwright` (웹은 미사용 확실히 확인 후)
- 기타 크롤러 전용으로 식별된 것
- ⚠️ tsx, typescript 는 portal/app 도 쓸 수 있으므로 유지 여부 확인

D3. `pnpm install` → lockfile 갱신, `pnpm build` 통과 확인

D4. doc 업데이트 (필수 동기화 3종 + 크롤러 doc):
- `docs/ARCHITECTURE.md`: 토폴로지에서 크롤러 박스를 외부 서비스로 표시, "endurance-ai/crawler" 링크
- `docs/features/crawler.md`: 본문 대부분 삭제, "이 리포는 검색 결과 소비자. 크롤러 본체는 [endurance-ai/crawler](...) 에 있음." + 데이터 흐름만 1-2 단락
- `docs/features/main-flow.md`: 크롤러 언급 부분 링크 갱신
- `CLAUDE.md`: 크롤러 관련 줄 제거 또는 외부 리포 안내로 변경
- `docs/guides/platform-parser-guide.md`: crawler 리포로 이동 (또는 crawler 리포 README 에 흡수)

D5. `docs/infra/deployment.md`: EC2 배치 운영 섹션에 "크롤러는 별도 리포 운영" 명시

### Phase E — EC2 운영 이전

E1. EC2 인스턴스 1대 확보 (c6i.large Spot 권장):
- AMI: Ubuntu 22.04 또는 24.04
- Node.js 20+ 설치 (nvm 또는 NodeSource)
- pnpm 설치
- Playwright 의존 system 패키지: `npx playwright install-deps && npx playwright install chromium`

E2. /opt/crawler 에 git clone

E3. .env 파일 배치 (1Password CLI 또는 수동 — 시크릿은 Discord 봇 토큰 외 위 5종)

E4. systemd unit 작성 (`/etc/systemd/system/crawler-cafe24.service` + `.timer`):
```
[Unit]
Description=Crawler Cafe24 daily run

[Service]
Type=oneshot
WorkingDirectory=/opt/crawler
ExecStart=/usr/bin/pnpm tsx src/cli.ts crawl --platform=cafe24-all
StandardOutput=append:/var/log/crawler/cafe24.log
StandardError=append:/var/log/crawler/cafe24.err
```

E5. 1회 수동 실행 → 로그 확인 → 정상이면 timer enable

E6. (선택) Discord webhook: 실패 시 알림

### Phase F — 마무리

F1. portal/app 측 PR: "feat: scripts/ 크롤러 코드 외부 리포로 분리" — Phase D 결과물

F2. crawler 리포 첫 release tag: v0.1.0

F3. portal/app `docs/plans/` 의 본 plan 문서를 `docs/archive/plans/` 로 이동

F4. 회고: 분리 후 1주일 운영해보고 누락된 환경 변수 / 함수 / 의존성 정리

---

## 리스크 & 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 크롤러가 portal/app `src/lib/*` 에 숨은 의존 | crawler 빌드/실행 실패 | Phase B3 단계에서 grep 으로 모든 `@/` import 추적, 복사로 끊기 |
| Supabase service-role 키 노출 (public 리포) | 보안 사고 | `.env` 는 절대 커밋 금지, `.env.example` 에 placeholder만, gitleaks pre-commit 설정 |
| Playwright 버전 불일치로 EC2 동작 차이 | 크롤 실패 | package.json 에 정확한 버전 핀, EC2 첫 실행 시 `npx playwright install --with-deps` |
| anti-bot 우회 코드가 public 노출 | ZARA/H&M 차단 강화 가능성 | ZARA/H&M 추가 시점에 private 전환 재검토 (지금 결정사항: public 유지) |
| R2 버킷 공유로 인한 충돌 | 이미지 덮어쓰기 | 객체 키에 `<platform>/<sku>` 네임스페이스 명시 (이미 그럴 가능성 높음, B 단계에서 확인) |

---

## 체크리스트 (실행 시 사용)

- [ ] A1 — crawler 리포 생성
- [ ] A2 — 디렉토리 스캐폴드
- [ ] A3 — package.json
- [ ] A4 — .env.example
- [ ] A5 — README
- [ ] B1 — 파일 복사 (매핑표 기준)
- [ ] B2 — import 경로 수정
- [ ] B3 — portal/app 의존 끊기 (grep + 복사)
- [ ] B4 — supabase gen types
- [ ] B5 — tsconfig
- [ ] B6 — .gitignore
- [ ] C1 — Shopify dry-run
- [ ] C2 — Shopify 실제 write 1회
- [ ] C3 — R2 업로드 검증
- [ ] C4 — Cafe24 검증
- [ ] C5 — portal/app 메인 플로우 정상 확인
- [ ] D1 — scripts/ 정리
- [ ] D2 — deps 제거
- [ ] D3 — lockfile + build 확인
- [ ] D4 — doc 4종 갱신
- [ ] D5 — deployment.md 갱신
- [ ] E1 — EC2 셋업
- [ ] E2 — clone
- [ ] E3 — .env 배치
- [ ] E4 — systemd
- [ ] E5 — 수동 실행 검증
- [ ] E6 — Discord 알림 (선택)
- [ ] F1 — portal/app PR
- [ ] F2 — crawler v0.1.0 tag
- [ ] F3 — plan 문서 archive 이동
- [ ] F4 — 1주일 운영 후 회고

---

## 다음 액션

이 plan 승인되면 **Phase A1** (crawler 리포 생성) 부터 진행. 리포 생성은 사용자가 직접 (gh cli 권한) 또는 본 세션에서 `gh repo create` 로 진행 가능 — 어느 쪽으로 할지 결정 필요.
