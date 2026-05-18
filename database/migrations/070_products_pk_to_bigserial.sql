-- 070_products_pk_to_bigserial.sql
-- SPEC-SEARCH-V6-001 P0 (2/3) — products.id uuid -> bigserial.
--
-- 검증된 템플릿: migration 056 (brand_nodes.id uuid->bigserial). 동일 패턴:
-- id_new bigserial -> 자식 bigint FK 컬럼 -> backfill -> verify ->
-- 옛 FK/컬럼 drop -> rename -> 새 PK -> 자식 NOT NULL + FK -> sequence rename.
--
-- 옛 uuid 값은 보존하지 않음 (056 선례; SPEC §14 / REQ-V6-035).
-- git history + DB 백업이 rollback 안전판.
--
-- FK SWAP 표면 (전수 — 증명됨, 헤더 노트 참조):
--   products(id) 를 참조하는 live FK:
--     * product_ai_analysis.product_id  (012)  -> 069 에서 DROP (표면 아님)
--     * product_reviews.product_id      (019)  -> 여기서 SWAP (크롤러 active)
--     * eval_judgments.product_id       (033)  -> 048 에서 테이블 DROP (소멸)
--   product_embeddings 는 아직 미존재 (071 에서 생성, 처음부터 bigint).
--   => 이 마이그의 유일 swap 표면 = product_reviews.product_id.
--
--   Grep 증거 (database/migrations, `REFERENCES products`):
--     012:6  product_ai_analysis  (069 에서 drop)
--     019:6  product_reviews      (여기서 swap)
--     033:40 eval_judgments       (048 에서 drop)
--
-- 크롤러 안전성 (SPEC §11a): import-products.ts 는 products 를
--   onConflict=product_url (자연키, id 미생성) 로 upsert 하고 DB 반환 id 에서
--   product_url->id 를 해소. 크롤러 로직 변경 0; TS 타입 동기화만
--   (별도 리포 PR, AC-027).
--
-- Author: SPEC-SEARCH-V6-001 P0 (2026-05-18)

BEGIN;

-- @MX:WARN: [AUTO] products.id type swap rewrites the PK + drops/recreates
--   product_reviews.product_id FK. ACCESS EXCLUSIVE on products during the
--   column drop/rename. Irreversible (old uuid not preserved, 056 precedent).
-- @MX:REASON: SPEC-SEARCH-V6-001 §7c — bigserial PK normalizes products to
--   match brand_nodes (056) and product_embeddings (071). The DO-block NULL
--   gate proves backfill completeness before the destructive drop, mirroring
--   the verified 056 sequence exactly.
-- @MX:SPEC: SPEC-SEARCH-V6-001

-- ── 1) products: bigserial 컬럼 추가 ────────────────────────────
ALTER TABLE products
  ADD COLUMN id_new bigserial NOT NULL;
CREATE UNIQUE INDEX products_id_new_uniq ON products(id_new);

-- ── 2) 자식 테이블: 새 bigint FK 컬럼 추가 ──────────────────────
ALTER TABLE product_reviews
  ADD COLUMN product_id_new bigint;

-- ── 3) backfill (uuid -> bigint 매핑) ───────────────────────────
UPDATE product_reviews pr
   SET product_id_new = p.id_new
  FROM products p
 WHERE pr.product_id = p.id;

-- ── 4) backfill 무결성 검증 (NULL 없음 = 고아 없음) ─────────────
-- product_reviews.product_id 는 NOT NULL + ON DELETE CASCADE (019) 이므로
-- 모든 row 가 매핑돼야 함. 여기 NULL = dangling review -> fail loud.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM product_reviews
   WHERE product_id_new IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'product_reviews backfill incomplete: % rows have NULL product_id_new', v_count;
  END IF;
END $$;

-- ── 5) 옛 FK drop ───────────────────────────────────────────────
ALTER TABLE product_reviews
  DROP CONSTRAINT product_reviews_product_id_fkey;

-- ── 6) 옛 uuid 컬럼 drop ────────────────────────────────────────
ALTER TABLE product_reviews
  DROP COLUMN product_id;

-- products PK + 옛 id 컬럼
ALTER TABLE products DROP CONSTRAINT products_pkey;
ALTER TABLE products DROP COLUMN id;

-- ── 7) 새 컬럼 rename ───────────────────────────────────────────
ALTER TABLE products
  RENAME COLUMN id_new TO id;

ALTER TABLE product_reviews
  RENAME COLUMN product_id_new TO product_id;

-- ── 8) 새 PK + 임시 unique drop ─────────────────────────────────
DROP INDEX products_id_new_uniq;
ALTER TABLE products ADD PRIMARY KEY (id);

-- ── 9) 자식 NOT NULL + FK 재구성 ────────────────────────────────
ALTER TABLE product_reviews
  ALTER COLUMN product_id SET NOT NULL,
  ADD CONSTRAINT product_reviews_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ── 10) product_reviews 조회 인덱스 재생성 ──────────────────────
-- 019 가 idx_product_reviews_product 를 (product_id) 에 생성. step 6 의
-- DROP COLUMN product_id 가 해당 인덱스를 묵시적으로 drop; 동일하게 재생성.
CREATE INDEX IF NOT EXISTS idx_product_reviews_product
  ON product_reviews (product_id);

-- ── 11) sequence 이름 cleanup (id_new_seq -> id_seq) ────────────
ALTER SEQUENCE products_id_new_seq RENAME TO products_id_seq;

-- ── 코멘트 ──────────────────────────────────────────────────────
COMMENT ON COLUMN products.id IS
  'bigserial PK (2026-05-18, SPEC-SEARCH-V6-001 P0, old uuid discarded — 056 precedent). product_embeddings/product_reviews FK reference this.';

COMMIT;

-- ── 권장 검증 (수동, commit 후) ─────────────────────────────────
--   SELECT data_type FROM information_schema.columns
--     WHERE table_name='products' AND column_name='id';                -- bigint
--   SELECT data_type FROM information_schema.columns
--     WHERE table_name='product_reviews' AND column_name='product_id'; -- bigint
--   -- 고아 체크 (반드시 0):
--   SELECT count(*) FROM product_reviews pr
--     LEFT JOIN products p ON p.id = pr.product_id WHERE p.id IS NULL;  -- 0
--   SELECT pg_get_serial_sequence('products','id');                    -- products_id_seq
