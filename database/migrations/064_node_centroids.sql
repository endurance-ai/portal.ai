-- 064_node_centroids.sql
-- SPEC-BRAND-EMBED-001 P3: style_node centroid 저장.
--
-- 같은 primary_style_node_id 의 brand vector 들 평균 → L2-normalize → centroid.
-- centroid 끼리의 cosine 이 곧 두 노드의 "유사도" → SPEC 4 P4 adjacency 자동 채움 입력.
--
-- 갱신:
--   - 신규 brand 가 분류될 때마다 빠르게 stale → scripts/build_node_centroids.py 가 갱신
--   - SPEC §3 권장: member_count >= 5 인 node 만 centroid 생성 (작은 표본 unstable)
--     스크립트에 --min-members 파라미터로 노출 (기본 5, 검증용 1 로 낮출 수 있음)
--
-- Author: SPEC-BRAND-EMBED-001 P3 (2026-05-14)
-- Requires: 049 (style_nodes), 063 (brand_multimodal_embeddings)

BEGIN;

CREATE TABLE IF NOT EXISTS node_centroids (
  style_node_id    bigint PRIMARY KEY REFERENCES style_nodes(id) ON DELETE CASCADE,
  vector           halfvec(768) NOT NULL,
  member_count     integer NOT NULL CHECK (member_count > 0),
  embedding_model  text NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_centroids_hnsw
  ON node_centroids
  USING hnsw (vector halfvec_ip_ops)
  WITH (m = 16, ef_construction = 200);

COMMENT ON TABLE node_centroids IS
  'Per-style-node centroid in FashionSigLIP space. Mean of member brand vectors. '
  'Powers automatic style_node_adjacency derivation (SPEC-BRAND-EMBED-001 P4).';

COMMENT ON COLUMN node_centroids.vector IS
  'L2-normalized halfvec(768). Cosine ≡ inner product via halfvec_ip_ops.';

COMMENT ON COLUMN node_centroids.member_count IS
  'Number of brand vectors averaged. Higher → more stable. SPEC recommends >=5.';

COMMIT;
