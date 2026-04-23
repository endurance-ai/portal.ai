# 검색 엔진 v5 — 임베딩 기반 재설계 플랜

**작성일**: 2026-04-23
**실행 예정**: 다음 세션 (별도 브랜치)
**의존**: `feature/international-shopify-crawl` 머지 완료 후

## 배경

현재 검색 엔진 v4는 `product_ai_analysis` INNER JOIN 기반 → 해외 Shopify 상품 35,746개가 AI 분석 없이는 검색에 노출 불가. 이번 세션에서 해외 상품 크롤/임포트는 성공했으나, 검색 파이프라인 자체를 임베딩 기반으로 전환해야 유저에게 노출됨.

또한 기존 파이프라인은 **상품당 Vision LLM 분석**이 필수라 비용/속도/rate limit 문제가 상품 수에 비례해서 커짐. 81k → 500k 가면 실질적으로 스케일 불가.

## 결정 사항 (확정)

1. **`product_ai_analysis` 테이블 및 관련 코드 완전 제거** — 다음 세션에서 일괄
2. **Marqo-FashionSigLIP + pgvector + pgroonga(한국어 BM25) + RRF** 조합으로 교체
3. **Grounded-SAM-2 오프라인 garment 세그멘테이션**으로 다중 아이템 사진 해결
4. **쿼리 시점 LLM 앙상블 벡터** (enum 추출 + 자연어 상품 설명 생성)
5. **Rocchio 피드백 루프** Step 6에 연결
6. **벡터 DB는 pgvector** — 1M+ 넘기 전까진 Qdrant 불필요

## Scope — 다음 세션 태스크 큐

### Week 1 (인프라 + 임베딩)

| Day | 작업 | 의존 |
|---|---|---|
| D1 | Supabase에 pgvector extension 활성화 확인, pgroonga extension 활성화, 마이그레이션 작성 | Supabase dashboard 권한 |
| D1 | `products.embedding vector(512)` 컬럼 + HNSW 인덱스 (`m=16, ef_construction=200, vector_ip_ops`) | pgvector |
| D1 | `products.name_material_brand` tsvector 컬럼 + pgroonga 인덱스 | pgroonga |
| D2~3 | GPU 인프라 셋업 — g5.xlarge on-demand + Marqo-FashionSigLIP 모델 로드 | AWS Activate |
| D3 | 81,444개 상품 이미지 전체 임베딩 인코딩 (images[0] 기준, 예상 30분~1시간) | GPU |
| D4 | `/api/search-products` v5 — dense + sparse(pgroonga) + RRF 통합 쿼리 | 위 전부 |
| D5 | **`product_ai_analysis` 테이블 드랍 + 의존 코드 제거** (enum-매칭 스코어링, korean-vocab, color-adjacency, style-adjacency 상당수 삭제) | |
| D6~7 | Q&A reducer 조정 — Step 2는 쿼리 시점 Vision LLM 1회로 축소, Step 3~4 필터 로직 벡터 쿼리에 연결 | |

### Week 2 (고도화)

| Day | 작업 |
|---|---|
| D1~2 | 쿼리 시점 LLM 앙상블 — enum intent + 자연어 설명 두 번 embed 후 평균 |
| D3~4 | Grounded-SAM-2 파이프라인 — 해외 35k 이미지 garment별 세그멘테이션 + 분할 임베딩 |
| D5 | Step 6 feedback에 "이거 아니에요" 버튼 + Rocchio 세션 내 쿼리 보정 |
| D6 | 평가 — 영문 프롬프트 10개, 해외 상품 노출률, 실루엣 유사도 정성 평가 |
| D7 | 어드민 검색 디버거 업데이트 (v5 스코어 breakdown 시각화) |

## 제거 대상 코드 (D5 일괄)

