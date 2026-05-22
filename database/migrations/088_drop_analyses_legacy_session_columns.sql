-- 088_drop_analyses_legacy_session_columns.sql
-- analyses 의 레거시 refine/session 컬럼 4종 제거 (admin-only 전환 follow-up, 2026-05-22).
--
-- 배경:
--   087 에서 analysis_sessions 테이블 DROP. analyses 의 아래 4컬럼은 그 세션/리파인
--   구조(레거시 /api/analyze)에 묶였던 것으로, 087 이후 dangling (FK 없음).
--   코드 전수 grep 0참조 (src + scripts). /admin/eval 도 미참조.
--
-- ─── DROP 대상 ───────────────────────────────────────────────
--   analyses.session_id          (uuid)    — 옛 analysis_sessions FK 였던 적 없음(논리 참조만)
--   analyses.parent_analysis_id  (uuid)    — 리파인 부모 링크
--   analyses.refinement_prompt   (text)    — 리파인 프롬프트
--   analyses.sequence_number     (integer) — 세션 내 순번
--
-- 유지: analyses 테이블 + eval 가 읽는 컬럼(image_filename/prompt_text/style_node_primary/
--       style_node_confidence/detected_gender/items/is_pinned/created_at) 전부 그대로.
--
-- Author: admin-only 전환 follow-up (2026-05-22)
-- Requires: 087

BEGIN;

ALTER TABLE analyses
  DROP COLUMN IF EXISTS session_id,
  DROP COLUMN IF EXISTS parent_analysis_id,
  DROP COLUMN IF EXISTS refinement_prompt,
  DROP COLUMN IF EXISTS sequence_number;

COMMIT;

-- ─── 적용 후 검증 (수동) ─────────────────────────────────────
--   SELECT count(*)::int FROM information_schema.columns
--     WHERE table_name='analyses'
--       AND column_name IN ('session_id','parent_analysis_id','refinement_prompt','sequence_number');
--   -- 0
