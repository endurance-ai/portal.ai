---
id: SPEC-ARCH-APP-001
version: 0.1.0
status: draft
created: 2026-05-16
updated: 2026-05-16
author: MoAI orchestrator (manager-spec)
priority: high
issue_number: 0
---

# SPEC-ARCH-APP-001 — Next.js app 도메인 모듈화 + 단일 DB 접근 레이어

## HISTORY

- 2026-05-16 v0.1.0: 초안. stack-internal 재설계 4-SPEC 분해 중 3번 (실행 순서 3번). 언어 불변 (Next.js 16 / React 19 / TS 유지). 감사 결과 — `src/domains` / `src/repositories` / `src/shared` 부재, `src/app/api/search-products/route.ts` 852 LOC 단일 핸들러, 28개 admin route 가 pg Pool + PostgREST/Supabase 혼용, 테스트 4개 파일(coverage ~2/10), `src/app/_archive-qa/` 잔존 확인.

## Overview

`app/` (~24.8k LOC) 는 메인 진입점(`/` IG→Vision→검색)과 어드민(`/admin`)이 한 디렉터리에 얽혀 있다. 구조적 부채:

1. **도메인 경계 부재** — `src/domains/` / `src/repositories/` / `src/shared/` 부재. 기능별 코드가 `src/app/api/*` 와 `src/lib/*` 에 평면 분산.
2. **852-LOC 검색 엔진** — `src/app/api/search-products/route.ts` 가 v4 엔진 전체(스코어링/랭킹/쿼리빌드/타입)를 단일 핸들러에 인라인. 현 호출부는 `admin/search-debugger` + `_archive-qa` 뿐 (메인 플로우는 이미 v5 `/api/find/search` 경유).
3. **DB 접근 산재** — 28개 admin route + search-products 가 pg Pool 과 PostgREST/Supabase 호출을 혼용, 단일 접근 레이어 없음.
4. **죽은 코드** — `src/app/_archive-qa/` + 관련 dead enum (이미 `docs/ARCHITECTURE.md` "다음 단계 §5" 에 정리 시점 결정 항목으로 명시됨).

이것은 재작성이 아니라 추출/모듈화다. **사용자 가시 동작 변화 0 — `/` 메인 플로우와 `/admin` 모든 화면·동작이 재설계 전후 동일해야 한다 (HARD).** app 의 현 테스트 커버리지(2/10, 4 파일)는 실질 위험이므로, **모든 이동은 핵심 경로 characterization tests 통과 뒤에만** 수행한다.

## Goals (EARS-format requirements)

### REQ-APP-001 (Ubiquitous) — Domain Module Structure

The app **shall** organize feature code under `src/domains/{feature}/` modules: `search-v4`, `search-v5-client`, `instagram`, `vision`, `brand-resolution`, and `admin-tools/{brand-management,style-taxonomy,products,prompts,eval}`, replacing the flat `src/app/api/*` + `src/lib/*` dispersion.

### REQ-APP-002 (Ubiquitous) — Single DB Access Layer

The app **shall** route all database access through `src/repositories/`, collapsing the mixed pg Pool + PostgREST/Supabase calls currently scattered across the 28 admin routes and `search-products`, so route handlers never call a DB client directly.

### REQ-APP-003 (Event-driven) — Thin Route Handlers

**When** an API route receives a request, the handler **shall** be reduced to a thin sequence (auth → service → respond, target ~20 LOC), delegating business logic to a domain service and data access to a repository.

### REQ-APP-004 (Event-driven) — v4 Engine Extraction

**When** `/api/search-products` is invoked, the handler **shall** delegate to `src/domains/search-v4/` (split into `engine` / `scorer` / `ranker` / `query-builder` / `types` / `constants`), extracting the 852-LOC inline engine without changing scoring output.

[HARD] v4 스코어링 산식(10차원 가중합, 다양성 캡, tolerance→count) 은 추출 전후 byte-identical. `src/lib/search/locked-filter.ts` 와의 1:1 동등성 유지.

### REQ-APP-005 (Ubiquitous) — Shared Layer with Type Separation

The app **shall** provide `src/shared/{enums,types,utils,config}` where API contract types are separated from DB entity types, and `enums` contains constants only (no logic).

### REQ-APP-006 (Event-driven) — Admin / Main-Flow Decoupling

**When** admin CRUD code is modularized, it **shall** reside under `src/domains/admin-tools/` decoupled from main-flow domains (`instagram`/`vision`/`search-v5-client`), so admin changes cannot regress the `/` flow.

### REQ-APP-007 (Unwanted) — Dead Code Removal

The app **shall not** retain `src/app/_archive-qa/` or dead enums flagged in `docs/ARCHITECTURE.md` "다음 단계 §5"; these **shall** be deleted only after confirming zero live import references.

### REQ-APP-008 (Unwanted) — No User-Visible Behavior Change

The app **shall not** alter any user-visible behavior or screen in `/` or `/admin` as a result of this modularization. All changes are internal structure only.

## Acceptance Criteria

상세 Given/When/Then 시나리오는 `acceptance.md` 참고. 필수 게이트:

