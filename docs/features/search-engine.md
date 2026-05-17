# 검색 엔진

> `POST /api/search-products` 가 단일 진입점. 메인 플로우의 Step 3에서 in-process 호출됨.
> v4(현재 운영) + v5 전환 인프라(부분 적용, 풀배치 미실행) 두 레이어가 공존.

## 한눈에

| 레이어 | 상태 | 핵심 |
|---|---|---|
| **v4** | ✅ 운영 중 | `products` ⨝ `product_ai_analysis` INNER JOIN + 10차원 가중합 + 다양성 캡 |
| **v5 인프라** | ✅ 적용 (마이그레이션 027) | `products.embedding vector(768)` + HNSW + pgroonga + bulk RPC |
| **v5 풀배치** | ⚠️ 테스트만, 81k 미실행 | `scripts/aws/embed_products.py` 단발 실행 필요 |
| **v5 검색 분기** | ⚠️ 부분 | dense+sparse+RRF 통합 쿼리는 ⬜ 미작성. 단, 버전 스왑 가능한 `SearchEngine` port + 피처 플래그 `SEARCH_ENGINE_VERSION` 는 ✅ (SPEC-SEARCH-UNIFY-001) |
| **브랜드 그래프 인프라 v1 (텍스트)** | ❌ **037 자산 migration 067 (2026-05-15) 로 컬럼 drop 완료** — `brand_nodes.embedding`/`x_umap`/`y_umap`/`sensitivity_tags`/`brand_keywords` 등 13 컬럼 삭제. `brand_similar` 그래프(42k edges) 는 `brand_id` FK 만 남아 구조만 유지 | `brand_similar` (구조만, 037 자산 없음) |
| **브랜드 그래프 인프라 v2 (multimodal)** | ✅ SPEC-BRAND-EMBED-001 완료 (063~066) | `brand_multimodal_embeddings` (FashionSigLIP 768) + `node_centroids` + auto `style_node_adjacency` + UMAP. crawler bulk 완료 후 풀배치 |
| **PAI v6 axis** | ✅ 컬럼 추가 (마이그 045) | `product_ai_analysis` 에 v6 axis 8 컬럼 추가 (neckline/sleeve/length/closure/texture/decoration/silhouette/formality). 백필 스크립트: `scripts/local/pai_backfill/`. 검색 RPC 인덱스 준비됨 |

> v5 재설계 진행 중 — 기존 plans (`docs/plans/26-04-23-embedding-rewrite-plan.md`, `docs/plans/26-04-24-aws-embedding-infra.md`) 는 reference로만, 결정 기준은 다시 잡는다.

---

## v4 (현재 운영)

**엔진 본체: `src/domains/search-v4/`** (engine/scorer/ranker/query-builder/constants/types — SPEC-ARCH-APP-001 step 3, 2026-05-17). `src/app/api/search-products/route.ts` 는 852→**207 LOC thin 핸들러**로 축소(입력검증→`searchByEnums` 위임→동일 NextResponse). 동작·스코어링 byte-identical (특성화 테스트 0-diff 검증). 아래 `src/lib/...` 경로 표기는 re-export shim 호환 경로이며 실체는 `src/domains/search-v4/` · `src/shared/{enums,utils}/`.

### 흐름

1. **JOIN** — `products` ⨝ `product_ai_analysis` INNER JOIN
   - ⚠️ AI 분석 없는 상품(해외 35k)은 노출 0 — v5 전환의 핵심 동기
2. **Hard filter**
   - `brandFilter` (brand 이름 배열) — 메인 플로우의 strong matching에서 활성
   - `priceFilter` (min/max) — 있으면 DB+인메모리 필터, null price 제외
   - `passesLockedFilter` — archived flow 잔재. 현재 호출 경로에서는 미사용이지만 코드는 통과
3. **10차원 가중합 스코어링**
   - subcategory 0.25 / colorFamily 0.20 / colorAdjacent 0.10
   - styleNode gradient 0.30 / 0.15
   - fit 0.15 / fabric 0.15 / season 0.15 / pattern 0.15
   - brandDna 0.20 / moodTags 0.05 × N
   - ⚠️ **brandDna 로드 disable (2026-05-15)** — `brand_nodes.sensitivity_tags` migration 067 drop. `brandDnaMap` 빈 채로 진행 → brand boost = 0. SPEC-SEARCH-V6 가 새 ranking 으로 대체 예정.
