# SPEC-V6-EVAL — Brief (manager-spec input)

생성일: 2026-05-04 (in /moai project + /moai plan 진입 정렬 단계)
작성자: MoAI orchestrator (사용자 4-question 답변 박제)
다음 단계: `/moai plan SPEC-V6-EVAL` → manager-spec 가 EARS-format spec.md 작성

---

## 1. SPEC 미션 한 줄

kiko.ai 검색엔진 v6 작업의 **선행 인프라**: 정량적 평가를 가능하게 하는 골든셋 + 메트릭 + 어드민 라벨링 UI 를 구축하고, v4 baseline 점수를 박제한다.

## 2. 왜 이게 첫 SPEC 인가

- 사용자 인용: "검색엔진 v6 품질을 제대로 올려보려고 하거든? 어드민 단에서 평가도 계속해서 자체적으로 진행하고."
- 측정 없는 개선은 "감각적 개선" — interview Round 2 에서 사용자가 "검색 품질·평가 인프라 부재" 를 가장 큰 제약으로 명시.
- 이 SPEC 이 완료되어야 SPEC-V6-CORE (v5 풀배치 + rerank) 와 SPEC-V6-AUTOMATION (Ralph loop) 의 가드 역할 가능.

## 3. 사용자 결정 (확정 — manager-spec 가 재질문 금지)

| 결정 항목 | 선택 |
|---|---|
| **메트릭** | NDCG@10 + Precision@5 (둘 다 계산, baseline 박제 시 둘 다 기록) |
| **평가 주체 (v1)** | 사람 라벨링 only. LLM-as-judge 는 v2+ 에서 사람 라벨과 상관계수 검증 후 추가 |
| **골든셋 출처** | 기존 `admin/eval` 테이블 + 보완 라벨링 (커버리지 부족 영역만 추가 작성) |
| **골든셋 v1 크기** | 30 쿼리 (사용자 하루 안에 라벨링 가능 범위) |

## 4. NOT in scope (이번 SPEC 에서 제외)

- v5 임베딩 풀배치 실행 → SPEC-V6-CORE
- 검색 알고리즘 변경 (rerank, fusion 가중치 등) → SPEC-V6-CORE
- LLM-as-judge 자동 채점 → SPEC-V6-EVAL-V2 또는 V6-AUTOMATION
- 골든셋 100/300 확장 → V6-EVAL-V2
- 프로덕션 IG URL 자동 샘플링 → V6-AUTOMATION
- A/B 좌우 비교 UI → 별도 SPEC

## 5. 예상 산출물 (manager-spec 가 정련)

### 데이터 레이어
- `eval_golden_queries` 테이블 (instagram_url 또는 query_signature, intent_note, created_by)
- `eval_judgments` 테이블 (golden_query_id, product_id, relevance_grade 0~3, labeler_id, labeled_at, algorithm_version v4|v6)
- 기존 admin Eval 모듈의 데이터 → migration 으로 위 스키마에 흡수
- RLS 정책 (admin only)

### 메트릭 계산기
- TypeScript 또는 SQL view 로 NDCG@10, Precision@5 계산
- 알고리즘 버전 단위로 점수 집계 → `eval_runs` 테이블 (algorithm_version, ndcg_at_10, precision_at_5, query_count, computed_at)

### 어드민 UI (`/admin/eval` 강화)
- 골든셋 쿼리 리스트 + 추가/편집
- 쿼리 → 검색 결과 (현재 운영 알고리즘으로 호출) → 사람 라벨링 폼 (drag-rank 또는 0~3 등급)
- 알고리즘 버전 선택 → run 트리거 → 결과 점수 표시
- v4 baseline 박제 (한 번 측정 후 frozen, 차후 비교 기준)

### baseline 박제 워크플로
- v4 알고리즘으로 30 쿼리 실행 → 사람 라벨링 → NDCG/Precision 측정 → `eval_runs` 에 v4 row 저장
- 이후 v6 변경 시 같은 30 쿼리 재실행 → 새 row → 비교

## 6. 의존성 / 전제

- `admin_profiles` RLS 정책 살아있어야 (이미 운영 중)
- 기존 `/admin/eval` 모듈 구조 분석 (manager-spec 가 research 단계에서)
- Supabase 마이그레이션 추가 가능 환경

## 7. 성공 기준 (Acceptance criteria 초안)

- [ ] 30 쿼리 골든셋 admin UI 에서 CRUD 가능
- [ ] 각 쿼리에 대해 사람 라벨링 (relevance 0~3) 가능
- [ ] v4 알고리즘으로 NDCG@10, Precision@5 자동 계산되어 `eval_runs` row 생성
- [ ] v4 baseline 점수가 admin UI 대시보드에 표시 (frozen 표기)
- [ ] 새 알고리즘 버전 선택 → run 버튼 → 점수 비교 표시
- [ ] characterization test 추가 (DDD mode 룰): 메트릭 계산기 단위테스트, RLS 격리 통합테스트
- [ ] docs 동기화: docs/features/search-engine.md 에 "평가 인프라 v6-EVAL" 섹션 추가, docs/ARCHITECTURE.md 에 eval_* 테이블 토폴로지 추가

## 8. 회피해야 할 함정

- **스코프 크리프**: LLM-judge / A/B UI / 프로덕션 샘플링 같은 인접 기능 거부 (위 NOT in scope 명시)
- **단일 진실 원천 충돌**: 메트릭 정의·산식은 docs/features/search-engine.md 본문에만 두고, .moai/project/codemaps/data-flow.md 는 모듈 흐름만 표현
- **DDD mode 룰**: 신규 코드 (메트릭 계산기) 는 RED-GREEN 가능하지만 기존 admin/eval UI 통합 부분은 characterization test 우선
- **Vision 비용**: golden set 30 쿼리 라벨링 시 매번 Vision API 호출 금지 — IG URL 별 캐시 결과 재활용

## 9. manager-spec 에 전달할 추가 컨텍스트

- 코드베이스 진입점: `/Users/hansangho/Desktop/kikoai/app`
- 핵심 참조 doc:
  - `docs/features/search-engine.md` (v4 알고리즘 디테일)
  - `docs/features/main-flow.md` (어떤 쿼리가 들어오는지)
  - `docs/infra/data-model.md` (Supabase 스키마)
  - `.moai/project/codemaps/data-flow.md` (방금 생성, 시퀀스 다이어그램)
- 기존 admin/eval 코드:
  - `src/app/admin/eval/`
  - `src/app/api/admin/eval/`
  - `src/app/api/admin/eval/[analysisId]/`
  - `src/app/api/admin/eval/golden-set/`
- DDD mode (커버리지 3.5%) — characterization tests first

---

> 이 brief 는 `/moai plan SPEC-V6-EVAL` 의 input 입니다. manager-spec 가 research → SPEC.md 작성 → annotation cycle (1~6회) 을 거쳐 정식 spec.md 와 research.md 를 `.moai/specs/SPEC-V6-EVAL/` 에 만듭니다.
