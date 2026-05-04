---
type: codemap
updated: 2026-05-04
---

# portal.ai — 진입점 목록

## 페이지 엔트리

| 경로 | 파일 | 설명 |
|---|---|---|
| `/` | `src/app/page.tsx` | 메인 — Instagram URL 입력 → 슬라이드/아이템 picker → 검색 결과 |
| `/admin` | `src/app/admin/layout.tsx` | 어드민 루트 레이아웃 (requireApprovedAdmin 가드) |
| `/admin/login` | `src/app/admin/login/` | 어드민 로그인 |
| `/admin/signup` | `src/app/admin/signup/` | admin_profiles 생성 (status=pending) |
| `/admin/pending` | `src/app/admin/pending/` | 승인 대기 안내 화면 |
| `/admin/genome` | `src/app/admin/genome/` | 브랜드 Genome 관리 |
| `/admin/analytics` | `src/app/admin/analytics/` | 검색 분석 차트 |
| `/admin/eval` | `src/app/admin/eval/` | 검색 결과 골든셋 레이블링 |
| `/admin/search-debugger` | `src/app/admin/search-debugger/` | v4/v5 검색 쿼리 인스펙트 |
| `/admin/products` | `src/app/admin/products/` | 상품 CRUD + 일괄 내보내기 |
| `/admin/user-voice` | `src/app/admin/user-voice/` | 사용자 피드백 수집 |
| `/admin/pipeline-health` | `src/app/admin/pipeline-health/` | 배치 파이프라인 상태 |
| `/admin/crawl-coverage` | `src/app/admin/crawl-coverage/` | 32 플랫폼 파싱 상태 모니터링 |

---

## API 엔트리 (19개 활성 라우트)

### 메인 플로우

| Method | 경로 | 목적 |
|---|---|---|
| POST | `/api/instagram/fetch-post` | Instagram 포스트 스크래핑 (Apify) + shortcode 캐시 + R2 이미지 복사 |
| POST | `/api/find/analyze-post` | 단일 슬라이드 GPT-4o-mini Vision 분석 → items[] |
| POST | `/api/find/search` | AI Server /recommend 호출 → 5xx 시 v4 폴백 오케스트레이션 |
| POST | `/api/search-products` | v4 10-dim 가중합 검색 (strongMatches + general + 다양성 캡) |

### 어드민 API

| Method | 경로 | 목적 |
|---|---|---|
| GET/POST | `/api/admin/analytics` | 검색 로그 집계 + 차트 데이터 |
| GET/POST/PATCH | `/api/admin/brands` | 브랜드 CRUD + Genome 메타데이터 |
| GET | `/api/admin/crawl-coverage` | 32 플랫폼 파싱 상태 조회 |
| GET/POST/PATCH | `/api/admin/eval` | 골든셋 레이블 read/write |
| GET | `/api/admin/pipeline-health` | 배치 파이프라인 상태 |
| GET/POST/PATCH/DELETE | `/api/admin/products` | 상품 조회·수정·일괄 내보내기 |
| GET | `/api/admin/user-voice` | 사용자 피드백 목록 |
| 기타 6개 | `/api/admin/*` | 로그인, 승인 관리, 세부 어드민 기능 |

모든 어드민 API는 `requireApprovedAdmin()` 호출 필수.

---

## 스크립트 엔트리

| 파일 | 실행 방법 | 목적 |
|---|---|---|
| `scripts/crawl.ts` | `pnpm tsx scripts/crawl.ts` | 32 플랫폼 크롤러 (Playwright + Shopify JSON) — ~81k SKU 수집 |
| `scripts/import-products.ts` | `pnpm tsx scripts/import-products.ts` | 크롤 결과 → Supabase DB 적재 |
| `scripts/analyze-products.ts` | `pnpm tsx scripts/analyze-products.ts` | 상품 이미지 AI 분석 배치 |
| `scripts/eval-*.ts` | `pnpm tsx scripts/eval-<name>.ts` | 검색 평가 스크립트 (골든셋 생성, NDCG 계산 등) |
| `scripts/aws/` | EC2 Spot에서 실행 | EC2 인스턴스 론칭 + FashionSigLIP 임베딩 배치 |

---

## 빌드 / 실행 엔트리

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 (localhost:3400, Turbopack HMR) |
| `pnpm build` | 프로덕션 빌드 (Turbopack) |
| `pnpm lint` | ESLint 전체 검사 |
| `pnpm test` | vitest 1회 실행 |
| `pnpm test:watch` | vitest watch 모드 |

---

## Supabase 마이그레이션 엔트리

| 경로 | 설명 |
|---|---|
| `supabase/migrations/` | 순번 SQL 마이그레이션 (027개+). `supabase db push` 또는 `supabase migration up`으로 적용 |
| `supabase/seed.sql` | 개발 환경 시드 데이터 |

> 자세히: `docs/infra/deployment.md` (EC2 Spot 운영), `docs/infra/data-model.md` (마이그레이션 히스토리)
