# 검색엔진 v6 — 핸드오프

**작성일:** 2026-04-28
**작성 세션:** kikoai/ai 쪽에서 시작 → 작업 비중 확인 후 kikoai/app으로 이관
**현재 상태:** **분석 완료, 의사결정 4건 미해결, 코드 변경 0**

---

## 0. 이 문서의 목적

검색엔진 v5의 **구조적 결함**을 코드 ground truth로 확인했고, v6 방향성을 잡는 중. 작업 비중상 kikoai/ai보다 kikoai/app이 메인 무대라 세션을 이관함. 이 문서는 새 세션이 **cold start로 컨텍스트를 따라잡을 수 있게** 정리한 것.

다음 세션에서 할 일:
1. 아래 [결정 지점](#5-미해결-결정-지점) 4건을 사용자와 함께 결정
2. 결정에 따라 kikoai/app 측 변경 (Vision 프롬프트 / DB 마이그레이션 / 백필 스크립트 / 페이로드 확장)
3. kikoai/ai 측 contract 업데이트 (Pydantic 모델 + RPC 파라미터 매핑)

---

## 1. 사용자 동기

> "검색 정확도를 매우 많이 높이고 싶다. 지금 Vision이 '레귤러한 핏의 맨투맨' 정도로만 나오는데, 이걸 훨씬 상세하게 개선하고 싶다."
t
처음 가설: Vision 모델이 약하거나 프롬프트가 부족함 → 모델 업그레이드 vs 프롬프트 개선 고민.

**실제 진단 결과:** 모델·프롬프트 문제가 아니라 **파이프라인 단절** 문제. Vision은 이미 풍부하게 뽑고 있는데 검색 엔진이 90%를 버리고 있음. 자세한 내용은 §3.

---

## 2. 코드 ground truth — 현재 흐름

### 2-1. Vision 출력 (`kikoai/app/src/lib/prompts/analyze.ts:11-146`)

이미 매우 풍부한 스키마. 한 아이템당 12개 필드 + 이미지 레벨 6개 객체.

**아이템별 (배열):**
```
id, category, subcategory, name, detail (free text),
fabric, color, colorHex, colorFamily, fit,
searchQuery (en), searchQueryKo, position
```

**이미지 레벨:**
```
isApparel, styleNode {primary, secondary, confidence, reasoning},
sensitivityTags[], mood {tags[], summary, vibe, season, occasion},
palette[{hex, label}], style {fit, aesthetic, detectedGender}
```

모델은 **GPT-4o-mini** (`run-vision.ts:96`).

### 2-2. kikoai/app → kikoai/ai 전송 (`src/app/api/find/search/route.ts:142-148`)

```typescript
const commonAI = {
  item: body.item,        // 전체 item — 일부 필드만 살아남음 (§2-3)
  imageUrl,
  gender,
  styleNode,              // {primary, secondary} — confidence/reasoning 손실
  moodTags,               // mood.tags 일부
  priceFilter,
  // brandFilter, tolerance 추가
}
```

**경계에서 버려지는 것**:
- `sensitivityTags`, `palette`, `style.aesthetic`
- `mood.summary / vibe / season / occasion`
- `styleNode.confidence / reasoning`

### 2-3. kikoai/ai 진입 — Pydantic 필터링 (`kikoai/ai/app/models/request.py:13-26`)

```python
class AnalyzedItem(BaseModel):
    id: str
    category: str
    subcategory: str | None = None
    name: str | None = None
    fit: str | None = None
    fabric: str | None = None
    color_family: str | None = Field(default=None, alias="colorFamily")
    search_query: str = Field(alias="searchQuery")
    search_query_ko: str | None = Field(default=None, alias="searchQueryKo")
```

**이 시점에 또 버려지는 것**: `detail`, `color`, `colorHex`, `position`. 그리고 `RecommendRequest`는 `style_node, mood_tags`를 받지만 (§2-4 참조) **search_step에서 사용 안 함**.

### 2-4. RPC 파라미터 (`kikoai/ai/app/pipeline/search.py:24-39`)

```python
params = {
    "query_embedding": ...,      # ✅ FashionSigLIP 768d
    "query_text": searchQueryKo or searchQuery,  # ✅ 5-토큰 압축
    "brand_filter": ...,         # ✅ (옵션)
    "gender_filter": None,       # ❌ DIAG 비활성
    "subcategory_filter": None,  # ❌ DIAG 비활성
    "price_min/max": ...,        # ✅
    "tags_filter": None,         # ❌ 항상 None
    "k": 50, "rrf_k": 60,
}
```

`fit, fabric, color_family, name, category, styleNode, moodTags` **전부 RPC에 미전달.**

### 2-5. SQL — `search_products_v5` (`kikoai/app/supabase/migrations/030_search_products_v5.sql` + `031_embeddings_halfvec.sql`)

- `FROM products p` — **`product_ai_analysis` 미참조** (§3-3 참조)
- dense path: `p.embedding <=> query_embedding` (HNSW halfvec_cosine_ops)
- sparse path: `pgroonga_score` on `product_search_text(p) = brand+name+description+material+color`
- RRF: `1/(60+dense_rank) + 1/(60+sparse_rank)`
- hard filter: brand, gender, subcategory, price, tags

---

## 3. v5의 구조적 결함 3가지

### 결함 ①: kikoai/app→kikoai/ai 경계에서 손실

§2-2, §2-3 — Vision의 풍부한 출력이 두 번 깎임. `detail, color, colorHex, palette, sensitivityTags, mood 객체, styleNode 메타`가 kikoai/ai에 도달조차 못 함.

### 결함 ②: kikoai/ai 내부에서 받기만 하고 활용 안 함

`RecommendRequest`는 `styleNode, moodTags, priceFilter`까지 받지만 (`request.py:42-45`), `search.py`의 RPC 호출에는 `priceFilter`만 흐름. `styleNode/moodTags`는 **수신 후 버려짐**.

### 결함 ③: DB의 `product_ai_analysis` 테이블이 검색에서 무시됨 ⚠️

**가장 큰 발견.** v4 시절에 누군가 `product_ai_analysis` 테이블을 만들고 81k 상품 전부 AI 분석 돌려서 enum 컬럼들을 채워놨음 (`migrations/012`, `017`):

```sql
product_ai_analysis (
  product_id, version,
  fit, fabric, color_family, color_detail,
  mood_tags[], keywords_ko[], keywords_en[],
  season, pattern,
  style_node, confidence, raw_response, ...
)
-- 모든 enum에 (version, X) 복합 인덱스 + gin(mood_tags, keywords)
```

그런데 v5 RPC는 `FROM products p`만 함. **이 데이터가 통째로 사장**되고 있음.

→ Vision이 이미 같은 axis로 뽑고 있고 (fit/fabric/color_family/mood_tags/keywords), DB에도 매칭되는 컬럼이 다 있음에도, RPC만 join 하면 되는 한 줄 작업이 안 돼있음.

---

## 4. Axis 모델 — v6의 핵심 개념

### 4-1. 정의

**Axis = 옷 한 벌을 묘사하는 독립 속성 차원(차원축).**

수학 좌표축처럼, 옷은 `(category, fit, fabric, color, neckline, sleeve, length, pattern, ...)` N차원 좌표로 유일하게 찍힘. axis가 많고 정밀할수록 매칭 정확도 ↑, 거리 계산 가능.

### 4-2. "axis가 픽스되었다"의 5조건

1. **enum vocabulary 통제** — 자유 텍스트 X (예: `neckline ∈ {crew, v, turtle, henley, polo, mock, boat}`)
2. **모든 옷에 라벨링** — null 허용은 OK, 어휘는 통제
3. **DB에 별도 컬럼+인덱스** — 자유 텍스트 한 칸에 묻히면 안 됨
4. **양쪽(쿼리·상품) 같은 axis로 라벨** — 한쪽만 있으면 매칭 불가
5. **RPC가 받아서 매칭/필터/부스트에 씀**

5개 다 통과해야 그 axis가 검색에 살아있음. 현재 v5는 `category, subcategory, gender, brand, price, tags`만 5개 통과.

### 4-3. Axis별 현황표

| # | axis | Vision 출력 | products 컬럼 | product_ai_analysis 컬럼 | RPC 활용 | 상태 |
|---|------|:-:|:-:|:-:|:-:|---|
| 1 | embedding | (Modal) | ✅ halfvec(768) | - | ✅ dense | 통과 |
| 2 | searchQueryKo (sparse) | ✅ | indirect (description+...) | - | ✅ sparse | 통과 |
| 3 | category | ✅ enum | ✅ | ✅ | ❌ DIAG 비활성 | **수리 가능** |
| 4 | subcategory | ✅ enum | ✅ | ✅ | ❌ DIAG 비활성 | **수리 가능** |
| 5 | gender | ✅ | ✅ gender[] | - | ❌ DIAG 비활성 | **수리 가능** |
| 6 | price | (사용자 입력) | ✅ price | - | ✅ | 통과 |
| 7 | brand | (taggedHandles) | ✅ | - | ✅ | 통과 |
| 8 | fit | ✅ enum | ❌ | ✅ enum | ❌ join 없음 | **결함 ③** |
| 9 | fabric | ✅ enum | ✅ material(text) | ✅ enum | ❌ join 없음 | **결함 ③** |
| 10 | color_family | ✅ enum | ❌ | ✅ enum | ❌ join 없음 | **결함 ③** |
| 11 | colorHex | ✅ #RRGGBB | ❌ | ❌ (color_detail 자유텍스트) | ❌ | **신규 필요** |
| 12 | pattern | ❌ Vision 누락 | ❌ | ✅ enum | ❌ | **결함 ① + ③** |
| 13 | neckline | ❌ Vision 누락 | ❌ | ❌ | ❌ | **★ 신규** |
| 14 | sleeve | ❌ Vision 누락 | ❌ | ❌ | ❌ | **★ 신규** |
| 15 | length | ❌ Vision 누락 | ❌ | ❌ | ❌ | **★ 신규** |
| 16 | closure | ❌ Vision 누락 | ❌ | ❌ | ❌ | **★ 신규** |
| 17 | texture | ❌ Vision 누락 | ❌ | ❌ | ❌ | **★ 신규** |
| 18 | decoration | ❌ Vision 누락 | ❌ | ❌ | ❌ | **★ 신규** |
| 19 | season | image-level mood만 | ❌ | ✅ enum | ❌ | **결함 ① + ③** |
| 20 | style_node | ✅ | ✅ | ✅ | ❌ | **결함 ②** |
| 21 | mood_tags | ✅ | ❌ | ✅ gin | ❌ | **결함 ② + ③** |
| 22 | keywords_ko/en | - | - | ✅ gin | ❌ | **결함 ③** (sparse 보강 가능) |

★ = v6에서 새로 추가해야 함 (Vision 스키마 + DB 컬럼 + 81k 백필).

### 4-4. v6 score 산식 골격 (가설)

```
final_score(product) =
  RRF(dense_rank, sparse_rank, style_node_rank)
  + Σ axis_boost  # axis 8~22 매칭 가중합
  - hard_filter_violations × ∞   # axis 3~7 위반 시 배제
```

가중치는 임의값 (미결정 — §5-3 참조).

---

## 5. 미해결 결정 지점

다음 세션에서 사용자와 결정해야 할 4가지.

### 5-1. ★ axis (neckline / sleeve / length / closure / texture / decoration / pattern) 7개를 다 추가할지

- 비용: Vision 프롬프트 + DB 컬럼 + 81k 백필 (OpenAI 호출 비용 발생)
- 옵션:
  - (a) 7개 다 추가
  - (b) 핵심 3~4개만 (예: pattern, neckline, sleeve, length)
  - (c) 0개 — 기존 axis 살리는 것만 먼저
- **추천: (c)부터 시작.** 결함 ②③만 수리해도 정확도 큰 개선 기대. ★ axis는 측정 후 결정.

### 5-2. `product_ai_analysis` 활용 방식

- (a) RPC가 `LEFT JOIN product_ai_analysis`로 읽기 — 코드 변경 작음, 쿼리 비용 ↑
- (b) 핵심 enum (fit, fabric, color_family, pattern, season, mood_tags, keywords) **`products`로 비정규화 복사** + 트리거로 동기화 — 쿼리 빠름, 마이그레이션 큼
- **추천: (a) 먼저.** 81k 규모면 join 비용 감수 가능. 성능 측정 후 비정규화.

### 5-3. boost 가중치 결정 방식

- (a) 임의 시작값으로 ship → 사용자 피드백 보고 조정
- (b) 평가셋 (~100쌍 라벨링) 만들고 grid search
- (c) Learning-to-Rank 모델 (LightGBM 등) 학습
- **추천: (a) → (b).** (c)는 데이터 충분히 쌓인 후.

### 5-4. score 산식 — RRF + boost vs Two-stage

- (a) RRF rank로 top-K 후보 뽑은 후 그 안에서만 boost로 rerank — 깔끔
- (b) RRF score에 boost 더하기 — 간단하지만 RRF 0.016 ~ boost 0.3 스케일 차이로 boost가 dominate
- (c) RRF rank → boost → 다시 정렬 (rank만 사용, score 무시) — 안정적
- **추천: (a) two-stage.** SQL에서 top-200 추출 → kikoai/ai에서 rerank.

---

## 6. kikoai/app 측 작업 목록 (axis 의사결정 후)

### 6-1. Vision 프롬프트 확장 (★ axis 추가 시)

- **파일:** `src/lib/prompts/analyze.ts:11-146`
- 새 필드 enum 정의 추가 (neckline/sleeve/length/closure/texture/decoration/pattern)
- 출력 JSON 스키마에 필드 추가 + 예시 갱신
- 라벨링 규칙 (Rules 섹션)에 새 필드 가이드 추가

### 6-2. Vision TypeScript 타입 확장

- **파일:** `src/lib/analyze/run-vision.ts:19-33`
- `VisionAnalysisItem` 인터페이스에 새 필드 추가

### 6-3. DB 마이그레이션

- **새 파일:** `supabase/migrations/033_axis_columns.sql`
  - `product_ai_analysis`에 `neckline, sleeve, length, closure, texture, decoration` 컬럼 추가 (★ 추가 시)
  - 각 enum에 (version, X) 복합 인덱스
- **새 파일:** `supabase/migrations/034_search_products_v6.sql`
  - `search_products_v6` 함수 생성. 시그니처:
    ```sql
    search_products_v6(
      query_embedding halfvec(768),
      query_text text,
      -- hard filters (v5 호환)
      brand_filter text[], gender_filter text[],
      category_filter text, subcategory_filter text,
      price_min int, price_max int, tags_filter text[],
      -- axis boost 입력
      target_fit text, target_fabric text, target_color_family text,
      target_color_hex text, target_pattern text, target_season text,
      target_style_node text, target_style_node_secondary text,
      target_mood_tags text[],
      -- ★ 추가 시
      target_neckline text, target_sleeve text, target_length text,
      target_closure text, target_texture text, target_decoration text,
      -- boost 가중치 (선택, 기본값 from settings)
      boost_weights jsonb DEFAULT NULL,
      k int DEFAULT 50, rrf_k int DEFAULT 60
    )
    ```
  - 핵심: `LEFT JOIN product_ai_analysis pai ON pai.product_id = p.id AND pai.version = 'v_current'`
  - boost 계산은 SQL CASE WHEN 합산

### 6-4. 백필 스크립트 (★ axis 추가 시)

- **새 파일:** `scripts/backfill-axis.ts`
- 81k 상품 이미지 → GPT-4o-mini Vision으로 ★ axis만 추가 라벨링
- 새 version (`v2` 등)으로 `product_ai_analysis`에 insert
- 비용 추정: 81k × ~$0.0001 ≈ $8 (4o-mini 기준)

### 6-5. kikoai/app→kikoai/ai 페이로드 확장

- **파일:** `src/app/api/find/search/route.ts:142-148`
- `commonAI`에 `item` 통째로 + 이미지 레벨 axis (sensitivityTags, palette 등) 추가
- kikoai/ai 측 Pydantic이 받도록 §7 참조

---

## 7. kikoai/ai 측 contract 변경 (kikoai/app 작업 후)

### 7-1. Pydantic 모델 확장

- **파일:** `kikoai/ai/app/models/request.py:13-26`
- `AnalyzedItem`에 누락 필드 추가:
  ```python
  detail: str | None = None
  color: str | None = None
  color_hex: str | None = Field(default=None, alias="colorHex")
  pattern: str | None = None
  # ★ 추가 시
  neckline, sleeve, length, closure, texture, decoration: str | None = None
  ```
- `RecommendRequest`에 이미지 레벨 axis:
  ```python
  sensitivity_tags: list[str] | None = None
  palette: list[dict] | None = None
  ```

### 7-2. RPC 파라미터 매핑

- **파일:** `kikoai/ai/app/pipeline/search.py:24-39`
- `search_products_v6` 함수명으로 변경
- 모든 axis를 `target_*` 파라미터로 전달
- DIAG 비활성화된 `gender_filter`, `subcategory_filter` 활성화 (DB 정합성 검증 후)

### 7-3. (선택) Two-stage rerank

- §5-4에서 (a) 결정 시:
- **새 파일:** `kikoai/ai/app/pipeline/rerank.py`
- RPC가 top-200 dense+sparse RRF만 반환하게 단순화
- kikoai/ai에서 axis boost 가중합으로 top-15 재정렬
- 가중치는 `settings.RERANK_WEIGHTS` (yaml/env)로 운용

---

## 8. 검증 / 측정 계획 (v5 → v6 비교)

### 8-1. 평가셋 구축

- 골든셋: 100~200쌍의 `(이미지, 정답 product_id 후보 5~10개)` 라벨링
- 출처 옵션: 기존 사용자 피드백, 운영자 큐레이션, IG 실제 매칭

### 8-2. 메트릭

- **Recall@10, Recall@20** — top-K에 정답이 들어있는 비율
- **MRR (Mean Reciprocal Rank)** — 정답의 평균 역순위
- **NDCG@10** — 등급화된 정답에 대한 랭킹 품질

### 8-3. 대조 실험

- v5 baseline (현재) vs 결함 수리만 vs ★ axis 추가
- A/B로 **각 axis가 가져오는 marginal gain 측정** (ablation)

---

## 9. 참고 — 검색 파이프라인 26단계 (사용자 정리)

이전 세션에서 사용자가 직접 정리한 v5 파이프라인 흐름. **kikoai/ai 세션 transcript 참고** (필요 시 user에게 요청).

요약:
1. kikoai/app `/api/find/search` 진입
2. kikoai/ai `/recommend` 호출 (8s timeout)
3. embed_step (Modal `/embed`, FashionSigLIP 768d L2-normalized)
4. search_step (Supabase `search_products_v5` RPC, RRF=60)
5. diversify_step (brand_cap=2/6, platform_cap=3, target=10+tolerance×10)
6. RecommendResponse 직렬화 → kikoai/app → 클라이언트

---

## 10. 다음 세션 개시 명령

```
# kikoai/app 디렉토리에서
cd /Users/hansangho/Desktop/kikoai/app
# 이 문서를 컨텍스트로 새 세션 시작
cat HANDOFF.md
```

권장 첫 질문 순서:
1. §5-1 ★ axis 추가 범위 결정
2. §5-2 product_ai_analysis 활용 방식 결정
3. §5-4 score 산식 결정
4. 결정에 따라 §6 작업 시작

---

## 11. 관련 파일 인덱스

| 영역 | 파일 |
|---|---|
| Vision 프롬프트 | `kikoai/app/src/lib/prompts/analyze.ts` |
| Vision 호출 | `kikoai/app/src/lib/analyze/run-vision.ts` |
| 포털 라우트 | `kikoai/app/src/app/api/find/search/route.ts` |
| DB products | `kikoai/app/supabase/migrations/004,005,006,008,011,017,027,031.sql` |
| DB AI analysis | `kikoai/app/supabase/migrations/012,017.sql` |
| RPC v5 | `kikoai/app/supabase/migrations/030,031.sql` |
| kikoai/ai 진입 | `kikoai/ai/app/api/recommend.py`, `kikoai/ai/app/models/request.py` |
| kikoai/ai 검색 | `kikoai/ai/app/pipeline/search.py` |
| Embed | `kikoai/ai/app/pipeline/embed.py`, `embed_app.py` (Modal) |

---

**TL;DR:** Vision은 잘 뽑고 있다. 문제는 **kikoai/app→kikoai/ai 경계에서 손실 + kikoai/ai 내부에서 무시 + DB의 product_ai_analysis가 RPC에서 사장**. 모델·프롬프트 업그레이드 전에 **이미 있는 axis들을 검색까지 흘려보내는 것**부터. ★ axis 추가는 그 다음 단계.
