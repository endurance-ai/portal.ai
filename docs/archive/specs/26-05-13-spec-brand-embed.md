# SPEC-BRAND-EMBED-001 — Brand Embedding 활용

**Status**: Draft
**Created**: 2026-05-13
**Depends on**: SPEC-BRAND-NODE-001
**Blocks**: SPEC-SEARCH-V6-001

---

## 1. 문제

`brand_embeddings` 테이블 (migration 037) 의 인프라만 존재, **활용 0건**.

**미구현 기능:**
- Similar-brand 추천 ("A.P.C. 좋아하면 → MM6 / Studio Nicholson")
- Node centroid 계산 (adjacency 자동 검증)
- 사용자 IG 사진 → 가장 가까운 brand 추천 (vision-image-to-brand NN)

**기회 비용:**
- 같은 node 안에서도 brand 들 사이에 미세한 거리 / 클러스터가 존재
- 임베딩 없으면 hard filter 안에서 brand-level ranking 신호 없음

---

## 2. 목표

1. **Brand vector 생성**: SPEC-BRAND-NODE 가 선정한 representative_image_urls 5장 임베딩 평균.
2. **Similar-brand API**: brand_id → top N similar brands (cosine).
3. **Node centroid**: 같은 primary_node 의 brand 들 평균 vector → node centroid table.
4. **Adjacency 자동 검증**: centroid 간 cosine → manual seed adjacency 와 비교, drift 큰 edge 알림.
5. **Vision-to-brand NN**: 사용자 IG 사진 → 임베딩 → brand vector 공간에서 nearest.

---

## 3. Acceptance Criteria

- **AC-001**: SPEC-BRAND-NODE-001 으로 배정된 모든 brand 에 대해 `brand_embeddings` 테이블에 row 1개 (vector NOT NULL).
- **AC-002**: `findSimilarBrands(brand_id, limit=10)` 함수가 cosine 거리순 brand list 반환.
- **AC-003**: `node_centroids` 테이블이 active node 마다 row 1개 보유 (vector + member_count).
- **AC-004**: `findNearestBrandByImage(image_url)` 함수가 image 임베딩 → brand top N 반환.
- **AC-005**: `validateAdjacency()` 함수가 centroid 거리와 manual adjacency 비교 → 차이 > 0.3 인 edge list 반환.
- **AC-006**: Brand vector 재생성 시 idempotent (representative_image_urls 변경 시만 trigger).
- **AC-007**: Admin UI 에 brand-cluster 시각화 (UMAP/t-SNE 2D 투영) 페이지.

---

## 4. Schema

```sql
-- 054_node_centroids.sql
CREATE TABLE node_centroids (
  node_id       text PRIMARY KEY REFERENCES style_nodes(id) ON DELETE CASCADE,
  vector        halfvec(768) NOT NULL,
  member_count  integer NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- brand_embeddings (migration 037 기존) 활용 — schema 변경 없음
-- 단, computation strategy 컬럼 추가
ALTER TABLE brand_embeddings ADD COLUMN IF NOT EXISTS source_image_count integer;
ALTER TABLE brand_embeddings ADD COLUMN IF NOT EXISTS strategy text DEFAULT 'mean_of_5';
```

---

## 5. 임베딩 전략

### 5.1 모델 선택

기존 v5 임베딩 인프라 사용 — pgvector + CLIP-based or DINOv2-based 768-dim.

**구체 모델 (확정 안 됨)**: 다음 옵션 중 1 — Phase 1 에서 결정
- OpenCLIP ViT-L/14 (대중적, 768-dim)
- DINOv2 ViT-B/14 (768-dim, 자기지도 학습)
- Bedrock multimodal embedding (Titan/Cohere)

### 5.2 Brand vector

```python
def compute_brand_vector(brand_id: str) -> np.ndarray:
    urls = pg.select("brands", {"id": brand_id})[0]["representative_image_urls"]
    vectors = [embed_image(url) for url in urls]
    return np.mean(vectors, axis=0)  # 5장 평균 → brand vector
```

### 5.3 Node centroid

```python
def compute_node_centroid(node_id: str) -> tuple[np.ndarray, int]:
    rows = pg.select("brands", {
        "primary_node": f"eq.{node_id}",
        "select": "id",
    })
    brand_ids = [r["id"] for r in rows]
    vectors = pg.select_vectors("brand_embeddings", brand_ids)
    return np.mean(vectors, axis=0), len(vectors)
```

### 5.4 Similar brand

```python
def find_similar_brands(brand_id: str, limit: int = 10) -> list[dict]:
    target = pg.select_vector("brand_embeddings", brand_id)
    # pgvector cosine search
    return pg.sql(f"""
      SELECT b.id, b.name, b.primary_node,
             1 - (e.vector <=> '{target}'::halfvec) AS similarity
      FROM brand_embeddings e
      JOIN brands b ON b.id = e.brand_id
      WHERE e.brand_id <> '{brand_id}'
      ORDER BY e.vector <=> '{target}'::halfvec
      LIMIT {limit};
    """)
```

---

## 6. 구현 단계

**P1**: 임베딩 모델 결정 + infra 확인
- 기존 v5 인프라 검토
- 모델 1개 픽 + 768-dim 확정

**P2**: brand vector backfill
- 700 brand × representative_image_urls 5장 → 임베딩
- AWS g5 spot 또는 로컬 GPU 사용 (1시간 이내)
- brand_embeddings INSERT

**P3**: node centroid 계산
- 모든 active node 에 대해 centroid 생성
- node_centroids 테이블 INSERT

**P4**: API 함수
- `findSimilarBrands(brand_id)`
- `findNearestBrandByImage(image_url)`
- `validateAdjacency()` — drift report

**P5**: Admin UI
- `/admin/brand-clusters` — UMAP/t-SNE 2D plot (Python jupyter 또는 frontend visx)
- node 별 brand 리스트 + 가장 먼 brand 표시 (outlier 감지)

**P6**: Adjacency 검증
- centroid 거리 vs manual seed adjacency 비교
- drift 큰 edge 보고 → founder 수동 조정

---

## 7. Out of Scope

- Product-level 임베딩 (이미 v5 infra 존재, 별도)
- Vision /analyze 의 사용자 사진 → brand NN 실제 검색 통합 → SPEC-SEARCH-V6
- Brand 가 다중 라인을 가질 때 multi-centroid 처리

---

## 8. Risks

| Risk | 완화 |
|---|---|
| 5장 평균이 multi-line brand 정체성 왜곡 | secondary_node 컬럼 + future multi-centroid 백로그 |
| 임베딩 모델 선택 잘못 → cluster 미형성 | v5 인프라가 이미 검증된 모델이라 안전. Phase 1 에서 sample 30 brand 로 sanity check |
| Centroid 가 brand 적은 node (예: 5 brand 미만) 에서 unstable | member_count 컬럼 노출, 검색에서 confidence 가중 |
| pgvector index 가 768-dim halfvec 에서 느림 | HNSW index 적용, 기존 v5 에서 검증됨 |