- `supabase/migrations/0XX_drop_product_ai_analysis.sql` 신규 작성 — 테이블 드랍
- `src/app/api/search-products/route.ts` — `.from("product_ai_analysis")` 두 경로 모두 제거, v5로 교체
- `src/lib/search/locked-filter.ts` — enum 락 로직은 유지하되 입력이 쿼리 시점 LLM 출력으로 변경
- `src/lib/enums/korean-vocab.ts` — 대부분 삭제 (쿼리 시점 LLM이 대체)
- `src/lib/enums/color-adjacency.ts`, `style-adjacency.ts` — 삭제 (임베딩 유사도가 대체)
- `src/lib/fashion-genome.ts` — style_node 정의만 남기고 빌더 삭제
- `scripts/analyze-products.ts` — 삭제 (LiteLLM 배치 불필요)
- `scripts/eval-prompt-v2.ts` — 신규 평가 스크립트로 교체
- `src/app/admin/search-debugger/page.tsx` — enum score 대신 vector score + BM25 score 표시

## 유지되는 것

- `products` 테이블 구조 — 컬럼만 추가
- `products.gender`, `price`, `in_stock`, `platform` — 하드 필터로 유지
- Q&A 6단계 플로우 자체 (Step 2 내부만 변경)
- `src/app/api/analyze/route.ts` — 쿼리 시점 Vision은 여전히 OpenAI GPT-4o-mini

## 기술 스택 변화 요약

| 레이어 | Before (v4) | After (v5) |
|---|---|---|
| 인덱싱 | Vision LLM × 81k → enum 저장 | FashionCLIP × 81k → vector 저장 (+ BM25 토크나이저) |
| 쿼리 처리 | GPT-4o-mini → enum JSON | GPT-4o-mini → intent + 자연어 설명 → 2× embedding 앙상블 |
| 매칭 | 가중 enum 스코어링 | pgvector HNSW + pgroonga BM25 + RRF |
| 다중 아이템 | Vision이 이미지에서 골라 분석 | Grounded-SAM-2로 상품/쿼리 둘 다 garment별 임베딩 |
| 피드백 | 없음 | 세션 내 Rocchio 보정 |

## 비용 추정

- GPU g5.xlarge 일회성 2~4시간 (임베딩 인코딩 + SAM-2 세그멘테이션) = **~$4~8**
- 쿼리당 OpenAI GPT-4o-mini 2회 (기존 1회에서 +1회) = 쿼리당 ~$0.006 (기존 ~$0.003)
- Supabase 비용 증가 거의 없음 (벡터 컬럼 1GB 미만)
- 총 구축 비용 **$10 내외**

## 성공 기준

- 해외 35k 상품이 검색 결과에 노출됨 (현재 0)
- 영문 프롬프트 10개 중 7개 이상에서 해외 상품이 상위 10위 내
- 이미지 쿼리 p95 latency < 200ms (pgvector HNSW)
- 다중 아이템 사진에서 원하는 garment가 top 5에 (SAM-2 효과)

## NOT in scope

- ❌ Qdrant/Weaviate/Pinecone 도입 (1M+ 넘으면 재검토)
- ❌ Cross-encoder reranker (Qwen3-VL-Reranker) — 효과 미미
- ❌ Matryoshka 임베딩 — 81k에선 오버킬
- ❌ 유저별 개인화 모델 — 유저 데이터 축적 후
- ❌ Virtual try-on — 서비스 범위 밖

## Open items

- Marqo-FashionSigLIP vs Marqo-FashionCLIP — SigLIP 우선 (Recall@1 높음), 필요 시 교체
- Grounded-SAM-2 한 번 돌릴 때 텍스트 프롬프트 어떻게 줄지 — "jacket", "pants", "shoes", "bag" 등 10여개 카테고리 권장
- pgroonga가 Supabase에 기본 포함인지 확인 필요 — 아니면 pg_bigm 폴백
- GPU 인스턴스는 순수 스팟 vs 온디맨드 — 임베딩 일회성이라 온디맨드가 단순
