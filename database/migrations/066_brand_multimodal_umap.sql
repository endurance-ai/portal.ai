-- 066_brand_multimodal_umap.sql
-- SPEC-BRAND-EMBED-001 P6: brand_multimodal_embeddings 의 UMAP 2D 좌표 캐시.
--
-- brand_nodes.x_umap/y_umap (037 BGE-m3 텍스트 1024-dim 기반) 와 분리.
-- 037 임베딩이 SPEC 5 에서 폐기 또는 재임베딩 될 때 영향 없도록 별도 테이블.
--
-- 갱신: scripts/build_brand_umap.py
--   - 임베딩 row 가 충분 (>=10) 할 때만 의미 있는 좌표
--   - 매 실행마다 전체 재계산 (UMAP 은 incremental fit 미지원)
--
-- Author: SPEC-BRAND-EMBED-001 P6 (2026-05-15)
-- Requires: 063 (brand_multimodal_embeddings)

BEGIN;

CREATE TABLE IF NOT EXISTS brand_multimodal_umap (
  brand_id     bigint PRIMARY KEY REFERENCES brand_nodes(id) ON DELETE CASCADE,
  x            real NOT NULL,
  y            real NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE brand_multimodal_umap IS
  'UMAP 2D projection of brand_multimodal_embeddings.vector (FashionSigLIP 768→2). '
  'Admin /admin/brand-clusters 시각화용. SPEC-BRAND-EMBED-001 AC-007.';

COMMIT;
