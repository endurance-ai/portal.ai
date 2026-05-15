# 데이터 모델 — dev-app Postgres

> 모든 영속 데이터는 **dev-app EC2 의 자체호스트 Postgres 16** 단일 인스턴스. PostgREST + nginx shim 으로 `/rest/v1/*` 노출. SPEC-INFRA-MIGRATE-001 P2/P4/P6 이후. (이전: Supabase Postgres — 2026-05-10 pause)
>
> 서버 접근은 PostgREST service JWT (`DB_TOKEN`, 구 SUPABASE_SERVICE_ROLE_KEY) 또는 `pg` Pool 직접 (Auth.js 인증 경로). 어드민 SSR 쿠키는 Auth.js v5 JWT 로 전환됨 (SPEC-INFRA-MIGRATE-001 P3).

## 테이블 인벤토리

| 영역 | 테이블 | 마이그 | 역할 |
|---|---|---|---|
| **분석 로그** | `analyses` | 001 | 분석 1건 = 1행. AI raw 응답 + 검색 결과 전체 + `is_pinned` |
| | `analysis_sessions` | 021 | 세션 단위 묶음 (user_voice 분석용) |
| **상품** | `products` | 004 + 005 + 006 + 011 + 027 | 크롤로 들어온 모든 SKU. 임베딩 컬럼 추가됨 (027) |
| | `product_reviews` | 019 | 상품 리뷰 |
| | `product_ai_analysis` | 012 | v4 검색이 INNER JOIN 하는 LLM 분석 산출물. **v5 검증 후 드랍 예정** |
| **브랜드** | `brand_nodes` | 002 + 007 + 037 + 040 + 041 + 042 + **055** + **056** + **067** | Fashion Genome v2 슬림화. **067 (2026-05-15)**: 037 BGE-m3 텍스트 임베딩 자산(embedding/x_umap/y_umap 등) + 옛 LLM 메타(sensitivity_tags/brand_keywords/aliases/category_type/representative_image_urls/price_band) 13 컬럼 DROP. price_min_usd / price_max_usd (numeric, USD) 신규 + products 기준 backfill. **id bigserial** (056). primary/secondary_node_id FK + node_confidence (055) |
| | `brand_attributes` | 010 | 어드민에서 채우는 브랜드 속성 |
| | `brand_similar` | 038 + **056** | 브랜드 간 유사도 그래프 (top-20 edges per brand, cosine similarity). brand_id bigint 전환 (056) |
| | `brand_attribute_proposals` | 039 + **056** | LLM 추론 브랜드 속성 검수큐 (confidence ≥ 0.85 자동/0.7~0.85 pending/< 0.7 폐기). brand_id bigint 전환 (056) |
| | `brand_node_review_queue` | **055** + **056** | Brand-VLM 분류 실패/저신뢰/충돌/image 부족 admin 수동 검수 큐. open 1건 per brand (partial unique). reason: insufficient_images/low_confidence/multi_node_conflict/vlm_failed/alias_candidate |
| | `brand_sku_counts` | 043 | 브랜드별 SKU 카운트 MATERIALIZED VIEW (perf 캐시) |
| **검색 품질** | `search_quality_logs` | 014 | 검색 호출당 score breakdown (어드민 디버거 시각화) |
| **평가** | `eval_reviews` | 013 + 015 | 평가 대기열 리뷰 핀 (유일하게 유지) |
| | ~~`eval_golden_set`~~ | ~~013~~→**048 드랍** | migration 048 (2026-05-13) 에서 삭제됨 |
| | ~~`eval_golden_queries`~~ | ~~033~~→**048 드랍** | migration 048 에서 삭제됨 |
| | ~~`eval_judgments`~~ | ~~033~~→**048 드랍** | migration 048 에서 삭제됨 |
| | ~~`eval_runs`~~ | ~~033~~→**048 드랍** | migration 048 에서 삭제됨 |
| **유저 피드백** | `user_feedbacks` | 021 | rating + tag + comment + email |
| **어드민 인증** | `admin_profiles` | 022 + 023 + 024 | `status: pending/approved/rejected` 승인 게이트 |
| **Instagram** | `instagram_post_scrapes` | 028 | 메인 플로우 스크랩 결과 (shortcode unique, raw_data jsonb) |
| | `instagram_post_scrape_images` | 028 | 슬라이드별 R2 URL + tagged_users + is_video |
| **스타일 노드** | `style_nodes` | 049 + 050 | Fashion Genome taxonomy DB 관리 (20 nodes A~T, admin CRUD). `src/lib/style-nodes-db.ts` 로 fetch (5 min cache). `fashion-genome.ts` 의 hardcoded 15-node 대체 |
| | `style_node_adjacency` | 051 | 스타일 노드 간 관계 그래프 (빈 테이블 — SPEC-BRAND-EMBED-001 이 채울 예정) |
| **프롬프트 레지스트리** | `prompts` | 052 + 053 + **059** | VLM/Text prompt DB 관리. situation 별 active 1개 유지 (partial unique index). `src/lib/prompts/registry.ts` 로 fetch (5 min cache + in-flight dedup). Admin 편집 가능 (/admin/prompts). 059: brand-vlm v1 row 추가 (gpt-4o-mini, 5-image multimodal, NODES_BLOCK/NODE_CODES/BRAND_NAME placeholders) |
| **API 로깅** | `api_access_logs` | — | 외부 API 호출 추적 |