4. **한국어/색상/스타일 매핑**
   - `src/lib/enums/korean-vocab.ts` — 한국어 패션 용어 → enum (115+ 항목)
   - `src/lib/enums/color-adjacency.ts` — 16색 인접 그래프 (검색 시 유사 색상 폴백)
   - `src/lib/enums/style-adjacency.ts` — 15 스타일 노드 유사도 (gradient scoring)
5. **다양성 캡** — 브랜드당 max 2, 플랫폼당 max 3
   - `brandFilter` 활성 시 브랜드당 cap 완화
6. **Tolerance → 결과 개수** — `toleranceToTargetCount` (`src/lib/search/locked-filter.ts`)
   - 0.0 → 10개 (tight)
   - 0.5 → 15개 (medium)
   - 1.0 → 20개 (loose)

### 입력 페이로드

```ts
interface SearchRequest {
  queries: Array<{ id, category, subcategory?, fit?, fabric?, colorFamily?, searchQuery, searchQueryKo? }>
  gender?: "male" | "female" | "unisex"
  styleNode?: { primary: string; secondary?: string }
  moodTags?: string[]
  priceFilter?: { minPrice?: number; maxPrice?: number }
  brandFilter?: string[]      // 활성 시 hard filter + cap 완화
  styleTolerance?: number     // 0.0 ~ 1.0
}
```

### 로깅

호출당 score breakdown을 `search_quality_logs` 테이블에 저장 → 어드민 검색 디버거 (`/admin/search-debugger`) 에서 시각화.

---

## v5 전환 인프라 (적용 완료, 미가동)

마이그레이션 `database/migrations/027_product_embeddings_and_pgroonga.sql` 가 다음을 추가:

### 컬럼

```sql
ALTER TABLE products
  ADD COLUMN embedding vector(768),
  ADD COLUMN embedding_model text,
  ADD COLUMN embedded_at timestamptz;
```

### 인덱스

```sql
-- pgvector HNSW (FashionSigLIP L2-normalized → cos ≈ inner product)
CREATE INDEX idx_products_embedding_hnsw
  ON products USING hnsw (embedding vector_ip_ops)
  WITH (m = 16, ef_construction = 200);

-- pgroonga 한국어 BM25 (brand + name + description + material + color)
CREATE INDEX idx_products_pgroonga_search
  ON products USING pgroonga (
    coalesce(brand,'') || ' ' || coalesce(name,'') || ' ' || ...
  );

-- tags 배열 GIN
CREATE INDEX idx_products_tags_gin ON products USING gin (tags);

-- 미임베딩 상품 빠르게 조회 (배치용 부분 인덱스)
CREATE INDEX idx_products_embedding_pending
  ON products (id)
  WHERE embedding IS NULL AND ...;
```

### 함수 / 뷰

| 객체 | 용도 |
|---|---|
| `bulk_update_product_embeddings(jsonb)` RPC | 배치 스크립트가 호출하는 bulk upsert |
| `set_hnsw_ef_search(int)` 함수 | 런타임 ef_search 튜닝 (recall ↔ latency) |
| `product_embedding_coverage` 뷰 | 플랫폼별 `pct_embedded` 모니터링 |

---

## v5 풀배치 인프라

> 풀배치 미실행 — 현재까지 테스트만 진행. 81k 풀 인코딩 시점은 v5 재설계와 함께 결정.

### 인프라 패턴 (작성됨)

| 파일 | 역할 |
|---|---|
| `scripts/aws/embed_products.py` | EC2에서 실행: Supabase 페이지네이션 + ThreadPool 병렬 다운로드 + GPU 배치 인코딩 + bulk RPC upsert |
| `scripts/aws/launch_embed_batch.sh` | 로컬 런처: SG/Key 확인 → user-data 합성 → `aws ec2 run-instances --spot` |

### 인스턴스 사양

- 타입: `g5.xlarge` (A10G 24GB)
- 마켓: Spot (one-time)
- 리전: `ap-northeast-2`
- AMI: Deep Learning AMI GPU PyTorch 2.x
- Root EBS: 50GB gp3
- IAM: 없음 (시크릿은 user-data 주입)
- Shutdown behavior: **terminate** — `shutdown -h now` 로 자동 삭제

