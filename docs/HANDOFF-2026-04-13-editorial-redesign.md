# HANDOFF — Editorial Redesign (2026-04-13)

> 이 문서는 **다음 세션**이 이 리디자인 프로젝트를 이어받기 위한 인수인계 기록.
> 현재 브레인스토밍 단계 완료, 코드 작업 **미시작**. 다른 세션의 Q&A Agent 리팩터 머지를 기다리는 중.

---

## 1. 현재 상태 한 줄 요약

디자인 스펙 + 루트 `DESIGN.md` 커밋 완료. 실제 코드 작업은 Q&A Agent 리팩터 머지 후 새 브랜치에서 시작 예정.

## 2. 이 세션에서 결정한 것 (Lock-in)

| 항목 | 결정 |
|------|------|
| **Spine (DNA)** | Editorial (SSENSE × Mediabus × Apartamento) |
| **배경 / 텍스트** | Cream `#fafaf7` / Ink `#111` |
| **폰트** | Pretendard Variable 단일 패밀리 · weight 400/500/600/700 · 이탤릭 없음 |
| **워드마크** | `PORTAL` · caps · letter-spacing 0.32em · weight 600 · 16px |
| **헤드라인 H1** | `The look you love, piece by piece.` (500 + 700 굵기 대비) |
| **언어** | English 전용 (KR 병기 금지 · KR 버전은 별도 트랙) |
| **원칙** | Lean over dense — 가진 데이터 전부 노출 금지, 상품+이미지 우선 |
| **Scope** | 유저-facing 12 화면 (Admin 제외) |
| **로직 변경** | 없음 (presentation layer only) |

## 3. 스코프 — 리디자인 대상 12 화면

| # | Screen | Route | Status |
|---|--------|-------|--------|
| A1 | Home hero | `/` | 기존 대체 |
| A2 | Analyzing loading | `/` (state) | Portal Warp 파티클 → 숫자+line |
| A3 | Result classic | `/result/[id]` | LookBreakdown → 번호 리스트 (hotspot 제거) |
| B1 | Agent 1/4 Input | `/agent` | 신규 UI (로직 존재) |
| B2 | Agent 2/4 Items+Lock | `/agent` | 신규 UI |
| B3 | Agent 3/4 Refine | `/agent` | 신규 UI |
| B4 | Agent 4/4 Results | `/agent` | 신규 UI |
| C1 | Empty results | `/result/[id]` | 기존 대체 |
| C5 | Refine bar | 공통 | 기존 대체 |
| C6 | Feedback flow | `/result/[id]` | 기존 대체 |
| D3 | About | `/about` | **신규 라우트** |
| D4 | Archive | `/archive` | **신규 라우트** |

**제외:** Admin (`/admin/*`) · Login / Signup / Payment · KR locale

## 4. 저장된 산출물

### 4.1 커밋된 파일 (feature/change-to-qa-agent 브랜치)

| 파일 | 목적 | 커밋 |
|------|------|------|
| `docs/superpowers/specs/2026-04-13-editorial-redesign-design.md` | 상세 디자인 스펙 (13 섹션) | `a858a66` |
| `DESIGN.md` (루트) | AI 에이전트용 시스템 문서 (Stitch 9-section 포맷) | 이번 커밋 |
| `docs/DESIGN.legacy.md` | 기존 Digital Atelier archive (rename from `docs/DESIGN.md`) | 이번 커밋 |
| `docs/HANDOFF-2026-04-13-editorial-redesign.md` | 이 파일 | 이번 커밋 |

### 4.2 Brainstorm 시각 레퍼런스 (git-ignored)

`.superpowers/brainstorm/73881-*/content/` 안에 6개 mockup HTML:
- `spine-direction.html` — 초기 Editorial/Moodboard/Catalog 3개 후보
- `editorial-refined.html` — A 방향 첫 고해상도 (Fraunces 세리프)
- `editorial-sans.html` — Pretendard로 교체
- `editorial-v3.html` — 워드마크·헤드라인 선택지
- `editorial-locked.html` — W4 + H1 최종 확정
- `screen-map.html` — **12 화면 전체 시스템 맵 (가장 중요)**

다음 세션 시작 시 `.superpowers/brainstorm/skills/brainstorming/scripts/start-server.sh --project-dir /Users/hansangho/Desktop/fashion-ai` 로 서버 재기동하면 같은 파일들이 다시 서빙됨. 또는 직접 브라우저로 파일 열기 가능.

### 4.3 메모리

`/Users/hansangho/.claude/projects/-Users-hansangho-Desktop-fashion-ai/memory/`
- `feedback_design_lean_over_dense.md` (이번에 추가) — 향후 모든 디자인 판단에 적용

## 5. 대기 중인 것 — 다음 세션 시작 전 필요

**현재 브랜치 `feature/change-to-qa-agent`에 in-flight 변경이 많음.**

**삭제된 (staged):** `src/app/result/[analysisId]/*`, `src/components/result/*`, `src/components/upload/*` (UploadZone, StyleChips), `src/app/api/feedback/route.ts`, `src/lib/mock-data.ts`, `src/lib/parse-price.ts`

