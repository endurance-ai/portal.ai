-- 076_brand_multimodal_umap_cluster.sql
-- brand_multimodal_umap 에 HDBSCAN cluster_id 컬럼 추가.
--
-- 배경:
--   /admin/brand-clusters 페이지가 지금까지 "점 색깔 = primary_style_node_id" 만 가능했음.
--   즉 LLM (brand-vlm) 이 부여한 라벨로 색칠 → "이 라벨이 시각 유사도와 맞나" 검수 불가능
--   (라벨로 색칠하면 항상 깔끔하게 모인 것처럼 보이는 tautology).
--
--   이번 변경: SigLIP brand vector (768) → UMAP 20-dim → HDBSCAN 으로 별도 군집 부여.
--   어드민에서 토글: "by primary_style_node" vs "by HDBSCAN cluster".
--   두 라벨 일치도 (NMI) 가 LLM 라벨링 품질의 객관 지표.
--
-- 파이프라인:
--   scripts/build_brand_clusters.py
--     - brand_multimodal_embeddings.vector 전체 로드
--     - UMAP 768→20 (n_neighbors=15, min_dist=0, cosine)
--     - HDBSCAN (min_cluster_size=10, min_samples=5)
--     - brand_multimodal_umap.cluster_id UPSERT
--   noise point 는 cluster_id = -1 (HDBSCAN 표준).
--
-- Author: brand clustering (2026-05-20)
-- Requires: 066 (brand_multimodal_umap)

BEGIN;

ALTER TABLE brand_multimodal_umap
  ADD COLUMN IF NOT EXISTS cluster_id integer,
  ADD COLUMN IF NOT EXISTS cluster_computed_at timestamptz;

COMMENT ON COLUMN brand_multimodal_umap.cluster_id IS
  'HDBSCAN cluster id (UMAP 20-dim 위에서). -1 = noise. NULL = clustering 미실행 brand.';

COMMENT ON COLUMN brand_multimodal_umap.cluster_computed_at IS
  'cluster_id 마지막 계산 시각. UMAP 좌표 (computed_at) 와 분리 — 같은 임베딩에서 cluster 만 재계산 가능.';

-- 클러스터별 brand 수 빠른 집계용
CREATE INDEX IF NOT EXISTS idx_brand_mm_umap_cluster
  ON brand_multimodal_umap (cluster_id)
  WHERE cluster_id IS NOT NULL;

COMMIT;
