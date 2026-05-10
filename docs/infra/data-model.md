# 데이터 모델 — Supabase Postgres

> 모든 영속 데이터는 Supabase Postgres 단일 인스턴스. service role 키로 서버 접근, anon 키로 어드민 SSR 쿠키 인증.

## 테이블 인벤토리

| 영역 | 테이블 | 마이그 | 역할 |
|---|---|---|---|
| **분석 로그** | `analyses` | 001 | 분석 1건 = 1행. AI raw 응답 + 검색 결과 전체 + `is_pinned` |
| | `analysis_sessions` | 021 | 세션 단위 묶음 (user_voice 분석용) |
| **상품** | `products` | 004 + 005 + 006 + 011 + 027 | 크롤로 들어온 모든 SKU. 임베딩 컬럼 추가됨 (027) |
| | `product_reviews` | 019 | 상품 리뷰 |
| | `product_ai_analysis` | 012 | v4 검색이 INNER JOIN 하는 LLM 분석 산출물. **v5 검증 후 드랍 예정** |
| **브랜드** | `brand_nodes` | 002 + 007 + 037 + 040 + 041 + 042 | Fashion Genome v2: 15 style nodes + brand DNA + embedding(1024-dim BGE-m3) + aliases + UMAP 2D cache |
| | `brand_attributes` | 010 | 어드민에서 채우는 브랜드 속성 |
| | `brand_similar` | 038 | 브랜드 간 유사도 그래프 (top-20 edges per brand, cosine similarity) |
| | `brand_attribute_proposals` | 039 | LLM 추론 브랜드 속성 검수큐 (confidence ≥ 0.85 자동/0.7~0.85 pending/< 0.7 폐기) |
| | `brand_sku_counts` | 043 | 브랜드별 SKU 카운트 MATERIALIZED VIEW (perf 캐시) |
| **검색 품질** | `search_quality_logs` | 014 | 검색 호출당 score breakdown (어드민 디버거 시각화) |
| **평가** | `eval_reviews`, `eval_golden_set` | 013 + 015 | 평가 골든셋 + 리뷰 핀 |
| | `eval_golden_queries` | 033 | v6 평가용 골든셋 쿼리 카탈로그 (dual identity) |
| | `eval_judgments` | 033 | 사람 라벨링 (golden_query × product × algorithm_version) |
| | `eval_runs` | 033 | NDCG@10/Precision@5 메트릭 스냅샷 (frozen baseline 지원) |
| **유저 피드백** | `user_feedbacks` | 021 | rating + tag + comment + email |
| **어드민 인증** | `admin_profiles` | 022 + 023 + 024 | `status: pending/approved/rejected` 승인 게이트 |
| **Instagram** | `instagram_post_scrapes` | 028 | 메인 플로우 스크랩 결과 (shortcode unique, raw_data jsonb) |
| | `instagram_post_scrape_images` | 028 | 슬라이드별 R2 URL + tagged_users + is_video |
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
| `set_hnsw_ef_search(ef int)` | returns void | 런타임 ef_search 튜닝 (recall ↔ latency) |
| `get_product_filter_counts()` | returns table | 어드민 상품 필터 옵션 (10min CDN cache) |

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

---

## DB 클라이언트

| 파일 | 키/드라이버 | 사용처 |
|---|---|---|
| `src/lib/supabase.ts` | service role | API Routes — DB 쓰기/관리 작업 |
| `src/lib/db.ts` | pg Pool (`DATABASE_URL`) | Auth.js Credentials Provider — `admin_profiles` 직접 조회 (P3, 2026-05-10) |
| ~~`src/lib/supabase-server.ts`~~ | ~~anon (SSR 쿠키)~~ | **삭제됨** — Auth.js 전환 후 폐기 (SPEC-INFRA-MIGRATE-001 P3) |
| ~~`src/lib/supabase-browser.ts`~~ | ~~anon (브라우저)~~ | **삭제됨** — 동일 이유 |

자세한 패턴: `docs/PATTERNS.md` 의 "Supabase 클라이언트" 섹션.

---

## Brand Graph 테이블 (2026-05-10, migrations 037~043)

### brand_nodes (신규 컬럼)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| embedding | vector(1024) | BGE-m3 텍스트 임베딩 — HNSW 인덱스 (ip ops) |
| aliases | text[] | 브랜드 별칭 배열 (정규화 매칭용) |
| x_umap / y_umap | float8 | UMAP 2D 투영 좌표 캐시 (어드민 그래프 UI용) |

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

### brand_sku_counts (MATERIALIZED VIEW, migration 043)

브랜드별 SKU 카운트 캐시. `REFRESH MATERIALIZED VIEW CONCURRENTLY brand_sku_counts` 로 갱신.

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
