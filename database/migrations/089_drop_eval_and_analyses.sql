-- 089_drop_eval_and_analyses.sql
-- /admin/eval (분석 품질평가) 제거에 따른 테이블 정리 (admin-only 전환 마무리, 2026-05-22).
--
-- 배경:
--   analyses/analysis_items 의 유일 writer 였던 /api/analyze(레거시)가 087 PR 에서 제거됨 →
--   신규 분석이 안 쌓여 /admin/eval 은 과거 동결 데이터만 보는 dead-end 가 됨. eval 페이지/
--   API/컴포넌트 전부 제거(동일 PR). 이에 따라 관련 테이블 DROP.
--
-- ─── DROP 대상 ───────────────────────────────────────────────
--   api_access_logs   — 코드 0참조(writer /api/analyze 제거). analyses 로 FK.
--   analysis_items    — /admin/eval 전용 read. analyses 로 FK.
--   eval_reviews      — /admin/eval 평가 핀. analyses 로 FK.
--   analyses          — eval 외 reader 없음. (087 에서 search_quality_logs/user_feedbacks FK,
--                       088 에서 self-ref parent FK 이미 정리됨)
--
-- 드롭 순서: analyses 로 incoming FK 가진 3개(api_access_logs/analysis_items/eval_reviews) 먼저,
--           그 다음 analyses.
--
-- 검증(pg_constraint): analyses incoming FK = eval_reviews/analysis_items/api_access_logs 3개.
--   모두 본 마이그에서 함께 drop. ai 리포 grep 0.
-- Author: admin-only 전환 마무리 (2026-05-22)
-- Requires: 087, 088

BEGIN;

DROP TABLE IF EXISTS api_access_logs;
DROP TABLE IF EXISTS analysis_items;
DROP TABLE IF EXISTS eval_reviews;
DROP TABLE IF EXISTS analyses;

COMMIT;

-- ─── 적용 후 검증 (수동) ─────────────────────────────────────
--   SELECT to_regclass('public.analyses');        -- NULL
--   SELECT to_regclass('public.analysis_items');  -- NULL
--   SELECT to_regclass('public.eval_reviews');    -- NULL
--   SELECT to_regclass('public.api_access_logs'); -- NULL
