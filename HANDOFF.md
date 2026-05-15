# HANDOFF — SPEC-SEARCH-V6 마무리

> 작성: 2026-05-15 · 다음 세션 재개용
> 전제: 이전 세션의 admin reskin + migration 067 은 `/feature-finalize --merge` 로 **dev 머지 완료된 상태**.
> 핵심: **Q1 (brand vector input) 결정 → 그 후 자동 진행**.

```
[프롬프트 고르기]

패턴 A — Q1 = B (product 평균, 추천) 로 결정한 경우

HANDOFF.md 읽고 SPEC-SEARCH-V6 진행해.

Q1 결정: B (products.embedding 평균 → L2-norm → brand_multimodal_embeddings).
Q3 는 adjacency dry-report 분포 보고 그때 결정할게.

순서: brand 풀배치 → centroid → adjacency dry-report (분포 보여줘) →
내가 Q3 mode 결정 → apply → SPEC 5 P1~P5 진행.
P3 이전에 각 phase 끝날 때마다 검증 결과 보여주고 진행해.

패턴 B — Q1 = A 또는 C 로 결정한 경우

HANDOFF.md 읽고 SPEC-SEARCH-V6 진행해.

Q1 결정: [A 또는 C].
Q2 attributes 풍부화: [필요함 / 안 함].

embed_brand_multimodal.py 의 brand_keywords(drop됨) 잔존 코드 먼저 정리하고
attributes only input 으로 수정해서 풀배치. 그 후 centroid → adjacency
dry-report → 내가 Q3 결정 → SPEC 5 P1~P5.

패턴 C — 아직 Q1 못 정함, 같이 분석하고 싶을 때

HANDOFF.md + docs/research/26-05-15-embedding-study-roadmap.md 읽어.
Q1 (brand vector input B/A/C) 을 우리 데이터로 실증 비교하고 싶어.
샘플 30 brand 로 B 방식 / A 방식 cosine 분포 + similar-brand 결과를
나란히 뽑아서 비교해줘. 그거 보고 Q1 결정할게.
```

---

## 0. 30초 요약