---

## Postgres 확장 (마이그 027)

### pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE products
  ADD COLUMN embedding vector(768),
  ADD COLUMN embedding_model text,
  ADD COLUMN embedded_at timestamptz;

-- HNSW: m=16, ef_construction=200, vector_ip_ops
-- (FashionSigLIP 출력 L2-normalized → cos ≈ inner product)
CREATE INDEX idx_products_embedding_hnsw
  ON products USING hnsw (embedding vector_ip_ops)
  WITH (m = 16, ef_construction = 200);
```

### pgroonga

```sql
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- brand + name + description + material + color 통합 검색 텍스트
CREATE INDEX idx_products_pgroonga_search
  ON products USING pgroonga (
    coalesce(brand,'') || ' ' || coalesce(name,'') || ' ' ||
    coalesce(description,'') || ' ' || coalesce(material,'') || ' ' || coalesce(color,'')
  );
```

> tags 는 배열이라 `array_to_string` 이 STABLE → pgroonga 인덱스 표현식 불가. tags용은 별도 GIN.

### GIN

```sql
CREATE INDEX idx_products_tags_gin ON products USING gin (tags);
```

### 부분 인덱스

```sql
-- 임베딩 안 된 상품 빠르게 조회 (배치 idempotent 재실행용)
CREATE INDEX idx_products_embedding_pending
  ON products (id)
  WHERE embedding IS NULL AND images IS NOT NULL AND array_length(images,1) > 0;
