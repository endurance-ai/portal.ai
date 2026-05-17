---
id: SPEC-SEARCH-UNIFY-001
version: 0.1.0
status: draft
created: 2026-05-16
updated: 2026-05-16
author: MoAI orchestrator (manager-spec)
priority: high
issue_number: 0
---

# SPEC-SEARCH-UNIFY-001 — 버전 스왑 가능한 SearchEngine Port + v4 Thin Fallback

## HISTORY

- 2026-05-16 v0.1.0: 초안. stack-internal 재설계 4-SPEC 분해 중 4번 (실행 순서 마지막, 교차 SPEC). 언어 불변. 감사 결과 — 메인 플로우는 이미 v5 전용(`find/search` → ai `/recommend`), **v4 in-process 폴백은 코드에서 이미 제거됨** (`find/search` 는 AI 실패 시 502 반환). `docs/features/main-flow.md` line 221 은 "v4 in-process 폴백" 을 아직 기술 — **stale**. 사용자가 v6 를 능동 개발 중 → 동일 port 뒤 v6 드롭인이 1급 요구사항.

## Overview

이 SPEC 는 검색 엔진을 **버전 스왑 가능**하게 만드는 교차 SPEC 다. **스코어링 재작성이 아니다.**

현 실상 (감사로 확정):
- 메인 플로우: `find-client.tsx` → `/api/find/search` → `POST {AI_SERVER_URL}/recommend` → ai v5 파이프라인 → `search_products_v5` RPC → 스코어링/다양성.
- **v4 폴백은 이미 제거됨** — `find/search` 는 AI 서버 5xx/timeout/미설정 시 502 (`AI_SERVER_FAILED`) 반환. main-flow.md 의 "v4 in-process 폴백" 기술은 stale.
- v4 엔진(`search-products` 852 LOC)은 SPEC-ARCH-APP-001 에서 `src/domains/search-v4/` 로 추출됨. 현 live 호출부는 `admin/search-debugger` 뿐.

본 SPEC 가 하는 일:
1. **`SearchEngine` port (port/adapter)** 정의 — `find/search` 가 구체 엔진이 아닌 port 를 호출.
2. **`SEARCH_ENGINE_VERSION` 피처 플래그** — active 엔진 선택.
3. **v5 = active** — ai `/recommend` 어댑터 (스코어링/다양성 단일 진실원천, SPEC-ARCH-AI-001 `DiversifyService`).
4. **v4 = thin degraded fallback 재도입** — v5 5xx/timeout 시에만, circuit breaker 뒤. **raw RPC 결과만, 스코어링 중복 유지보수 없음** (degraded 명시 표기). 이는 제거된 폴백의 *의도적 재도입* 이지 보존이 아니다.
5. **v6 = 미래 드롭인 seam** — 동일 port 뒤, app 변경 0. 사용자의 v6 작업을 막거나 리팩터하지 않는다.

**사용자 가시 동작 변화 0 (HARD)** — v5 정상 경로의 결과·화면은 불변. v4 fallback 은 v5 완전 실패 시에만 발동하는 degraded 안전망이며, 평시 경로 동작·품질은 그대로다.

## Goals (EARS-format requirements)

### REQ-SU-001 (Ubiquitous) — Versioned SearchEngine Port

The system **shall** expose a single `SearchEngine` port (request/response contract shared in shape between app TypeScript and ai Python) that `/api/find/search` calls instead of any concrete engine, so the active engine is selected behind the port.

### REQ-SU-002 (State-driven) — Engine Selection by Feature Flag

**While** `SEARCH_ENGINE_VERSION` is set, the system **shall** route search requests to the engine adapter matching that version (`v5` = active default), without any change to `/api/find/search` caller code.

### REQ-SU-003 (Ubiquitous) — v5 as Single Source of Scoring/Diversity

The system **shall** implement the `v5` adapter as a call to the ai `/recommend` service (SPEC-ARCH-AI-001 `SearchRepository` + `DiversifyService`), keeping ai as the single source of post-RPC scoring and diversity. No scoring logic is duplicated into the app.

### REQ-SU-004 (Unwanted) — v4 Fallback Only on v5 Failure

**If** the `v5` adapter returns a 5xx or times out, **then** the system **shall** invoke the `v4` thin degraded fallback (raw RPC via `src/domains/search-v4/`, no scoring/diversity maintenance) and **shall** mark the response as `degraded`. The system **shall not** invoke v4 when v5 succeeds.

### REQ-SU-005 (State-driven) — Circuit Breaker

