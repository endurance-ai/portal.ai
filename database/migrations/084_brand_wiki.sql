-- 084_brand_wiki.sql
-- SPEC-BRAND-WIKI-001: brand_nodes 에 wiki jsonb 컬럼 추가
-- 외부 위키 메타데이터(인스타그램 핸들 / 홈페이지 URL / 한국어 description /
-- founder / founded_year / origin_country)를 단일 jsonb 컬럼에 namespace 묶기.
--
-- 배경:
--   - crawler/data/brand-enrichment 에서 2,899개 brand 의 위키 메타데이터 수집 완료
--   - 기존 attributes(jsonb, VLM 분류 결과) 와 분리 — 차원이 다른 데이터
--   - 사용자 참여형 위키로 확장 시 jsonb 한 컬럼이 schema 진화에 유연
--
-- 영향:
--   - 신규 컬럼만 추가 — 기존 데이터 변경 없음
--   - 차후 import-brand-enrichment.ts 가 ok 상태 1,901개 row 에 wiki 채움
--
-- 배포 위치:
--   - 이 파일은 crawler 리포에서 작성됨 (계획용)
--   - 실제 migration 은 crawler 리포에서 작성된 초안(068) 을 번호 충돌 회피로 084 로 리넘버
--
-- Author: SPEC-BRAND-WIKI-001 P1 (2026-05-21)

BEGIN;

-- ─── 1) wiki 컬럼 추가 ──────────────────────────────────────
ALTER TABLE brand_nodes
  ADD COLUMN IF NOT EXISTS wiki jsonb;

COMMENT ON COLUMN brand_nodes.wiki IS
  '브랜드 위키 메타데이터 (instagram_handle, homepage_url, description_ko, '
  'description_original, founder text[], founded_year smallint, origin_country char(2), '
  'sources jsonb[], confidence, status, review_reasons, enriched_at, schema_version). '
  'attributes(VLM 결과)와 분리. import-brand-enrichment.ts 가 채움. '
  'SPEC-BRAND-WIKI-001 참조.';

-- ─── 2) 검색용 인덱스 ──────────────────────────────────────
-- origin_country 별 클러스터링 (인디 브랜드 발굴)
CREATE INDEX IF NOT EXISTS idx_brand_nodes_wiki_country
  ON brand_nodes ((wiki->>'origin_country'))
  WHERE wiki IS NOT NULL;

-- IG handle lookup (apify 호출 시)
CREATE INDEX IF NOT EXISTS idx_brand_nodes_wiki_ig
  ON brand_nodes ((wiki->>'instagram_handle'))
  WHERE wiki IS NOT NULL AND wiki->>'instagram_handle' IS NOT NULL;

-- status 별 필터 (admin 검수 UI)
CREATE INDEX IF NOT EXISTS idx_brand_nodes_wiki_status
  ON brand_nodes ((wiki->>'status'))
  WHERE wiki IS NOT NULL;

COMMIT;
