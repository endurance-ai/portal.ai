# portal.ai

AI 이미지 기반 패션 스타일 분석 & 크로스플랫폼 상품 추천. "Paste any Instagram post. We'll tell you where to buy the fit."

> 디렉터리는 `fashion-ai`로 남아있지만 서비스명·문서·UI 카피는 모두 **portal.ai**로 통일.

## 활성 진입점

- `/` — Instagram 포스트 URL → 슬라이드 Vision → 브랜드 매칭 → 상품 추천 (메인)
- `/admin` — 어드민 대시보드 (승인 게이트)

## 작업 규칙

- `docs/archive/` 는 종료된 문서 산출물 보관소. **탐색·참조하지 않는다.**
- `src/app/_archive-qa/` 는 종료된 코드 보관소(구 Q&A 6단계). Next.js `_` prefix로 라우팅 제외. **새 작업의 reference 금지.**
- 새 plan/spec은 `docs/plans/` 또는 `docs/research/` 에 작성. 종료 시 archive로 이동.
- 결정 지점이 모호하면 **혼자 가정하지 말고 먼저 질문할 것** (설계·기획·리팩터링 방향 등).

## ❗ 필수 동기화 문서 3종 (절대 stale 금지)

다음 3개 doc 은 코드 변경 시 **반드시 함께 업데이트**한다. 메인 플로우·검색·아키텍처가 stale 된 채 머지되면 신규 합류자/AI 가 잘못된 그림으로 작업 시작함.

| Doc | 트리거 — 다음 변경 시 갱신 |
|---|---|
| `docs/ARCHITECTURE.md` | 외부 서비스 추가/제거, 토폴로지 변경, 활성 진입점 변경, 마이그레이션 머지 |
| `docs/features/main-flow.md` | `/api/instagram/*`, `/api/find/*`, `_components/find-*` 변경, 에러 코드 추가/삭제, 캐시·picker UX 흐름 변경 |
| `docs/features/search-engine.md` | `/api/search-products` 알고리즘/스코어링 변경, v5 임베딩 인프라 진척, 검색 관련 enum/사전 변경 |

**`/feature-finalize` 스킬의 doc-update 단계에서 이 3개는 "변경 없음" 처리 금지.** 매 PR마다 코드 diff 와 cross-check 후 본문 갱신 여부 명시.

## 개발 명령어

```bash
pnpm dev          # 개발 서버 (localhost:3400)
pnpm build        # 프로덕션 빌드 (Turbopack)
pnpm lint         # ESLint
pnpm test         # vitest 1회
pnpm test:watch   # vitest watch
```

## 기술 스택 (한눈에)

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Turbopack), React 19 |
| UI | Tailwind 4, shadcn/ui, framer-motion, Pretendard |
| 이미지 분석 | OpenAI GPT-4o-mini Vision (LiteLLM 프록시 토글, 현재 OFF) |
| 검색 | v4 (enum 가중합) — v5 임베딩 인프라 적용 완료, 풀배치 미실행 |
| 저장 | Supabase Postgres + pgvector + pgroonga, Cloudflare R2 |
| 크롤러 | Playwright (Cafe24 22) + Shopify JSON (10) — 81k SKU / 697 브랜드 |
| 배포 | Vercel + AWS EC2 g5 Spot (배치) |

## 코딩 컨벤션

- 컴포넌트: PascalCase, named export. `export default` 는 page/layout 만
- 경로 별칭: `@/*` → `src/*`
- shadcn/ui: `pnpm dlx shadcn@latest add <component>`
- 서버/클라이언트: RSC 기본, 인터랙션 시만 `"use client"`
- 서버 모듈: `import "server-only"` 로 누출 가드 (R2, Supabase service-role, admin-auth)
- UI 텍스트: 메인 영어, 어드민 한글 (영어 고유명사 유지)
- 코드 스타일: 무필요 주석/추상화 금지. 기능 추가 외 정리는 별도 PR

## 📍 문서 매핑

작업 시작 전 해당 doc 1개만 Read 하면 됨.

| 작업 영역 | 읽을 doc |
|---|---|
| 시스템 전체 그림 / 토폴로지 | `docs/ARCHITECTURE.md` |
| 메인 플로우 (IG 스크래퍼 → Vision → 검색) | `docs/features/main-flow.md` |
| 검색 엔진 (v4 / v5 인프라 / plans) | `docs/features/search-engine.md` |
| 크롤러 (32 플랫폼, Cafe24/Shopify, 파서) | `docs/features/crawler.md` |
| DB 스키마 / 마이그레이션 / RLS | `docs/infra/data-model.md` |
| 환경변수 / AWS 프로필 | `docs/infra/env.md` |
| 배포 / EC2 Spot / Git 워크플로 | `docs/infra/deployment.md` |
| 새 API route / Supabase 클라이언트 / 프론트 패턴 | `docs/PATTERNS.md` |
| 디자인 시스템 (Editorial, cream/ink, Pretendard) | `docs/design/system.md` |
| 활성 plan (실행 대기) | `docs/plans/` |
| 경쟁사·차별화 리서치 | `docs/research/` |
| 새 크롤 사이트 추가 가이드 | `docs/guides/platform-parser-guide.md` |

> 어드민/archived flow 는 분리 안 함 → `docs/ARCHITECTURE.md` 안에 한 섹션씩.

## 작업 가이드라인

### Scope Challenge (브레인스토밍 단계)
- "이거 진짜 필요한가?" — 기존 코드/라이브러리로 해결 가능한지 먼저 확인
- 최소 범위는 뭔가? 절반으로 줄일 수 있나?
- 설명에 "그리고" 가 3번 이상 = 분해 필요 신호

### AI Slop 블랙리스트 (UI 작업 시)
- 보라색 그라디언트, 3-칼럼 피처 그리드
- 장식용 이모지, 전부 가운데 정렬
- 균일한 border-radius, blob/divider 장식
- 제네릭 카피 ("Unlock your potential" 류), 쿠키커터 카드 패턴

### NOT in scope (플랜 작성 시)
- 모든 plan 문서에 "NOT in scope" 섹션 필수
- 명시적으로 "이번에 안 하는 것" 나열 — 스코프 크리프 방지

## docs 파일명 컨벤션

`yy-mm-dd-{설명}.md` — 예: `26-04-26-search-engine-v5.md`
- 설명은 다른 문서와 구분되도록 구체적으로
- `docs/plans/`, `docs/research/` 둘 다 적용
- `docs/ARCHITECTURE.md`, `docs/PATTERNS.md`, `docs/features/*`, `docs/infra/*`, `docs/design/*` 는 예외 (고정 이름)

## GitHub

- 조직: endurance-ai · 레포: [endurance-ai/portal.ai](https://github.com/endurance-ai/portal.ai) (public)
- 기본 브랜치: `dev` · 흐름: dev → feature → PR → squash merge
- `git add -A` 금지, force push 금지, `Co-Authored-By: Claude <noreply@anthropic.com>` 포함
