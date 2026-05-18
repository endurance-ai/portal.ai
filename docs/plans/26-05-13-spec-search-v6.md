# SPEC-SEARCH-V6-001 — Embedding-First Retrieval + Schema Overhaul + v4/v5 Debt Removal

**Status**: Draft — embedding-first 재작성 + 스코프 확장, 사용자 ratification 대기 (잔여 결정 4건 §13)
**Created**: 2026-05-13
**Rewritten**: 2026-05-18 (attribute weight-sum → embedding-first 전환)
**Scope-expanded**: 2026-05-18 (스키마 오버홀 + v4/v5 부채 전면 제거 + 크롤러 cross-repo 를 본 SPEC 하나에 fold — 사용자 명시 결정)
**Depends on**: SPEC-NODE-REDESIGN-001, SPEC-PROMPT-REGISTRY-001, SPEC-BRAND-NODE-001, SPEC-SEARCH-UNIFY-001
**Demoted dependency**: SPEC-BRAND-EMBED-001 — hard dep → **Track B (연기) 입력** (§6, §14)
**Cross-repo deliverable**: `endurance-ai/crawler` PR (TS 타입 동기화 + PAI write 경로 제거 — §11)
**Blocks**: 없음 (검색 v6 재설계 마지막 + v4/v5 부채 청산)
**Supersedes**: 본 문서 v1 (9-step weighted scoring, 2026-05-13~2026-05-15)

> **SPEC 소유 리포 주의**: 본 SPEC 은 `endurance-ai/kiko.ai-app` 리포가 추적한다. 마이그레이션 작성/적용 주체가 kiko.ai (DB 가 크롤러와의 유일 계약)이고 1차 코드(검색 엔진 + 스키마)가 app 리포에 있기 때문. 크롤러 변경은 app-owned 스키마 마이그레이션의 downstream 결과 → 별도 리포 PR 을 **명시 산출물**로 추적 (§11), SPEC 자체는 이동하지 않음.

---

## HISTORY