```

---

## RPC 함수

| 함수 | 시그니처 | 용도 |
|---|---|---|
| `bulk_update_product_embeddings(payload jsonb)` | returns int | `scripts/aws/embed_products.py` 가 배치 인코딩 결과를 한 번에 upsert |
| ~~`set_hnsw_ef_search(ef int)`~~ | — | **044 드랍** — 호출 0 hits, A/B 실험용 잔재 |
| `get_product_filter_counts()` | returns table | 어드민 상품 필터 옵션 (10min CDN cache) |
| `activate_prompt(p_id bigint)` | returns prompts | **054** — atomic activate: 동일 situation 의 기존 active row deactivate + 대상 row activate 를 단일 트랜잭션으로 처리. race 조건(unique partial index 위반) 방지. SECURITY DEFINER. `app_user` EXECUTE 권한 부여됨 |
| `classify_brand_acquire(p_brand_id bigint, p_force boolean)` | returns table (id, brand_name, primary_node_id, skip_reason) | **060** — `/api/internal/classify-brand` 진입 가드. SELECT FOR UPDATE + conditional UPDATE sentinel(node_assigned_at). skip_reason NULL=진행 / 'already_classified' / 'recently_assigned'(60초 내). `app_user` EXECUTE 권한 부여됨 |
| `enqueue_brand_review(p_brand_id bigint, p_reason text, p_vlm_output jsonb)` | returns bigint | **060** — brand_node_review_queue atomic upsert. partial unique index (brand_id WHERE resolved_at IS NULL) 와 함께 open row 1건 보장. `app_user` EXECUTE 권한 부여됨 |

### 모니터링 뷰

```sql
CREATE VIEW product_embedding_coverage AS
SELECT platform,
       count(*) AS total,
       count(embedding) AS embedded,
       round(100.0 * count(embedding) / nullif(count(*),0), 2) AS pct_embedded,
       max(embedded_at) AS last_embedded_at
