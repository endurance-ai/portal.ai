# 검색 엔진

> `POST /api/search-products` 가 단일 진입점. 메인 플로우의 Step 3에서 in-process 호출됨.
> v4(현재 운영) + v5 전환 인프라(부분 적용, 풀배치 미실행) 두 레이어가 공존.

## 한눈에

| 레이어 | 상태 | 핵심 |
|---|---|---|
| **v4** | ✅ 운영 중 | `products` ⨝ `product_ai_analysis` INNER JOIN + 10차원 가중합 + 다양성 캡 |
| **v5 인프라** | ✅ 적용 (마이그레이션 027) | `products.embedding vector(768)` + HNSW + pgroonga + bulk RPC |
| **v5 풀배치** | ⚠️ 테스트만, 81k 미실행 | `scripts/aws/embed_products.py` 단발 실행 필요 |
| **v5 검색 분기** | ⬜ 미작성 | dense + sparse + RRF 통합 쿼리 + 피처 플래그 `SEARCH_ENGINE_VERSION` |

> v5 재설계 진행 중 — 기존 plans (`docs/plans/26-04-23-embedding-rewrite-plan.md`, `docs/plans/26-04-24-aws-embedding-infra.md`) 는 reference로만, 결정 기준은 다시 잡는다.

---

## v4 (현재 운영)

`src/app/api/search-products/route.ts` (~870 LOC). 단일 POST 핸들러.

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

마이그레이션 `supabase/migrations/027_product_embeddings_and_pgroonga.sql` 가 다음을 추가:

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
| 피처 플래그 `SEARCH_ENGINE_VERSION` 환경변수 | ⬜ |
| 어드민 검색 디버거 v4/v5 토글 | ⬜ |
| `product_ai_analysis` 드랍 마이그레이션 | ⬜ (v5 검증 후) |
| Grounded-SAM-2 garment 세그멘테이션 (다중 아이템 사진 대응) | ⬜ |
| 쿼리 시점 LLM 앙상블 (intent + 자연어 설명 → 2× embedding 평균) | ⬜ |

---

## 핵심 파일

| 파일 | 설명 |
|---|---|
| `src/app/api/search-products/route.ts` | v4 검색 엔진 본체 |
| `src/lib/search/locked-filter.ts` | `passesLockedFilter` + `toleranceToTargetCount` |
| `src/lib/enums/product-enums.ts` | enum 정의 + validation + `buildEnumReference()` |
| `src/lib/enums/korean-vocab.ts` | 한국어 → enum 매핑 (115+) |
| `src/lib/enums/color-adjacency.ts` | 16색 인접 |
| `src/lib/enums/style-adjacency.ts` | 15 스타일 노드 gradient |
| `src/lib/enums/season-pattern.ts` | season(5) + pattern(10) |
| `src/lib/enums/enum-display-ko.ts` | enum → 한글 디스플레이 (`toKo()`) |
| `src/lib/fashion-genome.ts` | 스타일 노드 + 감도 태그 정의 |
| `scripts/eval-search.ts` | 골든셋 기반 자동 평가 |
| `scripts/aws/embed_products.py` | v5 임베딩 배치 |
| `scripts/aws/launch_embed_batch.sh` | EC2 Spot 런처 |

## 관련 문서

- `docs/plans/26-04-23-embedding-rewrite-plan.md` — v5 plan v1 (reference)
- `docs/plans/26-04-24-aws-embedding-infra.md` — AWS 인프라 스펙
- `docs/research/26-04-12-search-engine-differentiation-research.md` — 차별화 연구
