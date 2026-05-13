# SPEC-NODE-REDESIGN-001 — Style Node 재설계 (DB-managed)

**Status**: Draft (다음 세션에서 enum 최종 설계 + 구현)
**Created**: 2026-05-13
**Depends on**: 없음 (첫 SPEC)
**Blocks**: SPEC-PROMPT-REGISTRY-001, SPEC-BRAND-NODE-001, SPEC-BRAND-EMBED-001, SPEC-SEARCH-V6-001

---

## 1. 문제

현재 style_node taxonomy 는 코드 + prompt 에 분산 박혀있고, 모델 합의도 낮아 검색 noise 의 원인.

**정량 근거 (2026-05-13 측정):**
- 30개 이미지에 대해 Bedrock Haiku ↔ Nova Lite style_node 일치율 **28.6%**
- Haiku 947 fashion 행 기준 상위 4개 노드 (D / C / H / G) 가 **60%** 점유. 하위 4개 (K/B/A-1/E) 가 **4%** — 분포 극심하게 skewed
- 같은 정의가 **4곳에 중복 박제**:
  - `src/lib/fashion-genome.ts` (TS const, single source of truth)
  - `src/lib/style-nodes.ts` (ID list)
  - `src/lib/prompts/prompt-search.ts` (Vision analyze prompt 안)
  - `scripts/local/pai_backfill/prompt.txt` (백필 prompt)
- 노드 정의 변경 시 4곳 동기화 필요 → drift 위험 + deploy 필수

**관련 부수 문제:**
- `mood_tags` (product) / `sensitivity_tags` (brand) 의 12개 enum 이 node 와 거의 1:1 매핑 — redundant
- 노드 간 adjacency 가 코드 안 array 로 박혀있어 admin 수정 불가

---

## 2. 목표

1. **단일 진실의 원천 (DB)**: `style_nodes` 테이블로 정의 이전. 코드는 DB fetch.
2. **새 enum 설계**: 15 → 9~12개 (다음 세션에서 도메인 리서치 후 확정). VLM 합의도 ↑ + 도메인 POV 유지.
3. **CRUD-able**: admin UI 에서 노드 추가/수정 가능. deploy 불필요.
4. **버저닝**: `version` 컬럼으로 v7 / v8 운영 가능. 기존 배정 보존.
5. **Adjacency 분리**: 노드 간 거리/인접성을 별도 테이블로 모델링 (검색 hard-filter 1-hop 확장에 사용).
6. **Tag 컬럼 deprecate**: `brand.sensitivity_tags`, `product_ai_analysis.mood_tags` 사용 종료. Vision /analyze 출력에서는 유지 (해석성).

---

## 3. Acceptance Criteria (EARS)

- **AC-001**: `style_nodes` 테이블 생성 시, version='v7' row 9~12개 INSERT 되어야 한다. 각 row 는 `id`, `name_ko`, `name_en`, `mood`, `include_rule`, `exclude_rule`, `keywords_en[]`, `keywords_ko[]`, `is_active=true` 를 보유한다.
- **AC-002**: `style_node_adjacency` 테이블 생성 시, manual seed adjacency (founder 직접 입력) 가 INSERT 되어야 한다. 모든 row 는 양쪽 모두 `style_nodes(id)` FK 무결성을 만족한다.
- **AC-003**: `brands` 테이블에 `primary_node` / `secondary_node` (둘 다 nullable, FK to `style_nodes.id`) 컬럼이 추가되어야 한다.
- **AC-004**: `brands.sensitivity_tags` 컬럼은 deprecated 표시 (column comment) + 신규 INSERT 시 NULL 권장. 기존 데이터는 보존.
- **AC-005**: `product_ai_analysis.mood_tags` 컬럼도 동일 — deprecated comment. 검색 RPC 에서 weight=0.
- **AC-006**: `src/lib/fashion-genome.ts`, `src/lib/style-nodes.ts` 는 DB fetch wrapper 로 교체. `STYLE_NODES` const 제거 또는 cache layer 로 격하.
- **AC-007**: 노드 정의 변경 (예: `style_nodes.keywords_en` UPDATE) → 다음 Vision/Backfill 호출에 자동 반영 (캐시 TTL ≤ 5분).
- **AC-008**: 새 enum 9~12개의 정의는 **다음 세션에서** founder + claude 협업으로 brainstorm. 본 SPEC 의 schema 만으로 placeholder 가능.

---

## 4. Schema (DDL)

