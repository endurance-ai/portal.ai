# Brand Multimodal Embedding (SPEC-BRAND-EMBED-001)

> Brand 마다 FashionSigLIP 768-dim 단일 multimodal vector. 시각 + 텍스트 신호 통합. similar-brand / node centroid / style_node_adjacency 자동 채움 / vision-to-brand NN 의 공통 기반.

## 한 줄 요약

```
대표이미지 1~5장 + brand 텍스트 풀 (5 chunk) → SigLIP 같은 공간 인코딩 → 평균 → L2-normalize → 768-dim
```

같은 모델/공간을 v5 product 임베딩 (027) 도 사용 → product ↔ brand cosine 즉시 가능.

## 인프라

| 항목 | 위치 |
|---|---|
| brand vector | `brand_multimodal_embeddings` (063) — halfvec(768), HNSW (halfvec_ip_ops) |
| node centroid | `node_centroids` (064) — style_node 별 평균 |
| adjacency | `style_node_adjacency` (051) — source='embedding_derived' 자동, 'manual' 보존 |
| UMAP 2D | `brand_multimodal_umap` (066) — admin 시각화 캐시 |
| RPC | `find_similar_brands(brand_id, limit)` (065) |

| 스크립트 | 역할 |
|---|---|
| `scripts/embed_brand_multimodal.py` | 분류된 brand → multimodal vector. idempotent (text/image hash) |
| `scripts/build_node_centroids.py` | brand vector → primary_style_node_id 별 centroid. `--min-members N` (기본 5) |
| `scripts/build_adjacency_from_centroids.py` | centroid pair cosine → adjacency. 4 mode (`dry-report` / `threshold` / `top-k` / `percentile`) |
| `scripts/build_brand_umap.py` | brand vector → UMAP 2D |
| `scripts/refresh_brand_embeddings_all.sh` | 위 4단계 한 번에 실행 (cron wrapper) |

| 페이지 / API | 위치 |
|---|---|
| `/admin/brand-clusters` | UMAP 2D scatter + brand 리스트 |
| `GET /api/admin/brand-clusters` | brand_multimodal_umap + style_node 매핑 |
| `GET /api/admin/brand/[id]/similar?limit=10` | findSimilarBrands |

## 운영

### 신규 brand 분류된 후 갱신
```bash
./scripts/refresh_brand_embeddings_all.sh
```
- 환경변수로 동작 조정:
  - `MIN_MEMBERS=5` — centroid 최소 멤버 수 (기본 5, 검증 시 1)
  - `ADJACENCY_MODE=top-k|threshold|percentile|dry-report` (기본 top-k)
  - `ADJACENCY_K=5` / `ADJACENCY_COSINE=0.85` / `ADJACENCY_PCT=70`
- idempotent: 기존 임베딩은 (text_hash, image_hash) 일치 시 skip. UMAP / centroid / adjacency 는 매 실행 전체 재계산

### threshold 결정 (production tuning)
1. 충분한 brand 분류 (>=100) 후 dry-report 로 분포 확인:
   ```bash
   uv run python scripts/build_adjacency_from_centroids.py
   ```
2. cosine min/median/percentile 보고 cutoff 결정
3. 권장 시작점: `--mode top-k --k 5` (그래프 차수 보장). 또는 `--mode threshold --cosine 0.85`

## 모델 메모

- **Marqo/marqo-fashionSigLIP** — vendor-published 패션 retrieval 우위 (CLIP/OpenCLIP 대비 +18%, 단 학술 peer-reviewed SOTA 는 아님)
- 768-dim, L2-normalized → HNSW `halfvec_ip_ops` 로 cosine ≡ inner product
- text encoder 77 토큰 제한 → text 풀을 5 chunk 로 분할 후 각 인코딩 → 평균 (CLIP prompt ensemble 패턴)
- text chunk 구성: `[anchor=brand_name, brand_keywords[0:8], brand_keywords[8:16], vibe+silhouette, palette+material+detail]`
- 037 BGE-m3 텍스트 임베딩과 **완전 별개 공간** (1024 vs 768, 모델 다름). 037 은 stale (옛 15 코드 풀) — SPEC 5 정리 대상

## 차원 결정 사유

| 가정한 안 | 채택 안 | 이유 |
|---|---|---|
| 별도 텍스트 임베딩 + 별도 이미지 임베딩 + late fusion | 단일 multimodal vector | clustering / similar-brand 핵심 쿼리 = brand-vs-brand. 단일 vector 가 인프라 단순 + UMAP / cosine top-K 통일 |
| brand_nodes 컬럼 추가 | 별도 테이블 | 재계산 잦음 + multi-strategy 확장 여지 + brand_nodes 슬림 |
| vendor-published SOTA 비판 → OpenCLIP | FashionSigLIP 유지 | v5 product 임베딩이 이미 같은 모델 → cross-table cosine 즉시 가능. 모델 교체 시 78,785 product 재임베딩 비용 |

## SPEC 4 AC 매핑

| AC | 구현 |
|---|---|
| AC-001 brand_embeddings row | `brand_multimodal_embeddings` (063) — 분류된 brand 모두 |
| AC-002 findSimilarBrands | `find_similar_brands` RPC (065) + `src/lib/brand-embed.ts` + admin endpoint |
| AC-003 node_centroids | (064) + `build_node_centroids.py` |
| AC-004 findNearestBrandByImage | **SPEC-SEARCH-V6 로 이관** (사용자 IG → SigLIP → brand NN, AI 서버 결합부에서 같이 구현) |
| AC-005 validateAdjacency | 보류 (manual seed 0 row, drift 측정 무의미). SPEC-SEARCH-V6 에서 manual override 운영 시작 후 |
| AC-006 idempotent 재생성 | text_hash + image_hash 비교 |
| AC-007 admin cluster 시각화 | `/admin/brand-clusters` (UMAP 2D scatter) |

## 다음 단계

1. crawler bulk → ~700 brand 분류 완료 대기
2. `./scripts/refresh_brand_embeddings_all.sh` 1회 실행 → 전체 채움
3. adjacency dry-report 분석 → production threshold 결정 → `--apply`
4. SPEC-SEARCH-V6 진입 시:
   - findNearestBrandByImage (AI 서버 endpoint)
   - validateAdjacency (manual override 시작 후)
   - Stage 4 brand 후보 좁힘에 adjacency 활용
