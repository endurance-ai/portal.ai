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
| **브랜드** | `brand_nodes` | 002 + 007 | Fashion Genome v2: 15 style nodes + brand DNA |
| | `brand_attributes` | 010 | 어드민에서 채우는 브랜드 속성 |
| **검색 품질** | `search_quality_logs` | 014 | 검색 호출당 score breakdown (어드민 디버거 시각화) |
| **평가** | `eval_reviews`, `eval_golden_set` | 013 + 015 | 평가 골든셋 + 리뷰 핀 |
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

---

## 클라이언트 3종

| 파일 | 키 | 사용처 |
|---|---|---|
| `src/lib/supabase.ts` | service role | API Routes — DB 쓰기/관리 작업 |
| `src/lib/supabase-server.ts` | anon (SSR 쿠키) | RSC, middleware — 유저 인증 |
| `src/lib/supabase-browser.ts` | anon (브라우저) | 어드민 페이지의 클라이언트 컴포넌트 |

자세한 패턴: `docs/PATTERNS.md` 의 "Supabase 클라이언트 — 3종" 섹션.