```sql
-- 045 다음 마이그레이션 번호 추정 (현재 047)
-- 048_style_nodes.sql
CREATE TABLE style_nodes (
  id            text PRIMARY KEY,            -- 새 enum ID (예: 'D', 'C-HEDONIST' 등 — 다음 세션 결정)
  version       text NOT NULL,               -- 'v7' (or 'v8' for future revision)
  name_ko       text NOT NULL,
  name_en       text NOT NULL,
  mood          text,                        -- 한 줄 mood 설명
  include_rule  text,                        -- "포함 기준" 자연어
  exclude_rule  text,                        -- "제외 기준" 자연어
  keywords_en   text[] NOT NULL DEFAULT '{}',
  keywords_ko   text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_style_nodes_version ON style_nodes(version) WHERE is_active = true;

-- 049_style_node_adjacency.sql
CREATE TABLE style_node_adjacency (
  from_id  text NOT NULL REFERENCES style_nodes(id) ON DELETE CASCADE,
  to_id    text NOT NULL REFERENCES style_nodes(id) ON DELETE CASCADE,
  weight   numeric(3,2) NOT NULL CHECK (weight BETWEEN 0 AND 1),
  source   text NOT NULL DEFAULT 'manual',   -- 'manual' | 'embedding_derived'
  PRIMARY KEY (from_id, to_id),
  CHECK (from_id <> to_id)
);

COMMENT ON TABLE style_node_adjacency IS
  'symmetric edges 권장 (from→to 와 to→from 둘 다 row). weight≥0.7 = 1-hop adjacent in search.';

-- 050_brand_node_fk.sql
ALTER TABLE brands
  ADD COLUMN primary_node     text REFERENCES style_nodes(id),
  ADD COLUMN secondary_node   text REFERENCES style_nodes(id),
  ADD COLUMN node_confidence  numeric(3,2),
  ADD COLUMN node_assigned_at timestamptz,
  ADD COLUMN representative_image_urls text[];

-- 051_deprecate_tags.sql
COMMENT ON COLUMN brands.sensitivity_tags IS
  'DEPRECATED 2026-05-13 (SPEC-NODE-REDESIGN-001). Use primary_node + secondary_node instead. Kept for back-compat read; do not INSERT new rows with this populated.';

COMMENT ON COLUMN product_ai_analysis.mood_tags IS
  'DEPRECATED 2026-05-13 (SPEC-NODE-REDESIGN-001). Search RPC ignores this. Vision /analyze still emits for interpretability.';
```

---

## 5. 새 Enum 설계 — 다음 세션 작업 가이드

본 SPEC 은 **schema 만 확정**. enum 자체는 다음 세션에서 진행.

**Brainstorm 입력 자료:**
- 기존 15 node 분포 (Haiku 947 행 통계) — over/under-represented 노드 식별
- 도메인 리서치 (선택): Hypebeast / WWD / Highsnobiety 의 트렌드 segmentation
- 경쟁사 분류: SSENSE, MR PORTER, MATCHESFASHION 의 카테고리 트리
- VLM 안정성: 한 노드의 정의가 명확히 다른 노드와 구분 가능해야 함

**Collapse 후보 매핑 (참고용, 다음 세션에서 확정):**
| 기존 (v6) | 통합 후 (v7 후보) | 이유 |
|---|---|---|
| C, F | C 또는 새 ID | 둘 다 미니멀계, VLM 혼동 |
| D | D 단독 유지 | 가장 큰 bucket, 의미 명확 |
| H, K | H 단독 | K(영캐주얼) 분포 적음, H 흡수 |
| G, A-1 | G 단독 | A-1(트레일) 10건뿐, G 흡수 |
| B, B-2, E | B-2 단독 | 셋 다 sparse, 통합 |
| F-2, F-3 | 각각 유지 | 명확히 다른 vibe |
| A-3 | 유지 | 헤리티지 신호 명확 |
| I | 유지 검토 | 일본 워크웨어 특이성 |
| A-2 | 유지 | 럭셔리 스트릿 |

---

## 6. 구현 단계 (Phases)

**P1**: 마이그레이션 작성 + 적용
- 048_style_nodes.sql + 049_style_node_adjacency.sql + 050_brand_node_fk.sql + 051_deprecate_tags.sql
- 적용 후 PostgREST schema reload

**P2**: 새 enum 9~12개 정의 (다음 세션 시작 작업)
- Brainstorm session
- INSERT v7 rows
- Adjacency manual seed (founder 입력)

**P3**: TS wrapper 교체
- `src/lib/style-nodes.ts` → DB fetch + 5분 in-memory cache
- `src/lib/fashion-genome.ts` → deprecate, re-export from DB wrapper
- 호출처 update (3-5 곳)

**P4**: Admin UI
- `/admin/style-nodes` — 노드 CRUD + adjacency 편집
- 입력 시 keywords_en/ko 멀티 입력
- 인접성 매트릭스 시각 편집

**P5**: 검증
- 기존 fashion-genome.ts 의 15 노드 → v7 노드로 mapping table 생성 (`style_node_legacy_map`)
- 957 Haiku 행 mood_tags 통계 sanity check

---

## 7. Out of Scope

- Brand 의 primary_node 실제 배정 → SPEC-BRAND-NODE-001
- Prompt template 의 DB 화 → SPEC-PROMPT-REGISTRY-001
- 검색 hard-filter 구현 → SPEC-SEARCH-V6-001
- 기존 PAI 행 retroactive 재라벨링 (사용자 결정: 전체 폐기 → brand 백필 후 재설계)

---

## 8. Risks

| Risk | 영향 | 완화 |
|---|---|---|
| 새 enum 설계가 brainstorm 에서 결정 못 남 | P2 지연 | 임시로 기존 15 + version='v7-stub' 로 진행, 후속 patch |
| Adjacency 수동 입력 누락 (n² edges) | hard-filter 작동 안 함 | 9개 노드면 edge 최대 72개, 30분 작업 |
| `fashion-genome.ts` 제거 시 dependent code 누락 | 빌드 실패 | grep 으로 STYLE_NODES import 전수 조사 |
| 캐시 TTL 길어서 admin 수정 즉시 반영 안 됨 | UX | TTL=300s + 명시적 invalidate 엔드포인트 |