**While** consecutive `v5` failures exceed the circuit-breaker threshold, the system **shall** open the breaker (fast-fail to v4 degraded without calling v5) and **shall** half-open after the cooldown to probe v5 recovery, recording state transitions.

### REQ-SU-006 (Optional) — v6 Drop-in Seam

**Where** a `v6` engine becomes available, the system **shall** accept it as a new adapter behind the identical `SearchEngine` port selected by `SEARCH_ENGINE_VERSION=v6`, with zero changes to `/api/find/search` or any app caller. This is a first-class forward-compatibility acceptance criterion.

### REQ-SU-007 (Unwanted) — No Scoring Merge / No Quality Change

The system **shall not** merge v4 scoring into v5, **shall not** refactor or block in-progress v6 work, and **shall not** change search result quality for the active (v5) path.

### REQ-SU-008 (Event-driven) — Doc Truth Re-verification

**When** this SPEC completes, the system **shall** re-verify that `docs/features/main-flow.md` Step 5 accurately reflects the RESTORED v4 thin fallback + circuit-breaker behavior.

> Context: a standalone doc-fix (run by the orchestrator independently of this SPEC) only adds an interim status banner to `main-flow.md` noting that the documented v4 in-process fallback was removed from code (current reality: v5-only, 502 on AI failure). This SPEC makes the documented fallback behavior TRUE AGAIN by re-introducing v4 as a thin degraded raw-RPC fallback behind a circuit breaker (REQ-SU-004/005). REQ-SU-008 is therefore a re-verification/banner-removal obligation on completion, NOT a stale-doc correction (that correction is the standalone doc-fix's job, already in flight). On completion: confirm Step 5 describes port → v5 active → circuit-breaker → v4 degraded fallback, and remove the interim banner.

## Acceptance Criteria

상세 Given/When/Then 시나리오는 `acceptance.md` 참고. 필수 게이트:

- **[HARD] 사용자 가시 동작 & 화면 불변**: v5 정상 경로에서 `/` 메인 플로우 결과 카드/순서/화면/`engine: "v5"` 응답 형태 변경 0. port 도입은 호출 간접화일 뿐 평시 동작 동일.
- **[HARD] Characterization-tests-precede-refactor 게이트**: port 도입 전 — (1) `find/search` 현 동작(v5 성공 → 응답 매핑, v5 실패 → 502) 스냅샷, (2) `domains/search-v4` raw RPC 결과 형태 스냅샷 (fallback 어댑터가 채울 계약). port 도입 후 응답 byte-identical (v5 성공 시).
- **port 계약 정의 산출물**:
  - `src/domains/search/engine-port.ts` — `SearchEngine` 인터페이스 (request/response shape). ai 측 `RecommendRequest`/`RecommendResponse` (SPEC-ARCH-AI-001 REQ-AI-005 DTO) 와 shape 정합 문서화.
  - `src/domains/search/adapters/v5-adapter.ts` — ai `/recommend` 어댑터 (active).
  - `src/domains/search/adapters/v4-fallback-adapter.ts` — `domains/search-v4` raw RPC degraded 래퍼 (스코어링 미유지).
  - `src/domains/search/circuit-breaker.ts` — closed/open/half-open 상태머신 + 임계/쿨다운 (env 설정).
  - v6 확장 seam 문서: "v6 어댑터는 `engine-port.ts` 구현 + `SEARCH_ENGINE_VERSION=v6` 등록만으로 드롭인, app caller 변경 0" 를 명시한 ADR.
- **fallback 상태머신 정의**: v5 호출 → 성공(close) / 5xx·timeout(failure count++) → 임계 초과 시 open(v4 degraded 직행) → 쿨다운 후 half-open(v5 probe) → 성공 시 close. degraded 응답은 `engine: "v4-degraded"` 로 표기, 클라이언트는 동일 렌더 (품질 저하만 내부 메트릭).
- **[HARD] v6 forward-compat 검증**: 더미 `v6` 어댑터(port 구현 stub)를 등록하고 `SEARCH_ENGINE_VERSION=v6` 설정 시, `find/search` caller 코드 diff 0 으로 라우팅됨을 자동 테스트로 증명 (REQ-SU-006 1급 기준).
- **롤백 전략**: port 도입은 `find/search` 를 port 위임으로 교체하되, 직전 v5-direct 호출을 `SEARCH_ENGINE_VERSION` 미설정 시 기본 v5-direct 로 동작하게 하여 단일 env 토글로 즉시 원복. circuit breaker 는 `CB_ENABLED=false` 시 항상 v5-direct (breaker bypass) — feature flag 기반 무중단 롤백.

## Doc Sync (CLAUDE.md 필수 동기화 3종)

- `docs/features/search-engine.md` — `SearchEngine` port + `SEARCH_ENGINE_VERSION` + v4 thin fallback + circuit breaker + v6 seam 섹션 신설. v5 미작성 표(line 152~)의 "`SEARCH_ENGINE_VERSION` 환경변수 ⬜" → 완료 처리. **이 SPEC 완료 시 갱신 필수.**
- `docs/features/main-flow.md` — **재검증 + interim banner 제거 (REQ-SU-008)**: stale 본문 수정 자체는 별도 standalone doc-fix(오케스트레이터가 이 SPEC 와 독립 실행 — 현재 코드 실상이 v5-only/502 임을 알리는 interim banner 추가)가 담당한다. 이 SPEC 는 v4 thin fallback + circuit breaker 를 재도입해 그 문서 서술을 다시 TRUE 로 만든 뒤, Step 5 가 port → v5 active → circuit-breaker → v4 degraded fallback 을 정확히 반영하는지 재검증하고 interim banner 를 제거한다. **이 SPEC 완료 시 갱신 필수 (메인 플로우 검색 흐름 변경 트리거).**
- `docs/ARCHITECTURE.md` — 검색 토폴로지: `find/search` → `SearchEngine` port → {v5 active / v4 degraded fallback / v6 seam} 다이어그램 반영. **이 SPEC 완료 시 갱신 필수.**

## What NOT to Build (Exclusions / NOT in scope)

- v6 구현 — 명시적 스코프 외. 사용자가 별도 능동 개발 중. 본 SPEC 는 seam(port + 등록 지점)만 제공, v6 작업 차단/리팩터 금지.
- v4 스코어링의 v5 병합 — 명시적 금지 (REQ-SU-007).
- 검색 결과 품질 변경 — active(v5) 경로 품질 0 변경.
- v4 스코어링 로직 유지보수/동기화 — v4 fallback 은 raw RPC degraded 전용. v4 스코어링 코드(`domains/search-v4` scorer/ranker)는 동결, fallback 어댑터는 그것을 호출하지 않고 raw RPC 만 사용.
- 언어 마이그레이션 — 전면 금지.
- ai 내부 스코어링/리포지토리 재설계 — SPEC-ARCH-AI-001 스코프. 본 SPEC 는 그 안정 계약을 v5 어댑터로 소비.
- `domains/search-v4` / `domains/search-v5-client` 모듈 추출 — SPEC-ARCH-APP-001 스코프. 본 SPEC 는 그것들을 port 어댑터로 감쌀 뿐.
- A/B 트래픽 분할, 점진 롤아웃 가중치 — 별도 SPEC. 본 SPEC 은 단일 active 버전 + 실패 fallback 만.

## Dependency Ordering & Parallelism

- **실행 순서**: 4-SPEC 중 **4번 (마지막, 교차 SPEC)**. crawler → ai → app → **search-unify**.
- **선행 의존 (강)**:
  - SPEC-ARCH-AI-001 — v5 어댑터가 ai 의 안정 `SearchRepository`/`DiversifyService`/`/recommend` DTO 계약을 타깃 (REQ-SU-003).
  - SPEC-ARCH-APP-001 — port 어댑터가 감쌀 `src/domains/search-v4/` (thin fallback) + `src/domains/search-v5-client/` (active) 분리 모듈 필요 (REQ-SU-004).
- **병렬 불가**: ai/app 양쪽 안정화 전 착수 시 port 계약이 흔들림. 반드시 마지막.

## Cross-References

- SPEC-ARCH-AI-001: v5 어댑터 = ai `/recommend` (그 SPEC 의 `search_service`+`SearchRepository`+`DiversifyService`). v6 seam 의 ai 측 앵커 = `SearchRepository` 교체점 (REQ-AI-002). port 의 req/resp shape 은 ai DTO (REQ-AI-005) 와 정합.
- SPEC-ARCH-APP-001: v4 fallback 어댑터 = 그 SPEC 의 `src/domains/search-v4/` (raw RPC 만 사용, scorer/ranker 미호출). active 어댑터 = `src/domains/search-v5-client/`. port(`src/domains/search/engine-port.ts`)가 두 모듈을 감싼다.
- SPEC-ARCH-CRAWLER-001: 간접 — crawler validator 가 검색 입력 데이터 신뢰성을 높이나 port 계약과 직접 결합 없음.
