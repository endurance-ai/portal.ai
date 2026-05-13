-- 051_style_node_adjacency.sql
-- Style Node 간 인접도 그래프 테이블.
-- Schema 만 신설. Seed 는 SPEC-BRAND-EMBED-001 에서 node_centroids 계산 후
-- cosine(centroid_A, centroid_B) 로 자동 채워짐 (source='embedding_derived').
--
-- Manual override 가 필요한 경우 source='manual' 로 INSERT 가능.
-- 동일 (from_id, to_id) 가 양쪽 source 로 충돌 시 manual 이 우선 (운영 정책).
--
-- Author: SPEC-NODE-REDESIGN-001 P2 (2026-05-13)
-- Related: docs/plans/26-05-13-spec-node-redesign.md
-- 검증: kikoai dev-app PG. Requires 049_style_nodes.sql applied.

BEGIN;

-- ── style_node_adjacency 테이블 ─────────────────────────────
CREATE TABLE style_node_adjacency (
  from_id  bigint NOT NULL REFERENCES style_nodes(id) ON DELETE CASCADE,
  to_id    bigint NOT NULL REFERENCES style_nodes(id) ON DELETE CASCADE,
  weight   numeric(3,2) NOT NULL CHECK (weight BETWEEN 0 AND 1),
  source   text NOT NULL DEFAULT 'embedding_derived'
            CHECK (source IN ('embedding_derived','manual')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id),
  CHECK (from_id <> to_id)
);

-- ── 인덱스 ───────────────────────────────────────────────────
-- 검색 Stage 4: 특정 from_id 의 weight>=threshold 인접 노드 조회
CREATE INDEX idx_adjacency_from_weight
  ON style_node_adjacency (from_id, weight DESC);

-- 검색 Stage 9 확장 / admin: 양방향 조회
CREATE INDEX idx_adjacency_to_weight
  ON style_node_adjacency (to_id, weight DESC);

-- ── updated_at 자동 갱신 트리거 ──────────────────────────────
CREATE TRIGGER trg_adjacency_updated_at
  BEFORE UPDATE ON style_node_adjacency
  FOR EACH ROW
  EXECUTE FUNCTION style_nodes_set_updated_at();   -- 049 에서 정의한 함수 재사용

-- ── 코멘트 ───────────────────────────────────────────────────
COMMENT ON TABLE style_node_adjacency IS
  'Directed adjacency graph for style nodes. Symmetric edges expected (from→to and to→from both stored). Used by search v6 Stage 4 (1-hop expansion, weight>=0.7) and Stage 9 (diversity expansion, weight>=0.5 then 0.3). Auto-populated by SPEC-BRAND-EMBED-001 centroid cosine. Manual override possible.';

COMMENT ON COLUMN style_node_adjacency.weight IS
  'Cosine similarity between node centroids (embedding_derived) or admin-curated weight (manual). Range 0~1. Rows below 0.30 typically not stored.';

COMMENT ON COLUMN style_node_adjacency.source IS
  '''embedding_derived'' = computed from node_centroids cosine. ''manual'' = admin override; takes precedence over embedding_derived for the same pair.';

COMMIT;