- **[HARD] 사용자 가시 동작 & 화면 불변**: `/` 메인 플로우(IG URL → 슬라이드 Vision → 브랜드 매칭 → 추천)와 `/admin` 전 화면(28 route 기반)의 렌더링·상호작용·에러코드 변경 0.
- **[HARD] Characterization-tests-precede-refactor 게이트** (app coverage 2/10 = 실질 위험): 어떤 코드 이동 전에도 다음 3개 핵심 경로 characterization tests 작성·통과 필수 —
  1. **메인 플로우**: `find-client.tsx` → `/api/find/search` → v5(`/recommend`) 응답 매핑(`toSearchProduct` shape) 스냅샷.
  2. **v4 검색 스코어링**: `/api/search-products` 고정 입력 → score breakdown + 결과 순서 스냅샷 (REQ-APP-004 추출 회귀 그물).
  3. **어드민 인증 게이트**: 대표 admin route 에 대한 `requireApprovedAdmin()` 우회 차단(비-admin 403) 동작 스냅샷.
- **타깃 폴더 레이아웃** (감사에서 도출한 구체 디렉터리명):
  - `src/domains/search-v4/` — `engine.ts` / `scorer.ts` / `ranker.ts` / `query-builder.ts` / `types.ts` / `constants.ts`
  - `src/domains/search-v5-client/` — ai `/recommend` 호출 클라이언트 (현 `find/search` 로직 추출)
  - `src/domains/instagram/` · `src/domains/vision/` · `src/domains/brand-resolution/`
  - `src/domains/admin-tools/{brand-management,style-taxonomy,products,prompts,eval}/`
  - `src/repositories/` — 단일 DB 접근 레이어 (pg Pool + PostgREST 호출 통합)
  - `src/shared/{enums,types,utils,config}/` — API 계약 타입 vs DB 엔티티 타입 분리, enums = 상수 전용
  - 삭제: `src/app/_archive-qa/` + dead enum
- **롤백 전략**: 도메인별 독립 PR. 각 추출은 기존 `src/lib/*` / route 인라인을 thin re-export shim 으로 유지 → import 호환, 회귀 시 shim 복원. `_archive-qa/` 삭제는 모든 도메인 추출 안정화 후 최종 별도 PR (revert 1회로 복원 가능). v4 엔진 추출(REQ-APP-004)은 characterization 스냅샷 diff 0 확인 후에만 머지.

## Doc Sync (CLAUDE.md 필수 동기화 3종)

- `docs/ARCHITECTURE.md` — 활성 진입점/모듈 구조: `src/domains/` + `src/repositories/` + `src/shared/` 레이어 반영, "다음 단계 §5" (archived 코드 처분) 완료 처리. **이 SPEC 완료 시 갱신 필수.**
- `docs/features/main-flow.md` — `find-*` 컴포넌트/`/api/find/*` 경로가 `src/domains/{instagram,vision,search-v5-client}` 로 이동함을 반영. **이 SPEC 완료 시 갱신 필수** (메인 플로우 파일 경로 변경 트리거).
- `docs/features/search-engine.md` — v4 엔진이 `src/app/api/search-products/route.ts` → `src/domains/search-v4/` 로 이동함을 "핵심 파일" 표에 반영. **이 SPEC 완료 시 갱신 필수.**

## What NOT to Build (Exclusions / NOT in scope)

- 언어 마이그레이션 (Go/Rust) — 전면 금지. Next.js/React/TS 유지.
- `web/` (sibling Next.js 프로젝트) — **스코프 외, 의도적 격리 유지. 코드 공유 없음. 절대 건드리지 않는다.**
- v4 스코어링 산식 변경 — 추출만, 산식 동결 (REQ-APP-004 byte-identical).
- v4/v5 엔진 선택 추상화 (`SEARCH_ENGINE_VERSION` port) — SPEC-SEARCH-UNIFY-001 스코프. 본 SPEC 는 `domains/search-v4` (추출) 와 `domains/search-v5-client` (추출) 를 **분리 모듈로 준비**만 한다.
- 검색 결과 품질 변경 — 0.
- 어드민 신규 기능 — 모듈화만, 기능 추가 없음.
- `_archive-qa/` 내부 로직 복원/재사용 — 삭제 대상, reference 금지 (CLAUDE.md 작업 규칙).
- DB 스키마 마이그레이션 — repository 레이어는 현 스키마 위 추상화일 뿐, 컬럼/테이블 변경 아님.

## Dependency Ordering & Parallelism

- **실행 순서**: 4-SPEC 중 **3번**. ai 다음 (app `domains/search-v5-client` 가 ai 안정 `/recommend` 계약 타깃).
- **병렬 제약**: SPEC-ARCH-AI-001 과 순차 권장 (ai 계약 안정화 후 app 클라이언트 추출이 흔들리지 않음). crawler 와는 독립 병렬 가능.
- **선행 의존**: 약함 — SPEC-ARCH-AI-001 의 `/recommend` 계약 안정화가 `domains/search-v5-client` 추출 타깃을 고정. **후행 의존**: SPEC-SEARCH-UNIFY-001 이 본 SPEC 의 `domains/search-v4` (thin fallback 어댑터 대상) + `domains/search-v5-client` 분리 구조에 의존.

## Cross-References

- SPEC-ARCH-AI-001: `src/domains/search-v5-client/` 가 ai `/recommend` 호출. 계약 불변 → app 클라이언트 무변경. ai 레이어링 선행 시 app 작업 안정.
- SPEC-SEARCH-UNIFY-001: **강결합**. 본 SPEC 가 만드는 `domains/search-v4/` 가 SEARCH-UNIFY 의 **thin degraded fallback 어댑터** 대상, `domains/search-v5-client/` 가 **active v5 엔진** 대상. SEARCH-UNIFY 의 `SearchEngine` port 가 이 두 도메인 모듈을 어댑터로 감싼다. 본 SPEC 는 port 자체를 만들지 않고 어댑터가 될 모듈을 분리 준비.
- SPEC-ARCH-CRAWLER-001: 독립 병렬. 동일 재설계 철학.
