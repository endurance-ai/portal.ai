# 브랜드 그래프 자율 루프 — Handoff

**최종 갱신:** 2026-05-10
**작업 디렉터리:** `/Users/hansangho/Desktop/portal/app`
**현재 상태:** 인프라 + 메타 추론 + 어드민 UI 완료. 자동화(매일 routine)·이미지 임베딩·검색 통합은 미진행.

> 5/7 ~ 5/10 세션에서 Step 0~9의 핵심 9할 완료. 잔여 작업은 운영 자동화와 검색 알고리즘 통합.

---

## 0. 목적 (변동 없음)

portal.ai 검색 품질을 끌어올리기 위해 **브랜드 간 유사도 그래프(`brand_similar`)** 구축. 활용:
1. "비슷한 브랜드 추천" 신기능
2. 검색 결과 다양성 캡 (브랜드 클러스터 단위)
3. 검색 가중합 11번째 차원 (brand vector cosine) — **별 트랙으로 미룸**

---

## 1. 결정 완료 사항 (변동 없음)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 자동 머지 정책 | **(B)** confidence ≥ 0.85 자동, 0.7~0.85 검수큐, < 0.7 폐기 |
| 2 | brand normalization 책임 | **(A)** portal.ai 안에서 cleanup |
| 3 | 이미지 임베딩 트랙 | **(A)** 텍스트 임베딩 우선. 이미지는 별 트랙 |
| 4 | 텍스트 임베딩 백본 | **BGE-m3** 로컬 (1024차원, 한/영 강함) |
| 5 | 임베딩 호스팅 | **(α)** 사용자 Mac 1회 → 안정화 후 portal/ai로 이전 검토 |
| 6 | products 미매칭 처리 | **(α)** 모두 자동 등록, 메타는 자율 루프가 채움 |
| 7 | brand_nodes 고아 | **(가)** 일단 유지 |
| 8 | 어휘 표준 (vibe 30 / palette 16 / material 20 / sensitivity 22) | **확정 + 적용** — `scripts/fill_brand_meta.py` 의 SYSTEM_PROMPT 에 controlled vocab 박혀있음 |
| 9 | LLM 모델 | **gpt-4o-mini via LiteLLM 프록시** (54.116.116.225:4000) |
| 10 | 어드민 UI 디자인 | **테이블 뷰** (검수큐) + **SVG 그래프** (UMAP 맵 + Constellation) |

---

## 2. DB 현재 상태 (2026-05-10)

| 항목 | 수량 | 메모 |
|---|---|---|
| brand_nodes | **2,100** | 1,000 (시드) + 1,100 (자동 등록) |
| brand_nodes.embedding 보유 | **2,100 (100%)** | BGE-m3 1024-dim |
| brand_nodes.x_umap/y_umap 보유 | **2,100 (100%)** | UMAP 2D projection 캐시 |
| brand_nodes.sensitivity_tags 채움 | 1,667 (79.4%) | 자율 루프 적용 후 |
| brand_nodes.brand_keywords 채움 | 1,668 (79.4%) | |
| brand_similar | **42,000 edges** | top-20 per brand |
| brand_attribute_proposals | **3,529 row** | auto 1,632 / pending 1,427 / rejected 470 |
| products 매칭률 | 40% (raw 기준, 측정 버그 가능성) | 실 SKU 볼륨 기준은 더 높을 듯 |

---

## 3. 적용된 마이그레이션

| 번호 | 내용 | 상태 |
|---|---|---|
| 037 | brand_nodes.embedding (1024-dim) + HNSW | ✅ |
| 038 | brand_similar 그래프 테이블 | ✅ |
| 039 | brand_attribute_proposals 검수큐 (admin RLS) | ✅ |
| 040 | brand_nodes.aliases | ✅ |
| 041 | NOT NULL 완화 (style_node/sensitivity_tags/brand_keywords/gender_scope) | ✅ |
| 042 | brand_sku_counts view + UMAP layout cache 컬럼 | ✅ |
| 043 | brand_sku_counts → MATERIALIZED VIEW (perf) | ✅ |

---

## 4. 작성된 파일

### 마이그레이션 (`supabase/migrations/`)
- 037~043 (위 표 참고)

### 스크립트 (`scripts/`)
- `register_unmatched_brands.ts` — products → brand_nodes 자동 등록 (idempotent, upsert ignoreDuplicates)
- `fill_brand_meta.py` — gpt-4o-mini via LiteLLM 메타 추론 + 분기 적용. workers 옵션
- `umap_brand_layout.py` — UMAP 1024D → 2D 투영 + DB 캐시

### 라이브러리 (`src/lib/`)
- `brand-normalize.ts` — NFKD-aware 정규화 함수

### 어드민 페이지 (`src/app/admin/`)
- `brand-graph/page.tsx` — UMAP 맵 + Constellation + 사이드 패널 (`react-force-graph-2d` → SVG 직접 마이그)
- `brand-proposals/page.tsx` — 검수큐 테이블 뷰

### 어드민 API (`src/app/api/admin/`)
- `brand-graph/route.ts` — 노드 + SKU 카운트
- `brand-graph/neighbors/route.ts` — 특정 brand 의 top-K 이웃
- `brand-graph/detail/route.ts` — 사이드 패널 풀 페이로드 (이미지 5개, 가격/카테고리/성별 분포, 유사 top-5)
- `brand-proposals/route.ts` — 검수큐 리스트
- `brand-proposals/bulk/route.ts` — 일괄 승인/거절 (brand_nodes.attributes 머지 포함)