- 검색 v6 재설계 5 SPEC 중 4개 완료 (#49~#55 머지). 다음 = **SPEC-SEARCH-V6-001** 본문 코드.
- crawler bulk 분류 **1300+/2072 완료** (primary/secondary_style_node_id).
- product 임베딩 **이미 71,441/78,785 (91%) 풀배치 완료** (Marqo/marqo-fashionSigLIP, 768-dim, L2-norm).
- brand_nodes 슬림화 (067) + admin reskin = dev 머지됨. brand_multimodal_embeddings 테이블/RPC 인프라 존재.
- **Q1 결정 대기**: brand multimodal vector 를 무엇으로 만들까. 사용자가 학습 후 결정 (`docs/research/26-05-15-embedding-study-roadmap.md`).

---

## 1. SPEC-SEARCH-V6-001 — 본 작업

- SPEC doc: `docs/plans/26-05-13-spec-search-v6.md`
- 설계 9 step 시각화: `docs/_tmp/26-05-13-v6-score-calculation.html`
- 운영 가이드: `docs/features/brand-embed.md`

### Step ↔ 현재 상태
| Step | 내용 | 인프라 | 데이터 | 코드 |
|---|---|---|---|---|
| 1 | input (IG/Pinterest/업로드/텍스트) | IG 만 ✅ | — | Pinterest/업로드/텍스트 = Q4 (SPEC 6 별도) |
| 2 | Apify → R2 1장 | ✅ | ✅ 운영 | ✅ |
| 3 | Vision 13축 추출 | ✅ vision-analyze prompt | ✅ | ✅ |
| 4 | style_node + adjacency soft filter (weight≥0.7) | ✅ style_nodes + adjacency 빈 테이블 | ⬜ adjacency 0 edge | ⬜ |
| 5 | category hard filter | ✅ products.category | ✅ | ⬜ |
| 6 | brandScore = 0.5·secondary_match + 0.5·cosine(brand_vec, user_img) | ✅ brand_multimodal_embeddings + find_similar_brands RPC | ⬜ brand 풀배치 (11/2072) | ⬜ |
| 7 | productScore = 0.25c + 0.15fit + 0.20kw + 0.10fab | ✅ PAI v6 axis 컬럼 (045) | ⚠️ 백필 일부 | ⬜ |
| 8 | totalScore = 0.40·brand + 0.60·product, tie=created_at desc | — | — | ⬜ |
| 9 | expand_adjacency (0.7→0.5→0.3) | ✅ flag 인프라 | — | ⬜ |

---

## 2. 🔴 결정 대기

### Q1 (가장 critical) — brand multimodal vector input
사용자 학습 후 결정 (`docs/research/26-05-15-embedding-study-roadmap.md` 3시간 커리큘럼).

| 옵션 | 정의 | 특징 |
|---|---|---|
| **B** | `AVG(products.embedding WHERE brand_node_id=X)` → L2-norm | products 91% 임베딩됨 → 비용 0, robust. generic 수렴 위험 |
| **A** | representative 1~10장 + attributes text chunk 평균 | 큐레이션 sharp. sparse noise |
| **C** | `0.4×B + 0.6×A` hybrid | 중간 |

→ 추천 **B** (단순+robust+무료, products 와 동일 FashionSigLIP 공간 → user_image cosine 즉시 동작).

### Q2 (A/C 선택 시만) attributes 풍부화
- (a) fill_brand_meta.py SYSTEM_PROMPT 수정 — vibe/silhouette/palette/material/detail 강제 채움 (~$5)
- (b) 안 함 (현재 sparse 유지)

### Q3 adjacency 채움 mode (Step 4 입력)
- dry-report 분포 보고 결정: threshold (cosine≥X) / top-k (K이웃) / percentile
- SPEC 5 가 weight≥0.7 기본 사용 → 그 분포 맞는 mode 선택

### Q4 Step 1 채널 확장 (Pinterest/업로드/텍스트)
- 추천 (b): SPEC 6 별도. SPEC 5 는 핵심 검색 알고리즘 집중

### Q5 user_image 임베딩 경로
- **확정 (a)**: AI 서버 Modal `/embed` 호출. 현재 `/api/find/search` 흐름 활용. FashionSigLIP 동일 공간

---

## 3. Q1 결정 후 진행 순서

1. **Q1 결정** (B/A/C)
2. **brand multimodal 풀배치**:
   - B: SQL/Python `AVG(products.embedding) GROUP BY brand_node_id` → L2-norm → brand_multimodal_embeddings UPSERT (5분, $0). pgvector AVG 후 정규화는 Python numpy 권장 (halfvec 캐스팅 + L2-norm 수동)
   - A: `scripts/embed_brand_multimodal.py` — ⚠️ brand_keywords (067 drop) SELECT 제거 + attributes만 input 으로 코드 수정 필수. 그 후 실행 (~10분)
   - C: B + A 가중 합성
3. `scripts/build_node_centroids.py --min-members 5`
4. `scripts/build_adjacency_from_centroids.py` (dry-report) → Q3 결정 → `--apply`
5. **SPEC 5 P1**: `/api/search-products-v6` route + `SEARCH_ENGINE_VERSION` env flag (v4/v6 병행)
6. **P2**: hard filter chain — Phase 1 (style_node_adjacency 1-hop weight≥0.7 → eligible brands) + Phase 2 (products WHERE brand_node_id IN eligible AND category match AND in_stock). 0건 fallback (adjacency 0.7→0.5→0.3 자동 확장, AC-003)
7. **P3**: ranking — brandScore (secondary_match + cosine(brand_vec, user_img_vec via Modal /embed)) + productScore (color/fit/kw/fabric from product_ai_analysis) + totalScore (0.40b+0.60p, tie=created_at desc, LIMIT 20)
8. **P4**: expand_adjacency=true flag (weight 임계 0.7→0.5→0.3 단계, 이전 결과 제외)
9. **P5**: A/B (SEARCH_ENGINE_VERSION 10%→50%→100%) + admin search-debugger v4/v6 토글 + latency/클릭율 1주 비교 → v4/v5 deprecate

---

## 4. 인프라 / 데이터 현황

- dev-app EC2: `54.116.104.193`. SSH `~/Desktop/aws-infra/kikoai-key.pem`. `docker exec db psql -U postgres -d kikoai`
- brand_nodes: 2072. classified 1300+
- products: 78,785. embedding 71,441 (91%, Marqo/marqo-fashionSigLIP 768, L2-norm)
- brand_multimodal_embeddings: 11 (옛 smoke. Q1 후 풀배치 필요)
- node_centroids: 8 (member 1~3, 재계산 필요)
- style_node_adjacency: 0 edge (Q3 후 채움)
- migration 다음 번호: **068** (067 까지 적용됨)
- PostgREST schema reload: `NOTIFY pgrst, 'reload schema';` (새 컬럼/테이블 후 필수)
- find_similar_brands RPC (065), brand_multimodal_embeddings halfvec(768) HNSW (063), node_centroids (064)

---

## 5. 미해결 사이드 트랙 (SPEC 5 와 병행/후속)

- 037 자산: `brand_similar` 40k edges 테이블 살아있음 (embedding 컬럼 drop). SPEC 5 cutover 후 폐기 결정
- search-products v4 brandDna disable 상태 — v6 cutover 까지 brand boost 0 (의도된 임시)
- scripts cleanup: embed_brands_text.py / umap_brand_layout.py / register_unmatched_brands.ts / fill_brand_meta.py — 067 후 dead. SPEC 5 진입 전 정리 권장
- `scripts/embed_brand_multimodal.py` — brand_keywords (drop됨) SELECT 잔존. A/C 선택 시 반드시 수정

---

## 6. 막히면

- SPEC 5 본문: `docs/plans/26-05-13-spec-search-v6.md`
- 학습 로드맵: `docs/research/26-05-15-embedding-study-roadmap.md`
- brand-embed 운영: `docs/features/brand-embed.md`
- ARCHITECTURE: `docs/ARCHITECTURE.md` / 검색: `docs/features/search-engine.md`
