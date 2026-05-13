# SPEC-SEARCH-V6-001 — Search RPC 재작성 (Hard Filter + Brand Ranking)

**Status**: Draft
**Created**: 2026-05-13
**Depends on**: SPEC-NODE-REDESIGN-001, SPEC-PROMPT-REGISTRY-001, SPEC-BRAND-NODE-001, SPEC-BRAND-EMBED-001
**Blocks**: 없음 (마지막)

---

## 1. 문제

현재 `/api/search-products` 는 80k product 전체에 대해 가중 합산 스코어링 → **느리고, style_node noise 큼**.

**정량 근거:**
- style_node weight 0.30 + 0.15 (Haiku 합의 ~70% 가정) → effective signal ≈ 0.21
- VLM 합의 28% 곱하면 → effective signal ≈ 0.09 (실제로는 그보다 낮을 가능성)
- 같은 brand 의 archive line product 가 mainline 과 다른 mood 인데 한 node 로 묶임 → ranking bias

**현재 가중치 체계 (정리):**
```
subcategory, nameMatch, keywords (text)
+ colorFamily 0.20, colorAdjacent 0.10
+ stylePrimary 0.30, styleSecondary 0.15  ← 28% 노이즈
+ fit 0.15, fabric 0.15, season 0.15, pattern 0.15
+ moodTagsMax 0.15  ← redundant (SPEC-NODE-REDESIGN)
+ brandDna 0.20
```

→ Hard filter 없이 전부 weighted. 80k 다 돌려야 함.

---

## 2. 목표

1. **Hard filter chain**: Vision → node → category → 후보 좁힘 (80k → ~500).
2. **Brand-first ranking**: hard filter 안에서 brand DNA (secondary_node + embedding) 가 1차 정렬.
3. **Product 가중**: brand 후 product-level color/fit/keywords 만으로 정밀 정렬.
4. **속도**: 평균 검색 latency 가 현재 P90 대비 절반 이하.
5. **확장**: 사용자 대화 중 "다른 브랜드 보여줘" 요청 시 adjacent node 추가하는 명시적 API.

---

## 3. Acceptance Criteria

- **AC-001**: `/api/search-products` 가 Vision 출력 (target_node + mood_summary + items) → hard filter chain 적용.
- **AC-002**: hard filter chain: ① same node + adjacency(weight≥0.7) 의 brand 집합 → ② category match 의 products → ③ optional brand 필터.
- **AC-003**: hard filter 후 후보 product 가 0건이면 자동으로 1-hop adjacency 확장 (weight≥0.5 까지).
- **AC-004**: Ranking score = `brandScore (0.40) + productScore (0.60)`. 둘 다 내부 컴포넌트 가중 합산.
- **AC-005**: `brandScore` = 0.5 × secondary_match + 0.5 × brand_embed_cosine_to_user_image. brand-level 감도 매칭 신호.
- **AC-006**: `productScore` = colorScore + fitScore + keywordsScore + fabricScore (구체 weight 는 P3 에서 튜닝).
- **AC-007**: `moodTagsScore` 제거 (weight=0). Vision /analyze 가 mood 출력해도 검색 ranking 영향 없음.
- **AC-008**: `style_node` weight 제거 (이미 hard filter). 코드에서 stylePrimary / styleSecondary 가중 합산 제거.
- **AC-009**: 검색 P90 latency 가 현재 대비 ≥50% 감소.
- **AC-010**: 사용자가 "다른 브랜드 더 보여줘" 요청 시 `expand_adjacency=true` flag → adjacency weight 임계 0.7 → 0.5 로 낮춰 재검색.
- **AC-011**: Tie-breaker — 같은 totalScore 의 경우 `products.created_at` desc (신상품 우선).
- **AC-012**: Cold-start brand (primary_node IS NULL) 의 product 는 hard filter 단계에서 완전 제외. review queue 처리 후 재포함.

---

## 4. Search Flow (재작성)

