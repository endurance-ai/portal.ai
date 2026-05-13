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
- **AC-004**: Ranking score = `brandDnaScore (0.40) + colorScore (0.25) + fitScore (0.15) + keywordsScore (0.20)`.
- **AC-005**: `brandDnaScore` = `0.6 × secondary_match + 0.4 × brand_embed_cosine_to_centroid` (이미 hard filter 로 primary 일치).
- **AC-006**: `moodTagsScore` 제거 (weight=0). Vision /analyze 가 mood 출력해도 검색 ranking 영향 없음.
- **AC-007**: `style_node` weight 제거 (이미 hard filter). 코드에서 stylePrimary / styleSecondary 가중 합산 제거.
- **AC-008**: 검색 P90 latency 가 현재 대비 ≥50% 감소.
- **AC-009**: 사용자가 "다른 브랜드 더 보여줘" 요청 시 `expand_adjacency=true` flag → adjacency weight 임계 0.7 → 0.5 로 낮춰 재검색.

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
┌─ Phase 3: Brand DNA ranking ─────────────────────────────────┐
│   for each candidate p:                                      │
│     brand = brands.find(p.brand_id)                          │
│     secondary_match = (brand.secondary_node == target_secondary) ? 1.0 : 0.5 if adjacent else 0 │
│     centroid_sim = cosine(brand_vector, target_node_centroid) │
│     brandDnaScore = 0.40 × (0.6 × secondary_match + 0.4 × centroid_sim) │
└──────────────────────────────────────────────────────────────┘
   ↓
┌─ Phase 4: Product 가중 ────────────────────────────────────────┐
│   for each candidate p (with PAI):                            │
│     colorScore   = 0.25 × color_match (family + adjacent)     │
│     fitScore     = 0.15 × fit_match                           │
│     keywordsScore= 0.20 × keyword_overlap                     │
│   totalScore = brandDnaScore + colorScore + fitScore + keywordsScore │
└──────────────────────────────────────────────────────────────┘
   ↓
top N (default 20) 반환
```

---

## 5. 새 Weight Table

```ts
const WEIGHTS_V6 = {
  brandDnaSecondary: 0.24,   // brand secondary_node match
  brandDnaCentroid:  0.16,   // brand vector → node centroid
  colorFamily:       0.20,
  colorAdjacent:     0.05,
  fit:               0.15,
  keywordsEach:      0.05,
  keywordsMax:       4,      // up to 0.20
  // 제거:
  //  stylePrimary, styleSecondary, fabric, season, pattern, moodTagsEach
  //  (style 은 hard filter 됨, fabric/season/pattern 은 weight 0)
} as const
```

**근거**: brand 가 hard filter 안에서 1차 정렬, 그 안에서 색상 → 핏 → 키워드 순. 검색 사용자 의도는 대부분 "이런 브랜드 + 이 색 + 이 핏" 으로 분해 가능.

---

## 6. 구현 단계

**P1**: 새 RPC `/api/search-products-v6` 신설 (기존 v5 와 병행)
- A/B flag 로 두 버전 동시 운영
- 분기 트래픽 10% → 50% → 100%

**P2**: Hard filter chain 구현
- Phase 1: brand_in_scope SQL
- Phase 2: product candidates SQL
- 0건 fallback 처리

**P3**: Ranking 함수
- brandDnaScore (secondary + centroid)
- colorScore / fitScore / keywordsScore
- totalScore 합산

**P4**: Expand adjacency API
- `expand_adjacency=true` → weight 임계 0.7 → 0.5 → 0.3 단계적
- 사용자 대화 중 "다른 브랜드" 요청 시 트리거

**P5**: 모니터링 + 점진 cutover
- v5 vs v6 latency / 클릭율 비교 (1주)
- v6 우월 검증 후 v5 deprecate

---

## 7. Out of Scope

- Personalization (사용자별 선호 brand) → Phase 2 백로그
- 가격 필터 / 사이즈 필터 통합 (현재 별도)
- Multi-item outfit matching 알고리즘 변경 (현재 그대로)

---

## 8. Risks

| Risk | 완화 |
|---|---|
| Hard filter 너무 좁아 결과 0건 자주 발생 | Adjacency 자동 확장 (AC-003). expand_adjacency API 명시 |
| Brand 가 primary_node 미배정인 경우 검색 제외됨 | review queue brand 는 별도 처리 또는 fallback 노출 |
| v5 → v6 transition 시 검색 품질 저하 | A/B flag + 점진 cutover (P5). 클릭율 비교 |
| Brand centroid 가 brand 적은 node 에서 unstable | SPEC-BRAND-EMBED 의 member_count 확인. 검색 시 weight 감쇠 |
| Vision 의 target_node 출력이 v7 enum 과 안 맞음 | SPEC-PROMPT-REGISTRY 의 vision-analyze prompt 에서 style_nodes v7 fetch 필수 |