### 컴포넌트
- `src/components/admin/brand-detail-panel.tsx` — 우측 380px 슬라이드 패널
- `src/components/ui/skeleton.tsx` — shadcn 추가
- `src/components/admin/sidebar.tsx` — "브랜드 그래프" + "브랜드 검수큐" 메뉴 추가

### 의존성 추가
- `react-force-graph-2d` (npm) — 지금은 어차피 SVG 로 마이그됐지만 deps 에 남아있음. cleanup 가능
- `umap-learn`, `python-dotenv`, `openai` (uv add — portal/ai)

### 커밋
```
a61459f feat(admin/brand-proposals): LLM proposal review queue
69ab740 feat(admin/brand-graph): SVG-based interactive similarity graph
dcf801e feat(brand-graph): build brand similarity infra (migrations + scripts)
```
모두 `dev` 브랜치. 미푸시.

---

## 5. 어드민에서 확인 가능한 것

| URL | 기능 |
|---|---|
| `/admin/brand-graph` | UMAP 맵 (2,100 dot) + 검색/클릭 시 Constellation + 사이드 패널 |
| `/admin/brand-proposals` | 1,427 pending 검수 — 일괄 승인/거절 |

---

## 6. 잔여 작업

### 🔴 우선순위 높

1. **검수큐 1,427 처리** — 사용자가 직접 어드민에서 일괄 승인/거절. 처리 후 brand_nodes 메타 채움률 79.4% → ~95% 점프 예상.

### 🟡 우선순위 중

2. **빈 메타 432 brand retry** — gpt-4o-mini 가 못 잡은 무명/garbage brand. Claude Haiku/Sonnet 으로 retry + products description sampling 추가하면 정확도 ↑.
   - 스크립트 수정: `fill_brand_meta.py` 에 `--model` arg + products description 신호 추가
   - 또는 어드민에서 "garbage brand" 수동 마킹 후 제외

3. **매일 routine 자동화** (HANDOFF Step 9):
   - `register_unmatched_brands.ts` (변경분만)
   - `fill_brand_meta.py` (메타 빈 row 만)
   - `umap_brand_layout.py` (text_hash 변경분만)
   - `embed_brands_text.py` (해시 변경분만)
   - `REFRESH MATERIALIZED VIEW CONCURRENTLY brand_sku_counts;`
   - claude.ai/code/routines 또는 GitHub Actions cron

### 🟢 우선순위 낮

4. **검색엔진 brand vector 11번째 차원** — `/api/search-products` 에 brand similarity term 추가. v6 검색 트랙(SPEC-V6-EVAL/CORE)과 합쳐서 진행.

5. **products 매칭률 디버깅** — 40% 측정값이 측정 버그인지 확인. SKU 볼륨 기준 매칭률도 별도 측정.

6. **brand-graph 페이지 폴리싱** — 모바일 대응, 검수큐 ↔ brand-graph 양방향 링크, 패널에 더 많은 정보, react-force-graph-2d 의존성 제거.

7. **이미지 임베딩 트랙** — 풀배치(FashionSigLIP). 별 트랙으로 분리 (HANDOFF 결정 #3 (α) 따름).

---

## 7. 외부 결정 / 의문 (해결됨)

| 이전 의문 | 해결 |
|---|---|
| 마이그레이션 적용 방법 | Supabase Studio SQL editor paste 로 합의됨 |
| 자동 추론 LLM 선택 | gpt-4o-mini via LiteLLM 사용 — 1,034 brands ~5분, $0.3 |
| analyses 테이블 0~182 rows 의문 | **미해결** — 별 트랙으로 조사 필요. v4 검색 (`products ⨝ product_ai_analysis`) 가 사실상 결과 못 내고 있을 가능성 |

---

## 8. 다음 세션 시작 가이드

작업 이어가려면:

1. **이 HANDOFF 와 `docs/features/search-engine.md` 읽기**
2. **검수큐 한번 들어가보기** (`/admin/brand-proposals` — 1,427 pending 처리 가능)
3. 우선 작업 결정:
   - 사용자 직접 검수 시간 있으면 → 검수큐 일괄 승인 (5~30분)
   - 자동화 우선이면 → 매일 routine 등록
   - 알고리즘 통합이면 → 검색엔진 11D (큰 작업, v6 트랙 합류)

브랜치 전략: 자동화 / 검색 통합은 별 feature 브랜치로 추천 (이번 dev 브랜치는 인프라+UI 통째로 묶임).

---

## 9. 참고 reference

- Zalando Fashion DNA — https://research.zalando.com/project/fashion_dna/fashion_dna/
- Fashionpedia (ECCV 2020) — https://www.ecva.net/papers/eccv_2020/papers_ECCV/papers/123460307.pdf
- BGE-m3 — HuggingFace `BAAI/bge-m3`
- Connected Papers (Constellation 패턴 참고) — https://www.connectedpapers.com/
- Obsidian Graph View — https://help.obsidian.md/plugins/graph
- LiteLLM proxy — `54.116.116.225:4000` (kiko.ai EC2 i-05e8dbdb3e00ace23)