```
사용자 IG 사진
   ↓
Vision /analyze (SPEC-PROMPT-REGISTRY 의 'vision-analyze')
   ↓
출력: { target_node: "D", target_secondary: "A-3", items: [...], mood_summary }
   ↓
/api/search-products (SPEC-SEARCH-V6)
   ↓
┌─ Phase 1: Brand 후보 좁힘 (hard filter) ──────────────────────┐
│   target_node = "D"                                          │
│   adjacent = SELECT to_id FROM style_node_adjacency           │
│              WHERE from_id="D" AND weight≥0.7                 │
│            → ["C", "A-3", "H"] (예시)                         │
│   eligible_nodes = ["D", "C", "A-3", "H"]                     │
│                                                              │
│   brands_in_scope = SELECT id FROM brands                    │
│                    WHERE primary_node = ANY(eligible_nodes)   │
└──────────────────────────────────────────────────────────────┘
   ↓ ~50-150 brand
┌─ Phase 2: Product 후보 (hard filter) ────────────────────────┐
│   for each item in Vision items:                             │
│     SELECT p.* FROM products p                               │
│     WHERE p.brand_id IN (brands_in_scope)                    │
│       AND p.category = item.category                         │
│       AND p.in_stock = true                                  │
│   → ~300-1000 product 후보                                   │
└──────────────────────────────────────────────────────────────┘
   ↓
┌─ Phase 3: brandScore (brand 감도 매칭) ────────────────────────┐
│   for each candidate p:                                       │
│     brand = brands.find(p.brand_id)                           │
│     secondary_match = (brand.secondary_node == target_secondary) ? 1.0 : 0.5 if adjacent else 0 │
│     embed_sim = cosine(brand.vector, user_image_vector)       │
│     brandScore = 0.5 × secondary_match + 0.5 × embed_sim      │
└───────────────────────────────────────────────────────────────┘
   ↓
┌─ Phase 4: productScore (상품 spec 매칭) ───────────────────────┐
│   for each candidate p (with PAI):                            │
│     colorScore    = 0.25 × color_match (family + adjacent)    │
│     fitScore      = 0.15 × fit_match                          │
│     keywordsScore = 0.20 × keyword_overlap                    │
│     fabricScore   = 0.10 × fabric_match                       │
│     productScore = sum of above                               │
└───────────────────────────────────────────────────────────────┘
   ↓
┌─ Phase 5: Total + tie-break ──────────────────────────────────┐
│   totalScore = 0.40 × brandScore + 0.60 × productScore        │
│   ORDER BY totalScore DESC, products.created_at DESC          │
└───────────────────────────────────────────────────────────────┘
   ↓
top N (default 20) 반환
```

---

## 5. 새 Weight Table

```ts
const WEIGHTS_V6 = {
  // 최상위 — brand vs product 2-tier
  brand:   0.40,
  product: 0.60,

  // brandScore 내부
  brandSecondary: 0.5,   // brand.secondary_node == user target secondary?
  brandEmbedSim:  0.5,   // brand vector ↔ user image vector cosine

  // productScore 내부
  colorFamily:   0.25,
  fit:           0.15,
  keywordsEach:  0.05,
  keywordsMax:   4,      // up to 0.20
  fabric:        0.10,

  // 제거:
  //  stylePrimary, styleSecondary, season, pattern, moodTagsEach
  //  (style 은 hard filter 됨, season/pattern/mood 는 noise 큼)
} as const
```

**근거**: brand 가 hard filter 안에서 1차 정렬 (감도), 그 안에서 색상 → 핏 → 키워드 → 소재 순 (스펙). 검색 사용자 의도는 대부분 "이런 감도 브랜드 + 이 색/핏" 으로 분해 가능.

---

## 6. Score 계산 상세

### 6.1 brandScore (0~1 정규화)

```
brandScore = 0.5 × secondary_match + 0.5 × embed_similarity
```

**secondary_match (0 / 0.5 / 1.0)**

| 조건 | 점수 |
|---|---|
| `brand.secondary_node == target_secondary` | 1.0 |
| `brand.secondary_node ∈ adjacency_of(target_secondary)` (weight ≥ 0.7) | 0.5 |
| 그 외 | 0.0 |

**embed_similarity (0~1)**

```
v_user  = embed(user_uploaded_image)           # 768-dim
v_brand = brand.vector                          # SPEC-BRAND-EMBED 의 5장 평균
sim     = cosine(v_user, v_brand)               # -1~1
embed_similarity = max(0, sim)                  # 0~1 클램프
```

**왜 50:50 인가**
- `secondary_match` = discrete (enum-level identity)
- `embed_similarity` = continuous (visual vibe-level)
- 서로 다른 차원의 신호 → 한쪽 치우치면 한 차원 누락 위험
- 50:50 = 정체성 + vibe 균등. A/B 로 60/40 등 튜닝 여지.

### 6.2 productScore (0~1 정규화)

```
productScore_raw = 0.25 × color + 0.15 × fit + 0.20 × keywords + 0.10 × fabric
                 → 0~0.70 (만점)

productScore = productScore_raw / 0.70           # 0~1 정규화
```

**각 컴포넌트**