FROM products GROUP BY platform ORDER BY total DESC;
```

---

## RLS 정책

| 테이블 | 정책 |
|---|---|
| `admin_profiles` | own-row SELECT 정책 필수 — 없으면 middleware가 null 받아서 무한 리다이렉트 (중요한 함정) |
| `instagram_post_scrapes`, `instagram_post_scrape_images` | RLS deny-all — service role만 접근. 메인 플로우는 service role 클라이언트로 INSERT/SELECT |
| 그 외 대부분 | RLS off — 애플리케이션 레벨에서 service role / anon 분리로 통제 |

---

## 마이그레이션 인벤토리 (1~29)

| 번호 | 추가/변경 |
|---|---|
| 001 | `analyses` |
| 002 | brand_nodes 정규화 |
| 003 | style_node 컬럼 |
| 004 | `products` 테이블 |
| 005 | category, sale 컬럼 |
| 006 | subcategory, color hex |
| 007 | brand_nodes v2 업그레이드 |
| 008 | constraints + indexes |
| 009 | admin tables |
| 010 | brand attributes |
| 011 | products 상세 컬럼 + analyses prompt_text |
| 012 | `product_ai_analysis` |
| 013 | eval golden set 확장 |
| 014 | `search_quality_logs` |
| 015 | eval_reviews pin version |
| 016 | analyses.is_pinned |
| 017 | season + pattern enums |
| 018 | data cleansing |
| 019 | `product_reviews` |
| 020 | rating 컬럼 드랍 |
| 021 | analysis_sessions + user_feedbacks |
| 022 | admin_profiles |
| 023 | admin_profiles RLS |
| 024 | admin_profiles search_path |
| 025 | instagram scrapes (구 /dna 용 — 029에서 드랍) |
| 026 | get_product_filter_counts() RPC |
| **027** | **v5 인프라 — pgvector + pgroonga + HNSW + bulk RPC + coverage view** |
| 028 | instagram_post_scrapes (메인 플로우용) |
| 029 | 구 /dna 용 instagram_scrapes 드랍 |
| **033** | **v6 평가 인프라 — eval_golden_queries + eval_judgments + eval_runs + RLS + frozen baseline trigger** |
| **037** | **brand_nodes.embedding vector(1024) + HNSW** — BGE-m3 텍스트 임베딩 |
| **038** | **brand_similar** — 브랜드 유사도 그래프 (cosine, top-20 per brand) |
| **039** | **brand_attribute_proposals** — LLM 메타 추론 검수큐 (admin RLS) |
| **040** | **brand_nodes.aliases** — 브랜드 별칭 배열 |
| **041** | brand_nodes 컬럼 NOT NULL 완화 (style_node / sensitivity_tags / brand_keywords / gender_scope) |
| **042** | brand_sku_counts VIEW + UMAP layout cache 컬럼 (x_umap / y_umap) |
| **043** | brand_sku_counts → MATERIALIZED VIEW (perf 개선) |
| **044** | **legacy 5종 drop** — item_search_results 테이블, set_hnsw_ef_search() 함수, rls_auto_enable event trigger, handle_new_admin_user() 함수, brand_nodes.platform 컬럼 |
| **045** | **product_ai_analysis v6 axis 8 컬럼** — neckline/sleeve/length/closure/texture/decoration/silhouette/formality + 복합 btree 인덱스 8종 |
| **046** | 모든 테이블/컬럼 한글 COMMENT 부여 |
| **047** | pgcrypto extension drop (gen_random_uuid → PG 내장 함수로 대체) |
| **048** | **eval 4 테이블 drop** — eval_golden_queries / eval_golden_set / eval_judgments / eval_runs + prevent_frozen_v4_baseline_overwrite 함수. eval_reviews 는 유지 |
| **049** | **`style_nodes` 테이블** — code(PK), name_en, name_ko, mood, include_rule, exclude_rule, keywords_en[], keywords_ko[], is_active, created_at, updated_at |
| **050** | **`style_nodes` 20-node seed** — A~T 코드 초기 데이터 삽입 (Fashion Genome taxonomy 이전) |
| **051** | **`style_node_adjacency` 테이블** — source_code, target_code, weight (빈 테이블 — SPEC-BRAND-EMBED-001 이 채울 예정) |
| **052** | **`prompts` 테이블** — situation/version (composite natural key), is_active (partial unique index: 1 active per situation), system_md, user_md, placeholders jsonb, model_id, max_tokens, temperature, notes, created_by, updated_at. `style_nodes_set_updated_at()` 트리거 재사용 |
| **053** | **`prompts` 초기 seed** — vision-analyze v1 (이미지 분석) + prompt-search v1 (텍스트 검색) 2 row active 삽입. 옛 analyze.ts / prompt-search.ts 하드코딩 template 이전 |
| **054** | **`activate_prompt(bigint)` PL/pgSQL 함수** — SECURITY DEFINER, atomic activate (siblings deactivate + self activate). `app_user` EXECUTE 권한 부여 |
| **055** | **`brand_nodes` 노드 매핑 컬럼 추가** — primary_node_id / secondary_node_id (FK → style_nodes.id), node_confidence numeric(3,2), node_assigned_at, node_assigned_model, representative_image_urls text[]. 인덱스: idx_brand_nodes_primary/secondary. **`brand_node_review_queue` 신설** — reason enum(insufficient_images/low_confidence/multi_node_conflict/vlm_failed), partial unique open 1건 per brand. SPEC-BRAND-NODE-001 P2a |
| **056** | **`brand_nodes.id` uuid → bigserial 전환** — brand_similar/brand_attribute_proposals/brand_node_review_queue FK 동기 bigint swap. `pg_trgm` CREATE EXTENSION (crawler alias fuzzy match). sequence rename (id_new_seq → id_seq). review_queue.reason 에 `alias_candidate` 추가. SPEC-BRAND-NODE-001 PR-X |
| **059** | **`prompts` brand-vlm v1 seed** — situation='brand-vlm', model='gpt-4o-mini', max_tokens=800, temperature=0.0. system 2,275자 (5-image 브랜드 감도 분류 + taxonomy 주입). placeholders: NODES_BLOCK(style_nodes), NODE_CODES(style_nodes), BRAND_NAME(runtime). SPEC-BRAND-NODE-001 P2b |
| **060** | **classify_brand_acquire + enqueue_brand_review PL/pgSQL 함수** — `classify_brand_acquire(bigint, boolean)`: SELECT FOR UPDATE + 60초 mutex sentinel. `enqueue_brand_review(bigint, text, jsonb)`: partial unique upsert. 양 함수 `app_user` EXECUTE 권한 부여. SPEC-BRAND-NODE-001 P3' |
| **067** | **brand_nodes 슬림화 + price USD 전환** — 13 컬럼 DROP: representative_image_urls / category_type / aliases / sensitivity_tags / brand_keywords / embedding / embedding_model / embedding_text_hash / embedded_at / x_umap / y_umap / umap_at / price_band. 관련 인덱스 cascade 삭제. price_min_usd / price_max_usd (numeric) 신규. products 기준 USD backfill (정적 FX: KRW 1/1370, GBP 1.27, EUR 1.07, JPY 1/156, CNY 1/7.2). price_band 파싱 fallback. |
| **068** | **ai 스키마 app_user READ-ONLY GRANT** — `GRANT USAGE ON SCHEMA ai TO app_user; GRANT SELECT ON ALL TABLES IN SCHEMA ai TO app_user; ALTER DEFAULT PRIVILEGES FOR ROLE ai_user IN SCHEMA ai GRANT SELECT ON TABLES TO app_user`. ai-server(ai_user 소유) 테이블을 어드민 `/admin/ai-insights` 에서 read-only 조회. |

---

## DB 클라이언트

| 파일 | 키/드라이버 | 사용처 |
|---|---|---|
| `src/lib/supabase.ts` | PostgREST service JWT (`@supabase/supabase-js` 클라이언트, 엔드포인트는 dev-app nginx shim) | API Routes — DB 쓰기/관리 작업 |
| `src/lib/db.ts` | pg Pool (`DATABASE_URL`) | Auth.js Credentials Provider — `admin_profiles` 직접 조회 (P3). **ai 스키마 직접 raw SQL** — `/api/admin/ai-insights` 가 `ai.card_impression` / `ai.log_conversation_event` / `ai.user_session` 조회 (068 GRANT 후, SELECT-only) |
| ~~`src/lib/supabase-server.ts`~~ | ~~anon (SSR 쿠키)~~ | **삭제됨** — Auth.js 전환 후 폐기 (SPEC-INFRA-MIGRATE-001 P3) |
| ~~`src/lib/supabase-browser.ts`~~ | ~~anon (브라우저)~~ | **삭제됨** — 동일 이유 |

자세한 패턴: `docs/PATTERNS.md` 의 "DB 클라이언트" 섹션.

---

## Brand Graph 테이블 (2026-05-10, migrations 037~043 + 055~056)

### brand_nodes (주요 컬럼 — migration 067 후 현행)

> ⚠️ **067 (2026-05-15) 에서 13 컬럼 삭제됨.** 아래는 현재 존재하는 컬럼만 기재.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| **id** | **bigserial** | **PK — 056 에서 uuid → bigserial 전환 (2026-05-14)** |
| ~~embedding~~ | ~~vector(1024)~~ | **067 DROP** — BGE-m3 텍스트 임베딩 (037 자산). `brand_multimodal_embeddings` 로 대체 |
| ~~aliases~~ | ~~text[]~~ | **067 DROP** |
| ~~x_umap / y_umap~~ | ~~float8~~ | **067 DROP** |
| ~~sensitivity_tags~~ | ~~text[]~~ | **067 DROP** |
| ~~brand_keywords~~ | ~~text[]~~ | **067 DROP** |
| ~~representative_image_urls~~ | ~~text[]~~ | **067 DROP** — `products.is_brand_representative` 가 source of truth |
| ~~category_type~~ | ~~text~~ | **067 DROP** |
| ~~price_band~~ | ~~text~~ | **067 DROP** — price_min_usd / price_max_usd 로 대체 |
| primary_node_id | bigint | FK → style_nodes.id. brand 1차 감도 (055, VLM 배정) |
| secondary_node_id | bigint | FK → style_nodes.id. brand 2차 감도 (055) |
| node_confidence | numeric(3,2) | VLM 출력 confidence 0-1 (< 0.7 이면 review queue 자동 분기) (055) |
| node_assigned_at | timestamptz | VLM 배정 시각 (055) |
| node_assigned_model | text | VLM 모델 ID 추적 (055) |
| price_min_usd | numeric | USD 환산 최저가 (067 신규). products 기준 backfill 또는 어드민 수동 입력 |
| price_max_usd | numeric | USD 환산 최고가 (067 신규) |

### brand_similar

| 컬럼 | 타입 | 설명 |
|---|---|---|
| brand_id | int8 | FK → brand_nodes.id |
| similar_brand_id | int8 | FK → brand_nodes.id |
| score | float8 | cosine similarity (BGE-m3 기반) |
| created_at | timestamptz | — |

top-20 per brand 기준 약 42,000 edges. `(brand_id, similar_brand_id)` UNIQUE.

### brand_attribute_proposals

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| brand_id | int8 | FK → brand_nodes.id |
| attribute_key | text | 속성 이름 (vibe, palette, material, sensitivity 등) |
| proposed_value | text | LLM 추론 값 |
| confidence | float8 | 0.0~1.0 (≥ 0.85 auto / 0.7~0.85 pending / < 0.7 폐기) |
| status | text | `auto` / `pending` / `approved` / `rejected` |
| created_at | timestamptz | — |

RLS admin-only. 어드민 `/admin/brand-proposals` 에서 일괄 승인/거절.

### brand_node_review_queue (migration 055)

VLM 분류 실패/저신뢰/충돌/image 부족 케이스를 admin 수동 검수로 보내는 큐.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial | PK |
| brand_id | bigint | FK → brand_nodes.id ON DELETE CASCADE (056 에서 uuid → bigint 전환) |
| reason | text | `insufficient_images` / `low_confidence` / `multi_node_conflict` / `vlm_failed` / `alias_candidate` |
| vlm_output | jsonb | VLM raw response (있으면) |
| admin_note | text | 관리자 메모 |
| resolved_at | timestamptz | NULL이면 미처리 open |
| resolved_by | text | 처리자 |
| created_at | timestamptz | — |

open(resolved_at NULL) 1건 한도 per brand (partial unique). resolved row 는 이력 보존.

### brand_sku_counts (MATERIALIZED VIEW, migration 043)

브랜드별 SKU 카운트 캐시. `REFRESH MATERIALIZED VIEW CONCURRENTLY brand_sku_counts` 로 갱신.

---

## ai 스키마 (migration 068, 2026-05-15)

`ai` 스키마는 **`endurance-ai/ai-server`** (Python FastAPI + Alembic) 가 소유(`ai_user`). kiko.ai Next.js 앱은 **read-only** (`app_user` SELECT 권한, migration 068).

어드민 `/admin/ai-insights` (`GET /api/admin/ai-insights`) 가 `src/lib/db.ts` pg Pool 로 ai schema-qualified SQL 직접 쿼리.

| 테이블 | 역할 |
|---|---|
| `ai.card_impression` | 대화형 봇이 추천 카드를 노출·클릭한 이력 (CTR 통계 원본) |
| `ai.log_conversation_event` | 대화 이벤트 시계열 (user_text/bot_text/intent_routed/search_done 등) + latency_ms |
| `ai.user_taste_profile` | 사용자 취향 프로필 (누적 학습) |
| `ai.user_session` | 현재 진행 중 세션 스냅샷 (chat_id PK, TTL 기반 1 row per user) |

> `ai_user` 가 향후 만드는 신규 테이블도 `ALTER DEFAULT PRIVILEGES` 로 `app_user` 자동 SELECT.
> kiko.ai 는 쓰기 경로 없음 — 어드민 통계 조회 전용.

---

## eval_golden_queries (2026-05-04, migration 033)

검색 v6 평가용 골든셋 쿼리 카탈로그.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |
| instagram_url | text | NULL |
| query_signature | text | NULL |
| intent_note | text | NOT NULL |
| created_by | text | NOT NULL |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |
| algorithm_version | text | NOT NULL DEFAULT 'v4' CHECK IN ('v4', 'v6') |

제약:
- `CONSTRAINT eval_golden_queries_identity_present CHECK (instagram_url IS NOT NULL OR query_signature IS NOT NULL)` — 최소 한 가지 식별자
- `CREATE UNIQUE INDEX eval_golden_queries_identity_unique ON eval_golden_queries (instagram_url, query_signature) NULLS NOT DISTINCT` — dual identity dedup (PostgreSQL 15+)
- RLS FOR ALL TO authenticated USING/WITH CHECK (EXISTS SELECT 1 FROM admin_profiles WHERE user_id = auth.uid() AND status = 'approved')

인덱스:
- `idx_eval_golden_queries_algo` ON (algorithm_version)

---

## eval_judgments (2026-05-04, migration 033)

사람 라벨링 — (golden_query × product × algorithm_version) 단위 relevance grade 0~3.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |
| golden_query_id | uuid | NOT NULL REFERENCES eval_golden_queries(id) ON DELETE CASCADE |
| product_id | uuid | NOT NULL REFERENCES products(id) ON DELETE CASCADE |
| relevance_grade | smallint | NOT NULL CHECK (relevance_grade BETWEEN 0 AND 3) |
| labeler_id | text | NOT NULL |
| labeled_at | timestamptz | NOT NULL DEFAULT now() |
| algorithm_version | text | NOT NULL CHECK IN ('v4', 'v6') |
| notes | text | NULL |

제약:
- `UNIQUE (golden_query_id, product_id, algorithm_version)` — 동일 조합 중복 방지
- RLS FOR ALL TO authenticated USING/WITH CHECK (admin_profiles.status='approved')

인덱스:
- `idx_eval_judgments_query_algo` ON (golden_query_id, algorithm_version)
- `idx_eval_judgments_product` ON (product_id)

relevance_grade 스케일: 0=irrelevant / 1=poor / 2=good / 3=excellent. 기존 eval_reviews.verdict (pass/fail/partial) 와 완전히 분리.

---

## eval_runs (2026-05-04, migration 033)

NDCG@10 / Precision@5 메트릭 스냅샷. golden_query_id NULL = 전체 쿼리 aggregate.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |
| golden_query_id | uuid | NULL REFERENCES eval_golden_queries(id) ON DELETE CASCADE |
| algorithm_version | text | NOT NULL CHECK IN ('v4', 'v6') |
| ndcg_at_10 | numeric(5,4) | NOT NULL CHECK (ndcg_at_10 BETWEEN 0 AND 1) |
| precision_at_5 | numeric(5,4) | NOT NULL CHECK (precision_at_5 BETWEEN 0 AND 1) |
| query_count | integer | NOT NULL CHECK (query_count >= 0) |
| judgment_count | integer | NOT NULL CHECK (judgment_count >= 0) |
| frozen | boolean | NOT NULL DEFAULT false |
| computed_at | timestamptz | NOT NULL DEFAULT now() |
| notes | text | NULL |

제약:
- RLS FOR ALL TO authenticated USING/WITH CHECK (admin_profiles.status='approved')

인덱스:
- `idx_eval_runs_algo_computed` ON (algorithm_version, computed_at DESC)

트리거 — `prevent_frozen_v4_baseline_overwrite()`:
- BEFORE INSERT ON eval_runs
- 조건: algorithm_version='v4' AND golden_query_id IS NULL AND 기존 frozen=true row 존재
- 동작: RAISE EXCEPTION 'baseline already frozen for v4 aggregate' USING ERRCODE = 'check_violation'
- SECURITY DEFINER + SET search_path = public, pg_temp (schema injection guard, migration 024 패턴)

메트릭 알고리즘 상세: `docs/features/search-engine.md` 의 "Evaluation Infrastructure" 섹션

SPEC: SPEC-V6-EVAL