| 일자 | 변경 |
|---|---|
| 2026-05-13 | v1 최초 작성 — Hard filter chain + brand-first weighted ranking (9-step `WEIGHTS_V6` 가중합). |
| 2026-05-15 | HANDOFF 정리, Q1~Q5 결정 대기. brand multimodal 인프라(063~066) 완료, 풀배치 미실행. |
| 2026-05-18 | **9-step weighted → embedding-first 전환 (사용자 결정).** productScore/brandScore 가중합·moodTags·style weight·expand_adjacency·A/B cutover 폐기. 단일 `cosine(query_emb, products.embedding)` 랭킹. PAI 의존 제거. brand 벡터·centroid·adjacency interim 미사용(Track B). |
| **2026-05-18 (확장)** | **스코프 확장 — 전부 SPEC-SEARCH-V6 하나에 fold (사용자 명시 결정).** ① 데이터 숫자 정정 (78,785/91% → 118,504 / 미임베딩 ~47,000 ≈60%). ② 마이그 번호 정정 (068 stale → **069** 부터). ③ 스키마 오버홀: `product_embeddings` 별도 테이블 + 027 자산 rework + `products.id` uuid→bigserial (056 템플릿). ④ v4/v5 부채 전면 제거: `product_ai_analysis` DROP + v4/v5 어댑터·circuit-breaker·registry 다중엔진 머신 삭제 (SearchEngine port 인터페이스는 보존). ⑤ 크롤러 cross-repo coordination 섹션 신설. 잔여 ratification 4건 불변. |
| **2026-05-18 (ratified)** | **잔여 4건 ratified — 전부 권장값.** ①fallback = category-only 전수 degrade(`degraded:true`). ②secondary_style_node = 추출·v6 미사용·Track B 보존(Vision 출력 유지). ③image+text = image-dominant `normalize(0.7·img+0.3·txt)`, α=0.7 락. ④Modal 텍스트 타워 = AC-011 사전검증 + 노출 시 결정3 융합/미노출 시 자동 image-only(사용자 Modal 프로비저닝 직접 담당). §13 normative 락, 대안 옵션 폐기. P3 ratify-gate 해제. |
| **2026-05-18 (Modal text tower 배포)** | **Modal `embed_app.py` text tower 배포 완료 (aws-infra 리포).** `/embed/text` 엔드포인트 + `Embedder.embed_text` (open_clip tokenizer+encode_text, image 와 동일 FashionSigLIP 768 L2-norm). `modal deploy`/`/health` 200/`/embed/text` 라우트 도달 + auth-gate 동작 검증. **AC-011 사전검증 게이트 해소** → 결정 3 image+text 융합이 **기본 활성 경로**. image-only 는 런타임 안전 폴백으로 강등. authed functional smoke = P5 이월. §14 "텍스트 엔드포인트 신설" 항목 제거(완료). |
| **2026-05-18 (P0 구현 드리프트 정정)** | **expert-backend P0 구현 결과 반영.** ① §7b: "product_embeddings 미존재 기준 부분인덱스 rework" 는 Postgres 상 불가(부분인덱스 predicate cross-table 참조 금지) → 027 products-own predicate 유지 + cross-table anti-join = `product_embedding_coverage` VIEW(LEFT JOIN)/embed 스크립트 권위. ② v5 DB RPC(`search_products_v5`, `product_search_text`) drop = **P0/069** (§10b TS 어댑터 제거=P2 와 분리). ③ §15 P0 마이그 3분할 확정: `069_drop_pai_and_v5_embedding_assets` → `070_products_pk_to_bigserial`(056) → `071_create_product_embeddings`. products.embedding* DROP = cutover 후 별 마이그(P0 미포함). ④ §10e `get_product_filter_counts()`(026) PAI late-binding → DROP 후 어드민 상품필터 P5 까지 의식된 임시 파손 명확화. |
| **2026-05-18 (드라이런 NO-GO #1)** | **069 `product_search_text(products)` DROP bare→CASCADE 정정.** 코드 검증: pgroonga 인덱스(`idx_products_pgroonga_search`, 027) + `product_search_text` 의 유일 소비자 = `search_products_v5` RPC(030:90, 031:128, 069 가 이미 drop). 앱·v4/v5 어댑터·타 마이그 사용처 0건. 069:64 bare DROP 이 pgroonga 의존성으로 실패 → CASCADE 로 pgroonga 인덱스 동반 제거. §10e pgroonga audit 항목 = **dead infra 확정·P0 해소** ("admin 상품검색 pgroonga 의존" 가정 거짓 판명). 잔여 P5 audit = `search_quality_logs`+`get_product_filter_counts` 2건. |
| **2026-05-18 (드라이런 NO-GO #2)** | **071 HNSW 직렬 빌드 강제** (`SET LOCAL max_parallel_maintenance_workers=0`, `CREATE INDEX` 직전). 사유: dev-app `db` 컨테이너 `/dev/shm` 64MB(Docker 기본) < 병렬 HNSW 공유세그먼트(~533MB). 직렬은 private `maintenance_work_mem`(512MB) 사용·`/dev/shm` 0 → 마이그 self-contained(트랜잭션-로컬, 인프라 가정 무의존). **069→070→071 SQL 로직 end-to-end 무결 입증** (070 PK swap 완주, 071 backfill INSERT 71,441 + src=dst parity OK) — 유일 차단 = 컨테이너 shm 한계뿐(SQL/호스트 문제 아님, 호스트 5.8GB 여유, 프로브 입증). §7a/§15 P0 071 노트 반영. |

---

## 1. Supersession 근거 — 폐기 / 생존

### 1.1 폐기 (v1 → v2, 코드로 진입 안 함)

| 폐기 대상 (v1 위치) | 근거 |
|---|---|
| `productScore` 가중합 `0.25·color+0.15·fit+0.20·kw+0.10·fab` (v1 §5/§6.2) | enum 가중합 effective signal ≈ 0.09 (v1 §1). cosine 단일 신호가 시각 의미를 더 풍부하게 포착. |
| `brandScore = 0.5·secondary_match + 0.5·cosine(brand_vec, user_img)` (v1 §6.1) | brand 멀티모달 벡터(11/2072)·centroid(member 1~3) interim 불안정. brand 단계 자체 제거. |
| 9-step weighted, `totalScore = 0.40·brand + 0.60·product` (v1 §6.3) | 2-tier 가중 구조 폐기. 단일 cosine DESC. |
| `moodTags`/`stylePrimary`/`styleSecondary` ranking weight | 필터 전용 강등 (랭킹 기여 0). |
| `expand_adjacency` API / adjacency 1-hop 확장 (v1 Step 9, AC-010) | soft adjacency = 클러스터링(Track B) 필요 → 의도적 연기 (§14). interim 은 EXACT primary_node 만. |
| A/B cutover 인프라 — `/api/search-products-v6` 신규 route (v1 P1/P5) | 신규 route 금지. v4/v5 부채 자체를 청산 (§10) → A/B 명분 소멸. |
| PAI(`product_ai_analysis`) 백필 의존 (v1 Phase 4) | cosine 랭킹은 `product_embeddings.embedding` 만 사용. PAI 테이블 자체 DROP (§10). |
| `secondary_style_node` 기반 ranking/rerank | interim 미사용. Track B 후보 (§13 결정 2). |

### 1.2 생존

| 항목 | 역할 |
|---|---|
| Vision 13축 추출 (`vision-analyze`) | **랭킹 가중 0**. `primary_style_node`+`category` 필터 전용. 나머지 11축 = 해석성·Track B 입력. |
| category hard filter | 유지 — `products.category` 매칭. |
| cold-start brand 제외 (v1 AC-012 계승) | `primary_style_node IS NULL` brand 의 product 완전 제외. |
| `SearchEngine` port **인터페이스** (engine-port.ts DTO + `/api/find/search` 단일 seam) | 보존 — 단, 다중엔진 머신(v4/v5/breaker/version 분기)은 제거, 구현체는 v6 단일 (§6, §10). |

---

## 2. 문제 (embedding-first 재정의)

v1 가중합의 세 구조적 결함:

1. **신호 희석** — style_node weight 에 VLM 합의율을 곱하면 effective signal ≈ 0.09 (v1 §1). enum 양자화가 시각 의미를 거칠게 절단.
2. **백필 결합** — `productScore` 가 PAI 13축 백필 차고에 묶임.
3. **brand 벡터 불안정** — `brandScore` 가 풀배치 11/2072·centroid member 1~3 에 의존.

**embedding-first 가 해소:** `products.embedding`(Marqo/marqo-fashionSigLIP, 768-dim, L2-norm)을 별도 `product_embeddings` 테이블로 분리, user_image 와 동일 FashionSigLIP 공간(Modal `/embed`, HANDOFF Q5 a) → `cosine` 직접 동작. 랭킹이 enum 백필·brand 벡터·가중치 튜닝 어디에도 안 묶임. v4/v5 부채(PAI 테이블, 다중엔진 머신)는 dev-only/무사용자이므로 **이번에 함께 청산**(사용자 확정).

---

## 3. 목표

1. **Embedding-first 랭킹** — `cosine(query_emb, product_embeddings.embedding) DESC` 단일 기준. 가중합 0.
2. **결정론적 필터** — Vision `primary_style_node`(EXACT) → brand → category + in_stock.
3. **스키마 정상화** — embedding 을 `product_embeddings` 로 분리(brand_multimodal_embeddings 대칭), `products.id` uuid→bigserial(056 검증 템플릿), PAI 등 dead 자산 제거.
4. **부채 청산** — v4/v5 어댑터·circuit-breaker·다중엔진 registry 제거. port 인터페이스만 보존, 구현체 v6 단일.
5. **포트 호환** — `/api/find/search` 호출부 diff 최소(엔진 호출 경계 불변), 신규 route 0.
6. **cold pool 안전** — 필터 0건 시 ratified fallback 사다리 (§13 결정 1).

---

## 4. 확정 아키텍처 (사용자 결정 2026-05-18 — 재논의 금지)

```
user image (+ optional text prompt)
  → Vision /analyze ('vision-analyze' prompt): primary_style_node + category   ← 필터 전용, 랭킹 기여 0
  → FILTER 1: brands WHERE primary_style_node = target_node
       (EXACT match; soft adjacency 확장은 DEFERRED — 클러스터링 Track B, 본 SPEC 밖)
  → FILTER 2: 위 brands 의 products WHERE category match AND in_stock
  → RANK:    cosine(query_emb, product_embeddings.embedding) DESC,
             tie-break products.created_at DESC, LIMIT N
  → query_emb = FashionSigLIP(user_image [+ text prompt 융합])  — 동일 768-dim L2-norm 공간
```

soft adjacency / secondary_node / brand 벡터 / centroid 는 다이어그램에 **없음** — 의도적 (§14).

---

## 5. 데이터 현실 (정정 — v1/HANDOFF 의 78,785·91% 는 stale)

| 항목 | 값 | 비고 |
|---|---|---|
| products 총계 | **118,504** | 정정 (구 78,785 stale) |
| products 미임베딩 | **~47,000 (≈60% 임베딩 완료)** | 정정 (구 91% stale) |
| 잔여 임베딩 처리 | **사용자가 로컬에서 처리 (저비용)** | AWS Spot 배치 불필요 |
| embedding model | Marqo/marqo-fashionSigLIP, 768-dim, **L2-norm** | 불변 |
| user_image 임베딩 경로 | AI 서버 Modal `/embed` (동일 FashionSigLIP 공간) | HANDOFF Q5 확정 a |
| brand primary_style_node 배정 | 1300+/2072 | NULL brand product 는 필터 단계 완전 제외 (v1 AC-012 계승) |
| 다음 마이그 번호 | **069** | 정정 — 068 = `ai 스키마 app_user GRANT` 로 이미 존재 (data-model.md L182). 069 부터 사용 |

---

## 6. 통합 제약 (HARD) — Port 인터페이스 보존, 다중엔진 머신 제거

[HARD] `SearchEngine` port **인터페이스 계약은 보존**한다 (라우트 청결성 + 미래 대비):

- [HARD] `engine-port.ts` 의 `SearchEngine` / `RecommendRequest` / `RecommendResponse` 인터페이스는 **유지**. `/api/find/search` 가 구체 엔진이 아닌 port 를 호출하는 **단일 seam** 도 유지.
- [HARD] 실제 엔진 본체는 `src/domains/search/adapters/v6-adapter.ts` 의 stub body 를 **교체**. 동일 인터페이스.
- [HARD] **다중엔진 머신은 제거** (§10): `v4-fallback-adapter.ts` · `v5-adapter.ts` · `circuit-breaker.ts` 삭제. `registry.ts` 는 `selectEngine() → v6Adapter` 단일로 축소. `engine-port.ts` 의 `EngineVersion` 타입·`resolveEngineVersion()`·`SEARCH_ENGINE_VERSION` env 분기 제거(또는 v6 단일 상수로 축소).
- [HARD] `/api/find/search` 의 엔진 **호출 경계**(`selectEngine(...).search(req)`)는 형태 불변 → route 본문 diff 최소. UNIFY-001 특성화 게이트는 v6 단일 동작 기준으로 갱신(다중엔진 fallback 테스트는 머신 삭제와 함께 제거/대체).

port DTO → v6 사용 매핑:

| `RecommendRequest` 필드 | v6 사용 |
|---|---|
| `imageUrl` | Modal `/embed` 입력 → `query_emb` |
| `styleNode.primary` | FILTER 1 target node (EXACT) |
| `item.category` | FILTER 2 category 매칭 |
| `item.searchQuery`/`searchQueryKo` | optional text prompt — §13 결정 3·4 정책 |
| `brandFilter` (non-empty) | strong call → 결과 `strongMatches` 분류 (grouping 계약 유지) |
| `styleNode.secondary`/`moodTags` | **interim 미사용** (Track B, §13 결정 2) |

[HARD] `RecommendResponse` 형태 불변: `{ strongMatches, general, engine:"v6", failed }`. `failed:true` ⇒ route 가 기존 502 `AI_SERVER_FAILED` 로 매핑.

---

## 7. 스키마 오버홀 (069+ 마이그레이션 — 신규 섹션)

### 7a. `product_embeddings` 별도 테이블 (사용자 확정)

```sql
-- migration 071_create_product_embeddings (069→070→071, §15 P0)
CREATE TABLE product_embeddings (
  product_id      <bigint, FK → products.id ON DELETE CASCADE>  PRIMARY KEY,
  embedding       halfvec(768)  NOT NULL,
  embedding_model text          NOT NULL,
  embedded_at     timestamptz   NOT NULL DEFAULT now()
);
-- 직렬 빌드 강제 (드라이런 NO-GO #2, 트랜잭션-로컬)
SET LOCAL max_parallel_maintenance_workers = 0;
CREATE INDEX idx_product_embeddings_hnsw
  ON product_embeddings USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 200);
```

> **HNSW 직렬 빌드 노트 (드라이런 NO-GO #2, 2026-05-18)**: 071 의 `CREATE INDEX idx_product_embeddings_hnsw` 직전 `SET LOCAL max_parallel_maintenance_workers = 0` 으로 **직렬 빌드 강제**. 사유: dev-app `db` 컨테이너 `/dev/shm` 64MB(Docker 기본) < 병렬 HNSW 공유세그먼트 요청(~533MB) → 병렬 빌드 실패. 직렬 빌드는 공유메모리 0, private `maintenance_work_mem`(512MB) 사용 → `/dev/shm` 무의존. SQL 로직/호스트 문제 아님(호스트 5.8GB 여유, 프로브로 입증). `SET LOCAL` = 트랜잭션-로컬이라 **마이그 self-contained**(컨테이너 인프라 가정 무의존). dev-only·신규 빈 테이블이라 직렬 빌드 lock 시간 허용.

- **백필**: 기존 `products.embedding`(~71k vector(768)) → `product_embeddings`(halfvec(768)) 복사 + cast. `brand_multimodal_embeddings`(063, halfvec(768) HNSW) 와 **대칭** 구조.
- **HNSW opclass 구현 결정** (P0 구현 시점, ratification 대상 아님): 권장 `halfvec_cosine_ops` (brand_multimodal_embeddings 와 대칭, L2-norm → cosine). 대안 `vector_ip_ops` (027 일관성). FashionSigLIP L2-norm 전제상 둘 다 수학적으로 등가 — 대칭성 우선으로 `halfvec_cosine_ops` 권장.
- **PK 타입**: §7c 후 `products.id` 가 bigint 이므로 `product_embeddings.product_id` 는 **처음부터 bigint** (FK swap 표면 아님).

### 7b. migration 027 자산 rework (분리 시 전부 영향)

027 이 만든 다음을 **전부 `product_embeddings` 기준으로 재작성**한다:

| 027 자산 | rework |
|---|---|
| `idx_products_embedding_hnsw` (vector_ip_ops) | → `idx_product_embeddings_hnsw` (§7a) |
| `idx_products_embedding_pending` (부분 인덱스) | **027 의 products-own 컬럼 predicate (`embedding IS NULL AND images...`) 유지** — Postgres 부분인덱스 predicate 는 타 테이블(`product_embeddings`) 참조 불가(CREATE INDEX 실패). pre-cutover 구간(products.embedding 잔존 + backfill 동안) 이 predicate 는 "product_embeddings row 없음"과 **정확히 동치**. cross-table anti-join 의 권위 소스는 아래 VIEW + embed 스크립트. |
| VIEW `product_embedding_coverage` | → `products LEFT JOIN product_embeddings` 기준 재작성 (cross-table anti-join 의 **권위 소스**) |
| RPC `bulk_update_product_embeddings(jsonb)` | → `product_embeddings` UPSERT 로 재작성 |
| `scripts/aws/embed_products.py` | → `product_embeddings` 대상 + 로컬 실행용으로 재작성 (AWS Spot 불필요 — §5). 미임베딩 선별은 `product_embedding_coverage` VIEW 기준 (부분인덱스 아님) |

- **부분인덱스 정정 (2026-05-18 P0 구현)**: 당초 "product_embeddings 미존재 기준 재작성" 은 Postgres 상 **불가능** (부분인덱스 predicate 의 cross-table 참조 금지). 실제 구현 = 027 products-own predicate 유지 + cross-table anti-join 은 `product_embedding_coverage` VIEW(LEFT JOIN) + 리워크된 embed 스크립트가 담당.
- **컬럼 DROP (cutover 후 별 마이그, P0 미포함 — 확정)**: `products.embedding` / `products.embedding_model` / `products.embedded_at` — `product_embeddings` 백필·검증·cutover 완료 후 별도 마이그레이션에서 DROP (069~071 에 미포함).

### 7c. `products.id` uuid → bigserial (사용자 확정 "이번에")

- **검증 템플릿**: migration **056** (`brand_nodes.id` uuid→bigserial + 자식 FK 동기 swap + sequence rename, SPEC-BRAND-NODE-001). 패턴: `id_new bigserial` 추가 → 자식 bigint FK 컬럼 추가 → 백필 → swap → 옛 컬럼 DROP → rename. **옛 uuid 보존 안 함** (056 선례, git/백업이 rollback 안전판).
- **실질 FK swap 표면 = `product_reviews.product_id` 하나**:
  - `product_ai_analysis.product_id` → §10 에서 테이블째 DROP → swap 불필요.
  - `product_embeddings.product_id` → §7a 신규, 처음부터 bigint.
  - `product_reviews.product_id` → 생존(크롤러 active write), bigint swap 대상. (확인됨: migration 019 `product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE`)
- 검색 풀배치 product 입력(`product_url` 자연키) 무관 — 크롤러 영향은 TS 타입만 (§11).

---

## 8. EARS 요구사항

### 8.1 Ubiquitous

- **REQ-V6-001**: The search engine **shall** implement the preserved `SearchEngine` port interface and be the sole engine implementation (no multi-engine selection machinery).
- **REQ-V6-002**: The search engine **shall** rank candidates solely by `cosine(query_emb, product_embeddings.embedding)` in the shared 768-dim L2-normalized FashionSigLIP space.
- **REQ-V6-003**: The search engine **shall** treat `vision-analyze` output (`primary_style_node`, `category`) as filter-only with zero ranking contribution.

### 8.2 Event-Driven

- **REQ-V6-010**: **When** a request has `styleNode.primary`, the engine **shall** resolve brands as `brands WHERE primary_style_node = styleNode.primary` (EXACT, no adjacency).
- **REQ-V6-011**: **When** the brand set is resolved, the engine **shall** select products `WHERE brand_id ∈ brandset AND category = item.category AND in_stock = true AND a product_embeddings row exists`.
- **REQ-V6-012**: **When** candidates are selected, the engine **shall** order by `cosine DESC` then `products.created_at DESC` and return top `N`.
- **REQ-V6-013**: **When** `imageUrl` is present, the engine **shall** obtain `query_emb` via Modal `/embed` (FashionSigLIP, 768-dim, L2-norm).
- **REQ-V6-014**: **When** `brandFilter` is non-empty, the engine **shall** classify results into `strongMatches`, else `general`, preserving the `RecommendResponse` grouping contract.
- **REQ-V6-015**: **When** a text prompt is present, the engine **shall** compute `query_emb = normalize(0.7·img_emb + 0.3·txt_emb)` via the deployed Modal `/embed/text` tower (default active path); **when** no text prompt is present, the engine **shall** use image-only `query_emb`. **If** `/embed/text` returns 5xx/timeout, **then** the engine **shall** fall back to image-only at runtime (§13 결정 3, 락).

### 8.3 State-Driven

- **REQ-V6-020**: **While** a brand's `primary_style_node IS NULL`, the engine **shall** exclude its products entirely.
- **REQ-V6-021**: **While** a product has no `product_embeddings` row, the engine **shall** exclude it from ranking.

### 8.4 Unwanted Behavior

- **REQ-V6-030**: The engine **shall not** apply any weighted attribute sum (color/fit/keywords/fabric/mood/style/season/pattern) to ranking.
- **REQ-V6-031**: The system **shall not** retain `product_ai_analysis` or any ranking dependency on it (table DROPped — §10).
- **REQ-V6-032**: The engine **shall not** use brand multimodal vectors, `node_centroids`, or `style_node_adjacency` for interim ranking/filtering.
- **REQ-V6-033**: The system **shall not** introduce a new HTTP route, and **shall not** retain v4/v5 adapters, the circuit breaker, or multi-version engine selection.
- **REQ-V6-034**: **If** the candidate set is empty after the EXACT primary-node + category filter, **then** the engine **shall** drop the node filter and rank all `category match AND in_stock = true AND product_embeddings row 존재` products by `cosine DESC` (tie `created_at DESC`), set `degraded: true` in the response, and **shall not** silently return empty (§13 결정 1, 락).
- **REQ-V6-035**: The schema migration **shall not** preserve old `products.id` uuid values (056 precedent) and **shall not** require crawler logic changes (TS-type-only — §11).

### 8.5 Optional

- **REQ-V6-040**: **Where** a text prompt accompanies the image, the engine **shall** compute `query_emb = normalize(0.7·img_emb + 0.3·txt_emb)` via the deployed Modal `/embed/text` tower (§13 결정 4 — tower deployed 2026-05-18, fusion is the default path); α (default 0.7, locked) is tunable per AC-010.

---

## 9. Acceptance Criteria (embedding-first + 스키마/부채 재작성)

**검색 엔진**
- **AC-001**: `/api/find/search` 가 v6 엔진(유일 구현체)으로 동작하고, 엔진 호출 경계 변경이 최소(route 본문 diff 가 머신 제거에 한정)다.
- **AC-002**: 반환 모든 product 의 brand `primary_style_node` 가 입력 node 와 **정확히 일치**(adjacency/secondary 확장 0건).
- **AC-003**: 반환 모든 product 가 `category = item.category AND in_stock = true AND product_embeddings row 존재`.
- **AC-004**: 정렬이 `cosine DESC` 와 일치(상위 cosine ≥ 하위). 가중합 컴포넌트가 응답·로그 어디에도 없다.
- **AC-005**: 동일 cosine product 순서가 `products.created_at DESC`.
- **AC-006**: `primary_style_node IS NULL` brand product 0건 포함.
- **AC-007**: PAI 부재 상태에서도 검색이 정상 동작(PAI 비의존 — 테이블 DROP 후 회귀 GREEN).
- **AC-008**: EXACT 필터 0건 입력 시 node 필터 드롭 → `category+in_stock+embedding 존재` 전체 cosine 랭킹 반환 + 응답 `degraded:true`. 빈 배열 그대로 반환 0건 (§13 결정 1, 락).
- **AC-009**: text prompt 없는 입력 = image-only `query_emb`.
- **AC-010**: text prompt 있고 텍스트 타워 가용 시 `query_emb = normalize(0.7·img + 0.3·txt)` (α=0.7 락). α 변경이 순위에 측정 가능 영향(튜닝 검증).
- **AC-011** (결정 4, 락): Modal text tower **배포 완료 (2026-05-18, aws-infra `embed_app.py`)** — `/embed/text` + `Embedder.embed_text` (open_clip `get_tokenizer`+`encode_text`, image 와 동일 FashionSigLIP 768 L2-norm 공간). `modal deploy` 성공 / `/health` 200 / `/embed/text` 라우트 배포·도달 + EMBED_AUTH_TOKEN auth-gate 동작 검증(wiring OK). 따라서 **image+text 융합(`normalize(0.7·img+0.3·txt)`) = 기본 활성 경로**. image-only 는 *런타임 안전 폴백*(`/embed/text` 5xx/타임아웃 시)으로 강등 — 사전검증 게이트 아님. **authed functional smoke** (실제 768-dim text 추론 + cross-modal cosine sanity) 는 **P5 검증 항목**으로 이월(앱 토큰 보유 시점; 위험 낮음 = 검증된 image 경로의 정확 미러).
- **AC-012**: Modal `/embed`/DB 전면 실패 시 `failed:true` → route 502 `AI_SERVER_FAILED`.

**스키마 오버홀**
- **AC-020**: `product_embeddings` 생성 + 기존 `products.embedding` 전량 백필 + HNSW 인덱스 동작 (ANN top-N 쿼리 GREEN).
- **AC-021**: 027 자산(부분인덱스/VIEW/RPC/배치 스크립트) 전부 `product_embeddings` 기준 재작성, 구 `products.embedding*` 컬럼은 cutover 후 별 마이그서 DROP.
- **AC-022**: `products.id` bigint 전환 후 `product_reviews` FK 정합(고아 0건), 검색·어드민 read 경로 GREEN. 옛 uuid 미보존(056 선례 준수).
- **AC-023**: `product_ai_analysis` 테이블 + 관련 인덱스(012/017/045 정의분) DROP, 이를 참조하던 코드(search-v4 query-builder JOIN 등) 제거 후 빌드/테스트 GREEN.

**부채 제거**
- **AC-024**: `v4-fallback-adapter.ts`·`v5-adapter.ts`·`circuit-breaker.ts` 삭제, `registry.ts`/`engine-port.ts` v6 단일 축소 후 `pnpm build`·`pnpm test` GREEN. UNIFY-001 다중엔진 테스트는 제거/대체.
- **AC-025**: `registry.ts`/`engine-port.ts`/`v6-adapter.ts` 의 SPEC-SEARCH-UNIFY-001 @MX:ANCHOR/@MX:REASON 가 v6-단일 실상에 맞게 갱신(ANCHOR 는 auto-delete 금지 — report 동반 demote/갱신, mx-tag-protocol 준수).
- **AC-026** (P5 잔여 audit): `search_quality_logs`(014)·`docs/features/search-engine.md` "Evaluation Infrastructure" v4/v5 참조 — 유지/대체/제거 판단 기록. (pgroonga 인덱스+`product_search_text` 는 P0/069 에서 dead infra 확정·CASCADE 제거 — 코드 검증 완료, audit 종결 §10e.)

**Cross-repo (크롤러)**
- **AC-027**: 크롤러 리포 PR — `products.id` bigint 에 따른 TS 타입 동기화(`Product.id`, `product_reviews` insert `product_id` number, `supabase gen types` 재생성). 크롤러 로직 변경 0.
- **AC-028**: 크롤러 PAI write 경로(`analyze-products.ts`) + `analyze:products` 스크립트 + 파이프라인 배선 + 관련 characterization 테스트 제거. `analyze-products` 전부 dead 면 파일째 제거(확인 후 범위 확정).

---

## 10. v4/v5 부채 전면 제거 (사용자: "개발용, 아무도 안 씀, v4v5 부채 모두 정리가 목표")

### 10a. DB

- **DROP `product_ai_analysis`** — `DROP TABLE product_ai_analysis CASCADE`. 마이그 footprint(정정): **012**(테이블) + **017**(season/pattern 컬럼) + **045**(v6 axis 8 컬럼 + 8 btree 인덱스) 가 정의, **027/032/046** 가 참조. CASCADE drop 이 인덱스/컬럼 일괄 제거. v6 embedding-first 는 PAI 비의존(REQ-V6-031).

### 10b. 코드 삭제 (TS 어댑터/코드 한정 — P2)

> **정정 (2026-05-18 P0 구현)**: 이 §10b 는 **TS 어댑터/코드** 제거 = **P2** 한정. v5 의 **DB RPC** (`search_products_v5` vector+halfvec 오버로드, `product_search_text(products)`) 는 **P0/069 에서 DROP** — products.id→bigint 후 `RETURNS TABLE(id uuid)` RPC 잔존은 스키마 모순이므로 DB 객체 제거는 P0 이 옳음 (§15 P0 명시).

- `src/domains/search/adapters/v4-fallback-adapter.ts`, `src/domains/search/adapters/v5-adapter.ts`, `src/domains/search/circuit-breaker.ts` 삭제 (P2, TS).
- `registry.ts`: 현재 top-level `import {v5Adapter}`·`import {CircuitBreaker}` + module-scope `const v5Breaker = new CircuitBreaker(...)` + `selectEngineByVersion` switch(v5-direct/v5/v4/v6) → **`selectEngine() => v6Adapter` 단일**로 축소 (P2, TS).
- `engine-port.ts`: `EngineVersion` 유니온·`resolveEngineVersion()` 제거(또는 v6 상수화). `SEARCH_ENGINE_VERSION` env 분기 소멸 (P2, TS).
- `search-v4/query-builder.ts` 등 PAI INNER JOIN 의존 코드 — PAI DROP 에 따라 제거/단순화 (search-v4 엔진 전체가 dead 면 dead 범위 확인 후 제거, P2 TS).
- **v5 DB RPC drop = P0/069** (TS 아님): `search_products_v5`(vector+halfvec 오버로드), `product_search_text(products)` 함수 — 069 마이그서 DROP. 사유: products.id bigint 전환과 RPC `RETURNS TABLE(id uuid)` 시그니처가 모순.

### 10c. Port 보존 경계 (HARD 재확인)

- **유지**: `engine-port.ts` 의 `SearchEngine`/`RecommendRequest`/`RecommendResponse` 인터페이스, `/api/find/search` 단일 seam, `v6-adapter.ts`(본체 자리).
- **삭제**: 다중엔진 fallback 명분(v4/v5/breaker/version). port 경계는 라우트 청결성+미래 위해 보존, 구현체만 v6 단일.

### 10d. @MX 태그 rework (명시 산출물)

`registry.ts`/`engine-port.ts`/`v6-adapter.ts` 의 @MX:ANCHOR/@MX:REASON/@MX:NOTE 가 "v5-direct default / lazy v4 / breaker singleton / v6 = 스텁 NOT in scope" 를 단언 → v6-단일 실상과 모순. mx-tag-protocol 준수: ANCHOR auto-delete 금지(report 동반 갱신/demote), REASON 은 SPEC 변경에 맞춰 갱신, v6-adapter.ts 의 "NOT a v6 implementation" 주석 교체.

### 10e. Audit

| 항목 | 처리 |
|---|---|
| ~~products pgroonga 인덱스(027) + `product_search_text(products)`~~ | **P0 해소 — dead infra 확정 (드라이런 NO-GO #1, 코드 검증 완료).** 유일 소비자 = `search_products_v5` RPC (030:90, 031:128) — 069 가 이미 DROP. 앱코드·v4/v5 어댑터·타 마이그 사용처 **0건**. "admin 상품검색이 pgroonga 의존" 가정은 **거짓으로 판명**. ⇒ 069 가 `idx_products_pgroonga_search` + `product_search_text` 를 **CASCADE 로 제거** (별도 audit 불필요). |
| `search_quality_logs`(014) v4 score breakdown | v6 score 구조(cosine 단일)와 불일치. 유지/대체/제거 검토 (P5 잔여 audit). |
| `get_product_filter_counts()`(026) | PAI 참조 late-binding → PAI DROP(P0) 후 호출 시 **런타임 throw**. 어드민 상품필터 UI 가 **P5 까지 의식된 임시 파손** (P0 가 v4 즉시 깸 = dev-only·무사용자 허용과 동일 성격). **P5 에서 해소** (재작성 또는 제거). |
| `docs/features/search-engine.md` | "Evaluation Infrastructure"·SearchEngine port·v4/v5 섹션을 v6-단일 실상으로 갱신(필수 동기화 3종 문서 — CLAUDE.md). |

> 잔여 P5 audit = `search_quality_logs`, `get_product_filter_counts` 2건. pgroonga/`product_search_text` 는 P0 에서 dead infra 확정·CASCADE 제거로 audit 종결.

---

## 11. Cross-Repo Coordination — `endurance-ai/crawler` (별도 리포, DB 가 유일 계약, products WRITE 주체)

코드 직접 추적 완료. 사용자가 크롤러 코드 수정 권한 부여.

### 11a. `products.id` uuid→bigint — 크롤러 write **안전**

- `import-products.ts`: products `upsert(onConflict:"product_url")` (자연키, id 미생성) → 안전. `product_url → id` 매핑 후 `product_reviews` insert(delete+insert) 도 DB 반환 id 사용.
- 필요한 크롤러 변경 = **TS 타입만**: `lib/types.ts` 의 `Product.id`, `product_url→id` 맵 값 타입, `product_reviews` row `product_id: string→number`, `supabase gen types` 재생성. **로직 변경 0**.

### 11b. PAI DROP — 크롤러 **로직 제거 번짐**

- `src/analyze-products.ts`: PAI write 경로 전체 제거 — `.from("product_ai_analysis")` insert/update(약 351~386 라인대) + 분석완료/실패 id 조회(약 239~251 라인대).
- `package.json` `"analyze:products"` 스크립트(L18) + `crawl.ts` 파이프라인 배선 + `tests/` 관련 characterization 테스트 제거.
- `analyze-products` 커맨드 전체가 dead 일 가능성 높음 → **파일째 제거 범위를 확인 후 확정**(SPEC 에 명시).

### 11c. `product_reviews` — 생존

크롤러 active write(delete+insert). FK→bigint swap 은 kiko.ai `070_products_pk_to_bigserial`(§7c, §15 P0). 크롤러 측 = TS 타입만.

### 11d. 절차 (crawler.md doc-owner 규약)

1. kiko.ai 가 마이그(069+) 작성·적용 (DB 가 유일 계약).
2. 크롤러 리포 `supabase gen types` 재실행 + 위 TS 타입/로직 변경.
3. **크롤러 리포 PR = 본 SPEC 의 명시 산출물** (AC-027/028). app 리포 PR(엔진+마이그)과 별개로 추적.

### 11e. aws-infra 리포 — Modal `embed_app.py` text tower [완료 산출물]

`/embed/text` + `Embedder.embed_text` (open_clip tokenizer+encode_text, image 와 동일 FashionSigLIP 768 L2-norm 공간) **배포 완료 (2026-05-18)**. `modal deploy`/`/health` 200/`/embed/text` 라우트 도달 + auth-gate 검증. ai-provision 스킬 컨텍스트 갱신됨(image+text 타워 명시). 잔여 = P5 의 authed functional smoke (앱 토큰 보유 시점).

---

## 12. Risks (갱신)

| Risk | 완화 |
|---|---|
| EXACT primary_node 필터가 좁아 thin-pool/0건 빈발 | §13 결정 1 fallback ratify. 0건 비율 로깅. |
| `/embed/text` 런타임 5xx/타임아웃 → text prompt 융합 실패 | text tower 배포 완료(2026-05-18). 런타임 안전 폴백 = image-only(REQ-V6-015). authed functional smoke = P5. |
| `products.id` uuid→bigint 중 product_reviews 고아/크롤러 깨짐 | 056 검증 템플릿 재사용. AC-022 정합 검증. 크롤러 onConflict=product_url 자연키라 write 안전(§11a). |
| PAI DROP 이 search-v4/admin/크롤러로 번짐 | §10b/§11b 에 사용처 열거. CASCADE drop + 빌드/테스트 GREEN 게이트(AC-023/024). |
| P0 가 v4 를 즉시 깸 | dev-only·무사용자 → 허용(사용자 확정). P0 우선 진입. |
| 027 자산 분리 누락 (인덱스/VIEW/RPC/배치 중 하나라도) | §7b 체크리스트 전수. AC-021. |
| 미임베딩 ~47k(60%)가 in-stock 인기상품 편중 | 사용자 로컬 풀배치(저비용, §5). REQ-V6-021 안전 제외(누락만, 오노출 0). |
| @MX ANCHOR 들이 stale 단언 유지 | AC-025 — mx-tag-protocol 준수 갱신(ANCHOR demote+report). |
| Vision `primary_style_node` ↔ style_nodes enum 불일치 | `vision-analyze` 가 `style_nodes` DB 최신 fetch(NODE-REDESIGN-001). 불일치 → 0 brand → 결정 1 fallback. |
| brand 벡터·centroid·adjacency(BRAND-EMBED-001) interim 미사용 stale | 의도된 상태. Track B 진입 시 재활성(§14). |

---

## 13. 결정 확정 (Ratified 2026-05-18 — 전부 권장값)

> 4건 전부 권장값으로 사용자 확정. 아래는 **normative (락)** — 대안 옵션은 폐기, 구현은 이 값을 따른다.
> (스키마 micro-결정 — HNSW opclass §7a, `analyze-products` 전부-dead 여부 §11b — 은 **구현 시점** 판단이며 ratification 게이트 아님. 불변.)

### 결정 1 — thin-pool / 0건 fallback 사다리 [확정: category-only 전수 degrade]
EXACT primary-node + category 필터 후 후보 0건이면, 엔진은 **node 필터를 드롭**하고 `category match AND in_stock = true AND product_embeddings row 존재` 전체 product 를 `cosine DESC`(tie `created_at DESC`)로 랭킹하며, 응답에 `degraded: true` 를 표기한다. 결정 2/3/4 와 독립.

### 결정 2 — secondary_style_node 역할 [확정: 추출·v6 미사용·Track B 보존]
Vision `vision-analyze` 출력은 `secondary_style_node` 를 **계속 포함**한다(제거 아님). 단 v6 의 필터·랭킹 어디에도 사용하지 않으며, Track B 재랭크 후보로만 보존한다.

### 결정 3 — image + text query 융합 [확정: image-dominant, α = 0.7]
text prompt 없으면 `query_emb` = image-only. text prompt 있으면 `query_emb = normalize(0.7·img_emb + 0.3·txt_emb)`. 기본 α = 0.7, α 는 AC-010 으로 튜닝 가능(기본값은 0.7 로 락).

### 결정 4 — Modal text tower [확정: 배포 완료 2026-05-18 → 융합 기본 활성]
Modal `embed_app.py` (aws-infra 리포)에 text tower **배포 완료** — `/embed/text` + `Embedder.embed_text` (open_clip `get_tokenizer`+`encode_text`, image 와 동일 FashionSigLIP 768 L2-norm). `modal deploy`/`/health` 200/`/embed/text` 라우트 도달 + auth-gate 동작 검증 (라우트 wiring OK).
- 결정 3 image+text 융합(`normalize(0.7·img + 0.3·txt)`)이 **기본 활성 경로**.
- image-only 는 *런타임 안전 폴백*(`/embed/text` 5xx/타임아웃 시)으로 강등 — 사전검증 게이트 아님.
- authed functional smoke (실제 768-dim text 추론 + cross-modal cosine sanity) = **P5 검증 항목** (앱 토큰 보유 시점; 위험 낮음 = 검증된 image 경로의 정확 미러).
사용자가 Modal 프로비저닝 직접 담당. **텍스트 임베딩 모델 교체 / 배치 텍스트 임베딩**은 scope **밖** 유지(§14).

---

## 14. NOT in Scope (HARD — 스코프 크리프 방지)

[HARD] 본 SPEC 은 다음을 **명시적으로 하지 않는다**:

- **brand 멀티모달 임베딩**(HANDOFF Q1 B/A/C), `scripts/embed_brand_multimodal.py` 풀배치 — interim 랭킹은 brand 벡터 미사용.
- **`node_centroids`, `style_node_adjacency`, 클러스터링** — SPEC-BRAND-EMBED-001 = **별도 트랙(Track B), 의도적 연기**.
- **adjacency 기반 다양성/soft 확장**(v1 Step 9 / `expand_adjacency`) — Track B.
- **secondary_style_node 기반 랭킹/재랭크** — interim 미사용(§13 결정 2 권장값).
- **A/B cutover 인프라**(v1 P5 신규 route + 트래픽 분기) — v4/v5 부채 청산으로 명분 소멸.
- **텍스트 임베딩 모델 교체 / 배치(bulk) 텍스트 임베딩** — `/embed/text` 단건 추론만 사용(텍스트 엔드포인트 자체는 2026-05-18 배포 완료, 더 이상 scope-out 아님).
- **Personalization / 가격·사이즈 필터 통합 / multi-item outfit 알고리즘 변경**(v1 §8 계승 — 현행 유지).
- **`engine-port.ts` 인터페이스 시그니처 변경** — 보존(다중엔진 머신만 제거).
- **옛 `products.id` uuid 값 보존** — 056 선례, 미보존(git/백업이 안전판).
- **products 미임베딩 ~47k 의 클라우드 배치** — 사용자 로컬 처리(§5).

---

## 15. 단계 재구성 (우선순위/순서, 시간 추정 금지)

> P0 가 v4 를 즉시 깸 — dev-only·무사용자라 허용(사용자 확정). §13 4건 ratified(2026-05-18) → P3 ratify-gate 해제.

- **P0 — 스키마 (최우선)**: 마이그 3분할 확정, 적용 순서 **069 → 070 → 071**:
  - **`069_drop_pai_and_v5_embedding_assets`**: `product_ai_analysis` DROP CASCADE (012 테이블 + 017/045 컬럼 + 21 인덱스) + **v5 DB RPC DROP** (`search_products_v5` vector+halfvec 오버로드) + **`product_search_text(products)` DROP CASCADE** (bare→CASCADE 정정 — pgroonga 인덱스 의존성, 드라이런 NO-GO #1) → `idx_products_pgroonga_search`(027 pgroonga 풀텍스트) **동반 제거** (dead infra: 유일 소비자=069 가 드롭하는 v5 RPC, §10e) + 027 자산 DROP (HNSW idx / pending 부분인덱스 / `product_embedding_coverage` VIEW / `bulk_update_product_embeddings` RPC).
  - **`070_products_pk_to_bigserial`**: 056 검증 템플릿. FK swap 표면 = `product_reviews` (PAI 069 에서 DROP, product_embeddings 071 에서 처음부터 bigint). 옛 uuid 미보존.
  - **`071_create_product_embeddings`**: `product_embeddings(product_id bigint PK FK, embedding halfvec(768), ...)` 생성 + 기존 `products.embedding` backfill (71,441 rows, src=dst parity 검증) + 027 자산 product_embeddings 기준 rework (HNSW `halfvec_cosine_ops`, `product_embedding_coverage` VIEW = `products LEFT JOIN product_embeddings`). **HNSW `CREATE INDEX` 직전 `SET LOCAL max_parallel_maintenance_workers=0`(직렬 빌드 강제)** — db 컨테이너 `/dev/shm` 64MB < 병렬 HNSW 공유세그먼트(~533MB), 트랜잭션-로컬 self-contained (§7a 노트, 드라이런 NO-GO #2).
  - `products.embedding*` 컬럼 DROP = **cutover 후 별도 마이그 (P0 미포함, §7b 확정)**.
  - 우선순위 High. (P0 가 v4 + 어드민 상품필터(get_product_filter_counts) 즉시 깸 — dev-only·무사용자 허용, §10e P5 해소)
- **P1 — v6 엔진**: `v6-adapter.ts` 본체 — Modal `/embed` query_emb + FILTER 1/2 + ANN top-N(cosine DESC, created_at tie) + strong/general grouping. `SearchEngine` port 구현. 우선순위 High.
- **P2 — 부채/머신 제거**: v4/v5 어댑터·circuit-breaker 삭제, `registry.ts`/`engine-port.ts` v6 단일 축소, @MX 태그 rework(AC-025), UNIFY-001 테스트 v6-단일 갱신. 우선순위 High.
- **P3 — ranking 잔여**: category-only degrade fallback(`degraded:true`) + image+text fusion `normalize(0.7·img+0.3·txt)` (§13 락). 우선순위 High.
- **P4 — 크롤러 cross-repo PR**: §11 TS 타입 동기화 + PAI write 제거 + `supabase gen types`. 크롤러 리포 PR(명시 산출물). 우선순위 Medium.
- **P5 — 검증**: 실쿼리 "잘 찾나" 골든셋 회귀(AC-002~012), 스키마 정합(AC-020~023), 빌드/테스트 GREEN(AC-024), audit 기록(AC-026), **authed `/embed/text` 768-dim 추론 + cross-modal cosine sanity**(text↔image 동일 공간 검증, AC-011 잔여), 미임베딩 잔여 로컬 풀배치. doc 3종 동기화. 우선순위 Medium.

---

## 16. 검증 추적 (REQ ↔ AC)

| REQ | AC |
|---|---|
| REQ-V6-001 / 033 | AC-001, AC-024 |
| REQ-V6-002 / 003 / 030 | AC-004 |
| REQ-V6-010 | AC-002 |
| REQ-V6-011 / 021 | AC-003 |
| REQ-V6-012 | AC-004, AC-005 |
| REQ-V6-013 | AC-009, AC-012 |
| REQ-V6-015 / 040 | AC-010, AC-011 |
| REQ-V6-020 | AC-006 |
| REQ-V6-031 | AC-007, AC-023 |
| REQ-V6-032 | §14 (코드 부재로 검증) |
| REQ-V6-034 | AC-008 |
| REQ-V6-035 | AC-022, AC-027 |
| (스키마) | AC-020, AC-021, AC-022, AC-023 |
| (부채/태그) | AC-024, AC-025, AC-026 |
| (cross-repo) | AC-027, AC-028 |

---

> 참고 (SPEC 본문 sync 불필요, 맥락용): `docs/features/search-engine.md`(P5 에서 v6-단일로 **갱신 필수** — 필수 동기화 3종), `docs/infra/data-model.md`(069+ 스키마 반영), `docs/features/brand-embed.md`(Track B 운영), `docs/features/crawler.md`(cross-repo), `HANDOFF.md`(데이터 현황 — 숫자/마이그번호 stale, 본 §5 가 정정본).
