-- 080_drop_brand_similar.sql
-- brand_similar 테이블 폐기.
--
-- 배경:
--   037 (BGE-m3 텍스트 1024-dim) 기반 brand_similar 자산.
--   - brand_nodes.embedding (037), brand_keywords 컬럼 의존 → 067 cleanup 으로 DROP
--     되면서 재계산 파이프라인 (ai/scripts/embed_brands_text.py) 깨짐
--   - 2026-05-07 마지막 갱신 후 stale (40,505 row, 옛 데이터)
--   - 어드민 /admin/brand-nodes/[id] "유사 브랜드" 한 곳에서만 참조 중이었음
--
-- 교체:
--   src/domains/admin-tools/brand-management/brand-graph__detail.route.ts 가
--   find_similar_brands(brand_id, 10) RPC (065 마이그, FashionSigLIP 768 멀티모달)
--   호출로 변경됨. 같은 spec 의 응답 shape (id/name/similarity) 유지.
--
-- ai/scripts/embed_brands_text.py 도 같은 PR 로 삭제.
--
-- Author: brand_similar dead-asset cleanup (2026-05-20)

BEGIN;

DROP TABLE IF EXISTS brand_similar CASCADE;

COMMIT;