| 신호 | 만점 | 산출 |
|---|---|---|
| `colorScore` | 0.25 | family 정확 일치 1.0 / adjacent 0.5 / else 0 × 0.25 |
| `fitScore` | 0.15 | exact match 1.0 / else 0 × 0.15 |
| `keywordsScore` | 0.20 | min(overlap_count, 4) × 0.05 |
| `fabricScore` | 0.10 | exact match 1.0 / else 0 × 0.10 |

**왜 색상 > 키워드 > 핏 > 소재**

사용자 검색 의도의 자연스러운 분해 비율:
- 색상 (0.25) — 가장 visual, "검은 거 줘" 직접 발화
- 키워드 (0.20) — "편안한 / 따뜻한" 다축 추상 신호
- 핏 (0.15) — 실루엣 핵심, 직접 발화 빈도 낮음
- 소재 (0.10) — 부가 정보

→ 운영 후 클릭율로 튜닝.

### 6.3 totalScore

```
totalScore = 0.40 × brandScore + 0.60 × productScore
ORDER BY totalScore DESC, products.created_at DESC
LIMIT 20
```

**왜 brand 0.40 / product 0.60**

핵심: **hard filter 후 brand 변별력이 약해짐**

| Stage | 변별력 |
|---|---|
| Hard filter (Phase 1-2) | 통과한 brand 는 이미 "감도 OK" → 미세한 차등만 가능 |
| Product 단계 (Phase 4) | 같은 brand 안에서도 색상/핏/키워드 다양 → 변별력 큼 |

→ brand 0.40 / product 0.60 = "정체성은 1차 통과 기준, 추천 변별은 product 스펙이 주도".

50/50 도 가능 — A/B 검증 후 결정 (AC-006 P3).

### 6.4 Vision 출력 vs Ranking 사용 매트릭스

Vision 은 13축 모두 추출하지만 ranking 에 쓰이는 것과 그렇지 않은 것 분리:

| 분류 | 필드 | ranking |
|---|---|---|
| **Ranking 사용** | style_node primary/secondary, category, sub-category, color, fit, keywords, fabric | ✅ |
| **Audit only** | season, pattern, neckline, sleeve, length, closure, texture, decoration, silhouette, formality | ⏸️ (weight 0) |

→ Vision prompt 는 13축 다 추출 (해석성 + 향후 확장 여지), 코드는 ✅ 만 사용.

---

## 7. 구현 단계

**P1**: 새 RPC `/api/search-products-v6` 신설 (기존 v5 와 병행)
- A/B flag 로 두 버전 동시 운영
- 분기 트래픽 10% → 50% → 100%

**P2**: Hard filter chain 구현
- Phase 1: brand_in_scope SQL
- Phase 2: product candidates SQL
- 0건 fallback 처리

**P3**: Ranking 함수
- brandScore = 0.5 × secondary_match + 0.5 × cosine(brand_vector, user_image_vector)
- productScore = (0.25 × color + 0.15 × fit + 0.20 × keywords + 0.10 × fabric) / 0.70
- totalScore = 0.40 × brandScore + 0.60 × productScore
- ORDER BY totalScore DESC, products.created_at DESC LIMIT 20

**P4**: Expand adjacency API
- `expand_adjacency=true` → weight 임계 0.7 → 0.5 → 0.3 단계적
- 사용자 대화 중 "다른 브랜드" 요청 시 트리거

**P5**: 모니터링 + 점진 cutover
- v5 vs v6 latency / 클릭율 비교 (1주)
- v6 우월 검증 후 v5 deprecate

---

## 8. Out of Scope

- Personalization (사용자별 선호 brand) → Phase 2 백로그
- 가격 필터 / 사이즈 필터 통합 (현재 별도)
- Multi-item outfit matching 알고리즘 변경 (현재 그대로)

---

## 9. Risks

| Risk | 완화 |
|---|---|
| Hard filter 너무 좁아 결과 0건 자주 발생 | Adjacency 자동 확장 (AC-003). expand_adjacency API 명시 |
| Brand 가 primary_node 미배정인 경우 검색 제외됨 (AC-012) | review queue brand 는 SPEC-BRAND-NODE 의 admin UI 로 빠르게 배정 후 자동 포함. 신규 brand 는 크롤 직후 cron job 으로 배정 트리거 |
| v5 → v6 transition 시 검색 품질 저하 | A/B flag + 점진 cutover (P5). 클릭율 비교 |
| Brand centroid 가 brand 적은 node 에서 unstable | SPEC-BRAND-EMBED 의 member_count 확인. 검색 시 weight 감쇠 |
| Vision 의 target_node 출력이 v7 enum 과 안 맞음 | SPEC-PROMPT-REGISTRY 의 vision-analyze prompt 에서 style_nodes v7 fetch 필수 |
