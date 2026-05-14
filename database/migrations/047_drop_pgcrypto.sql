-- 047: drop pgcrypto extension — Supabase 잔재 정리.
--
-- pgcrypto 는 Supabase 가 자동 활성화한 확장이지만 운영에서 미사용:
--   1. gen_random_uuid() 는 PG 13+ 부터 pg_catalog (core) 에 존재 (oid 3432).
--      모든 테이블 DEFAULT 의 gen_random_uuid() 는 core 함수를 가리키므로
--      pgcrypto 와 무관.
--   2. pg_depend(refobjid = pgcrypto.oid) 결과 0 rows — 의존 객체 없음.
--   3. 코드 grep (kikoai/app/src + database/migrations + kikoai/ai):
--      digest / crypt / encrypt / gen_salt / pgp_sym / hmac SQL 호출 0건.
--   4. 모든 hash/암호화는 app-level (Python hashlib, Node bcryptjs) 처리.
--
-- 향후 SQL-level sha256/AES 필요 시 1줄로 복구 가능:
--   CREATE EXTENSION pgcrypto WITH SCHEMA public;
--
-- SPEC 추적: SPEC-INFRA-MIGRATE-001 cleanup follow-up.
-- 관련: Migration 044 (legacy objects drop)

BEGIN;

DROP EXTENSION IF EXISTS pgcrypto;

-- ── 검증 ─────────────────────────────────────────────────────────────────
-- SELECT extname FROM pg_extension WHERE extname='pgcrypto';
--   → 0 rows 이면 성공
-- SELECT to_regprocedure('public.gen_random_uuid()');
--   → NULL (pgcrypto schema=public 에 있던 함수 제거됨)
-- SELECT to_regprocedure('pg_catalog.gen_random_uuid()');
--   → pg_catalog.gen_random_uuid (core 함수 유지 — INSERT DEFAULT 정상)
-- INSERT INTO admin_profiles (status, email) VALUES ('pending', 'test@example.com');
--   → DEFAULT gen_random_uuid() 가 core 함수 호출하므로 정상 동작

COMMIT;

SELECT extname FROM pg_extension WHERE extname='pgcrypto';
-- → 0 rows

SELECT to_regprocedure('pg_catalog.gen_random_uuid()');
-- → pg_catalog.gen_random_uuid (core 함수 유지 ✅)