**추가된 (untracked):** `src/app/_qa/` (Agent 4-step 컴포넌트 · `page.tsx` 아직 없음) · `src/lib/search/` · `vitest.config.ts`

**이 상태에서 UI 작업 시작하면 안 되는 이유:**
1. Agent 엔트리 `src/app/agent/page.tsx` 존재하지 않음 → 빌드 실패 가능
2. 결과 페이지 전부 삭제됨 → 내가 "Replaces"로 지칭한 컴포넌트 이미 사라짐
3. 두 세션 동시 진행 시 충돌 위험

**→ 다른 세션이 Q&A Agent MVP 완성 + main 머지할 때까지 대기.**

## 6. 다음 세션 시작 방법

### Step 1 — Q&A Agent 머지 확인
```bash
git fetch origin
git log origin/main --oneline -5   # Q&A Agent 관련 커밋이 main에 있는지
```

### Step 2 — 새 브랜치 생성 (main 기반)
```bash
git checkout main
git pull
git checkout -b feature/editorial-redesign
```

### Step 3 — 컨텍스트 로드 (순서 중요)
1. `DESIGN.md` (루트) — 토큰 / 규칙
2. `docs/superpowers/specs/2026-04-13-editorial-redesign-design.md` — 상세 스펙
3. `docs/plans/26-04-13-qa-agent-mvp.md` — Q&A 로직 컨텍스트
4. `docs/HANDOFF-2026-04-13-editorial-redesign.md` — 이 문서
5. 현재 `src/app/` 실제 파일 구조 확인 (`ls src/app/`, `ls src/components/`)

### Step 4 — Brainstorm 서버 재기동 (선택)
시각 레퍼런스 필요 시:
```bash
bash /Users/hansangho/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/scripts/start-server.sh --project-dir /Users/hansangho/Desktop/fashion-ai
```
기존 mockup HTML 6개가 그대로 서빙됨. `screen-map.html`이 가장 유용.

### Step 5 — writing-plans 스킬 호출
스펙 + 실제 포스트-머지 파일 구조를 기반으로 구현 플랜 작성. 플랜 예상 구조:

1. **Phase 1 — 토큰 + Chrome** (설계 시스템 기반)
   - Tailwind / globals.css에 `--cream --ink --line --stone` 토큰 추가
   - Pretendard 로드 (CDN 또는 `@next/font/local`)
   - Header (PORTAL wordmark + nav) 재작성
   - Footer 간소화
2. **Phase 2 — Home + Analyzing** (A1, A2)
3. **Phase 3 — Result 계열** (A3, C1, C5, C6)
4. **Phase 4 — Agent 4-step** (B1–B4) — 기존 `_qa/` 컴포넌트 재스타일링
5. **Phase 5 — 신규 라우트** (D3 About, D4 Archive)
6. **Phase 6 — 반응형 + 마무리**

## 7. 열린 질문 (플랜 단계에서 결정)

스펙 섹션 12에 기록된 것들:
1. A3 hotspot 기능 완전 제거 확정?
2. D3/D4 라우트 추가 시 nav "Index · Archive · About · EN" 구조로?
3. About 본문 copy 초안 vs 별도 작성?
4. Archive 데이터 소스 (분석 테이블 전체 vs 로컬스토리지 vs 인증 기반)?
5. Pretendard 서브셋 전략 (EN 전용 경량화)?
6. framer-motion 잔존량 (entrance 애니메이션 유지 vs 정적)?

## 8. 위험 요소 & 주의사항

- **다른 세션의 리팩터 범위가 불명확** — 내가 "Replaces"로 지칭한 기존 컴포넌트가 완전히 사라진 후 어떤 형태로 재구성되는지 머지 후 확인 필수.
- **검색 로직은 절대 건드리지 않기** — 이번은 presentation layer only. `src/app/api/search-products/route.ts`, `src/lib/enums/*`, DB 스키마 모두 무변경.
- **shadcn/ui 컴포넌트 전면 재작성 금지** — CSS 토큰 교체로 해결 가능. Button/Input 등은 기존 API 유지.
- **Git 규칙:** `git add -A` 금지 · force push 금지 · 변경 파일만 명시적 add · Co-Authored-By 포함.
- **feature-finalize 워크플로우 준수** — dev PR → 리뷰 → 머지 (main 직접 머지 금지).

## 9. 빠른 질의응답용 메모

- **왜 Editorial spine?** — 5개 레퍼런스 중 사용자가 A 직접 선택. "죽이는데?" 반응.
- **왜 Pretendard?** — 초기 Fraunces 세리프 시도 후 "좀 더 깔끔한게" 피드백 + Mediabus 스크린샷 참조로 전환. Pretendard 1개로 굵기 대비 리듬.
- **왜 W4 tracked caps?** — 사용자 선택. 미니멀·중성·COS/Jil Sander 톤.
- **왜 H1 "piece by piece"?** — 사용자 선택. "A photograph, and its echoes"는 "의미 모호"로 반려.
- **왜 한글 병기 금지?** — 사용자 지시 "영어로만 통일, 한글 버전은 나중에 따로".
- **왜 Admin 제외?** — 한글+데이터 밀도가 에디토리얼 톤과 상충. 별도 시스템.