### Self-terminate 패턴

user-data 끝에 항상 `shutdown -h now`. 크래시해도 5분 후 강제 종료 (비용 leak 방지 + 디버그 창).

### 비용 추정

- 81k 인코딩 1회: g5.xlarge Spot ~$0.40/hr × 1시간 = **~$0.40**
- 35k SAM-2 (선택): ~1.5시간 = ~$0.60
- 증분(주 1회): ~10분 = ~$0.07

상세 사양: `docs/plans/26-04-24-aws-embedding-infra.md`

---

## v5 미작성 (재설계 대상)

| 항목 | 현황 |
|---|---|
| `/api/search-products` v5 분기 (dense + sparse + RRF 통합 쿼리) | ⬜ |
| 피처 플래그 `SEARCH_ENGINE_VERSION` 환경변수 | ✅ (SPEC-SEARCH-UNIFY-001, 2026-05-17) — `SearchEngine` port 뒤 active 엔진 선택. 미설정 ⇒ `v5-direct` (현 동작 불변). [§ SearchEngine port](#searchengine-port-spec-search-unify-001) 참조 |
| 어드민 검색 디버거 v4/v5 토글 | ⬜ |
| `product_ai_analysis` 드랍 마이그레이션 | ⬜ (v5 검증 후) |
| Grounded-SAM-2 garment 세그멘테이션 (다중 아이템 사진 대응) | ⬜ |
| 쿼리 시점 LLM 앙상블 (intent + 자연어 설명 → 2× embedding 평균) | ⬜ |

---

## SearchEngine port (SPEC-SEARCH-UNIFY-001)

> 2026-05-17. 검색 엔진을 **버전 스왑 가능**하게 만든 교차 SPEC. **스코어링 재작성이 아니다** — `find/search` 가 구체 엔진이 아닌 port 를 호출하도록 한 호출 간접화 + 실패 안전망.

### 토폴로지

```
/api/find/search  (입력검증·handle→brand resolution·imageUrl&AI_SERVER_URL gate·HTTP 엔벨로프는 route 에 잔류)
   └─ selectEngine(SEARCH_ENGINE_VERSION).search(req)        ← 유일한 엔진 호출 지점
        ├─ unset / 미인식  ⇒ v5-direct : v5 어댑터 단독 (breaker X, v4 X)  ← 기본 = 현 동작 불변
        ├─ "v5"            ⇒ CircuitBreaker(v5, lazy v4-degraded fallback)
        ├─ "v4"            ⇒ v4 degraded fallback (lazy, 강제)
        └─ "v6"            ⇒ v6 드롭인 SEAM 스텁 (실 v6 는 스코프 외 — 사용자 별도 개발)
```

### 핵심 파일 (`src/domains/search/`)

| 파일 | 역할 |
|---|---|
| `engine-port.ts` | `SearchEngine` 인터페이스 + `RecommendRequest`/`RecommendResponse` DTO + `resolveEngineVersion()`. DTO shape 은 ai `/recommend` 추론 계약 정합 (app-side observed; ai repo 미확인 — SPEC-ARCH-AI-001 REQ-AI-005 가 실 DTO 소유) |
| `registry.ts` | `selectEngine()` — 버전→엔진 등록 지점. **v6 드롭인 = 여기 분기 1개 + env 1개, route caller diff 0** (REQ-SU-006) |
| `adapters/v5-adapter.ts` | active. `callAIServer`+`toSearchProduct`+strong/general 그룹핑 — route.ts 에서 **verbatim 추출**. v5 성공 엔벨로프 byte-identical (PRESERVE 1 게이트) |
| `adapters/v4-fallback-adapter.ts` | degraded. `domains/search-v4` `searchByEnums` raw RPC 만 사용 (scorer/ranker 재유지보수 X — REQ-SU-007). `engine:"v4-degraded"`. **lazy import** (supabase 결합 — 기본 경로 로드 그래프 제외) |
| `adapters/v6-adapter.ts` | v6 드롭인 SEAM **스텁** — 실 v6 아님. 실 v6 착륙 시 이 파일 body 만 교체, 동일 인터페이스·동일 registry 키·route 변경 0 |
| `circuit-breaker.ts` | closed/open/half-open 상태머신. `CB_*` env. `CB_ENABLED=false` ⇒ breaker bypass = 순수 v5-direct (무중단 롤백 레버) |

### 상태머신 (REQ-SU-005)

- **closed** → v5 호출. 성공 ⇒ 실패 카운트 reset. 실패/throw ⇒ 카운트++; `CB_FAILURE_THRESHOLD` 초과 ⇒ **open** + v4 degraded
- **open** → v5 미호출, v4 degraded 직행. `CB_COOLDOWN_MS` 경과 ⇒ 다음 호출에서 **half-open**
- **half-open** → v5 1회 probe. 성공 ⇒ **close** / 실패 ⇒ **재open** + v4 degraded

### 롤백 / 안전

- `SEARCH_ENGINE_VERSION` 미설정 = 기본 `v5-direct` = breaker·v4 둘 다 미개입 = **#57 현 실상과 byte-identical** (v5 성공 200 / v5 실패 502 `AI_SERVER_FAILED`). 단일 env 토글 즉시 원복.
- `CB_ENABLED=false` ⇒ "v5" 선택 시에도 breaker bypass (순수 v5 pass-through).
- v5 정상 경로 결과/화면/`engine:"v5"` 응답 형태 **불변** (HARD) — port 도입은 호출 간접화일 뿐.

### v6 forward-compat seam

실 v6 는 본 SPEC 스코프 외 (사용자 별도 능동 개발 — 차단/리팩터 금지). v6 드롭인 절차: `adapters/v6-adapter.ts` body 를 실 엔진으로 교체 → `registry.ts` 의 `"v6"` 분기는 그대로 → `SEARCH_ENGINE_VERSION=v6`. **`find/search` (및 모든 app caller) diff 0** (REQ-SU-006 1급 기준, 자동 테스트로 증명: `src/__tests__/search-unify-001/registry-and-forward-compat.test.ts`).

### 특성화 게이트

- `src/__characterization__/search-unify-001/find-search-route.test.ts` (13) — find/search HTTP 엔벨로프 + v5 성공 byte-shape + 502 + QUIRK. **port 도입 후 변경 0 으로 GREEN 유지** = byte-identity 증명.
- `src/__characterization__/search-unify-001/search-v4-shape.test.ts` (9) — `searchByEnums` 시그니처/결과 형태 (v4 fallback 어댑터가 재현할 계약).
- `src/__tests__/search-unify-001/` (14) — breaker 상태 전이 + registry 선택 + v6 forward-compat (신규 동작 테스트, 특성화 아님).

---


## 핵심 파일

> SPEC-ARCH-APP-001 (2026-05-17) 후 아래 `src/lib/...` 경로는 **re-export shim** — 실체는 `src/shared/{enums,utils}/`. 신규 코드는 실체 경로 직접 참조.

| 파일 | 설명 |
|---|---|
| `src/domains/search-v4/` | **v4 엔진 본체** (engine/scorer/ranker/query-builder/constants/types) |
| `src/app/api/search-products/route.ts` | 207 LOC thin 핸들러 → `domains/search-v4` 위임 (구 ~870 LOC 본체) |
| `src/lib/search/locked-filter.ts` | shim → `src/shared/utils/locked-filter` (`passesLockedFilter` + `toleranceToTargetCount`) |
| `src/lib/enums/product-enums.ts` | enum 정의 + validation + `buildEnumReference()` |
| `src/lib/enums/korean-vocab.ts` | 한국어 → enum 매핑 (115+) |
| `src/lib/enums/color-adjacency.ts` | 16색 인접 |
| `src/lib/enums/style-adjacency.ts` | 15 스타일 노드 gradient |
| `src/lib/enums/season-pattern.ts` | season(5) + pattern(10) |
| `src/lib/enums/enum-display-ko.ts` | enum → 한글 디스플레이 (`toKo()`) |
| ~~`src/lib/fashion-genome.ts`~~ | **deprecated (SPEC-NODE-REDESIGN-001, 2026-05-13)** — STYLE_NODES → `style_nodes` DB 이전. SENSITIVITY_TAGS + legacy 의존성만 임시 유지. 새 코드는 `src/lib/style-nodes-db.ts` 사용 |
| `src/lib/style-nodes-db.ts` | DB-managed style node taxonomy fetch — `fetchActiveStyleNodes()` / `buildNodeReference()` / `getActiveNodeCodes()` (5 min cache + in-flight dedup) |
| `scripts/eval-search.ts` | 골든셋 기반 자동 평가 |
| `scripts/aws/embed_products.py` | v5 임베딩 배치 |
| `scripts/aws/launch_embed_batch.sh` | EC2 Spot 런처 |

## 관련 문서

- `docs/plans/26-04-23-embedding-rewrite-plan.md` — v5 plan v1 (reference)
- `docs/plans/26-04-24-aws-embedding-infra.md` — AWS 인프라 스펙
- `docs/research/26-04-12-search-engine-differentiation-research.md` — 차별화 연구

---

## Brand Multimodal Embedding (SPEC-BRAND-EMBED-001, 2026-05-15)

v6 검색의 Stage 4 brand 후보 좁힘 (style_node + adjacency 확장) 의존 인프라. **검색 엔진 자체는 아직 호출 안 함** — SPEC-SEARCH-V6 가 통합 시점.

**파이프라인** (`scripts/refresh_brand_embeddings_all.sh` 한 번에):

```
crawler: brand 분류 (primary_style_node_id + representative_image_urls 5장)
         │
         ▼
embed_brand_multimodal.py
         │  Marqo/marqo-fashionSigLIP image×5 + text chunks → mean → L2 norm
         ▼
brand_multimodal_embeddings (768 halfvec, HNSW)
         │
         ▼ build_node_centroids.py (--min-members 5)
node_centroids (per style_node centroid)
         │
         ▼ build_adjacency_from_centroids.py (--apply --mode top-k --k 5)
style_node_adjacency.source='embedding_derived' (manual override 보존)
         │
         ▼ build_brand_umap.py
brand_multimodal_umap (admin /admin/brand-clusters 시각화)
```

**현재 상태** (2026-05-15): 11 brand 임베딩 + 8 centroid (member=1~3). crawler bulk 완료 시 같은 스크립트로 ~700 brand 채워짐 (idempotent). adjacency `--apply` 는 threshold 결정 필요 → 데이터 차고 분포 보고 결정 (mode threshold / top-k / percentile 셋 중).

**Helper**: `findSimilarBrands(brandId, k)` (RPC `find_similar_brands`, admin endpoint `/api/admin/brand/[id]/similar`).

**검색 통합 시점**: SPEC-SEARCH-V6 가 Stage 4 hard filter (현재 brandFilter) 를 `style_node + adjacency 1-hop` 으로 확장하면서 같이 통합. 그 SPEC 가 진입 전까지 검색 엔진 본체 변경 없음.

**운영 가이드**: [features/brand-embed.md](brand-embed.md)

---

## Evaluation Infrastructure (v6-EVAL — 드랍됨, 2026-05-13)

> ⚠️ **Migration 048 (2026-05-13) 로 드랍 완료.** eval_golden_queries / eval_golden_set / eval_judgments / eval_runs 4 테이블 + 관련 API 7개 + `src/lib/eval/` 전체 삭제. `eval_reviews` (114 rows) 만 유지. v6 평가 재설계 시 새 SPEC 에서 재구성 예정.

유지되는 것:
- `eval_reviews` 테이블 (migration 013) — 어드민 평가 대기열 직접 사용
- `/admin/eval` — queue-only 단일 탭으로 단순화

삭제된 것:
- DB: `eval_golden_queries`, `eval_golden_set`, `eval_judgments`, `eval_runs` (migration 033) + `prevent_frozen_v4_baseline_overwrite` 트리거/함수
- API: `/api/admin/eval/{compute, freeze-baseline, golden-queries, golden-set, judgments/[id], run, runs}` 7개 디렉토리
- Lib: `src/lib/eval/` (ndcg.ts / precision.ts / judgment-store.ts / run-snapshot.ts)
- UI: eval-golden-queries / eval-golden-set / eval-labeling-form / eval-runs-dashboard 컴포넌트

SPEC: SPEC-V6-EVAL (완료 → 드랍), SPEC-V6-EVAL-V2 (완료 → 드랍)
