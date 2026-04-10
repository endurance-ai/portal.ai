# Portal.ai LLM 인프라 로드맵

> 현재 portal.ai의 추천 파이프라인은 "키워드 추출 → enum 매칭 → score sort"로,
> LLM이 진짜로 "이해"하는 것이 아니라 분류기 역할만 하고 있다.
> 이 문서는 4가지 핵심 문제를 정의하고, 각각에 대한 해결 방향과
> 필요한 인프라를 단계별로 가이드한다.
>
> **핵심 전제**: 회사(optigen)에서 이미 운영 중인 LangGraph + Qdrant + BGE-M3 +
> Cohere Reranker + LangSmith 스택을 적극 참고하되,
> portal.ai의 규모(26K 상품, 100-1000 쿼리/일)에 맞게 경량화한다.

---

## 목차

1. [현재 아키텍처 & 한계](#1-현재-아키텍처--한계)
2. [문제 P1: 데이터 정규화 미흡](#2-p1-데이터-정규화-미흡)
3. [문제 P2: 패션 도메인 어휘 한계](#3-p2-패션-도메인-어휘-한계)
4. [문제 P3: 대화형 추천 불가](#4-p3-대화형-추천-불가)
5. [문제 P4: 평가/디버깅 인프라 부족](#5-p4-평가디버깅-인프라-부족)
6. [인프라 설계: AI 서버](#6-인프라-설계-ai-서버)
7. [기술 스택 결정](#7-기술-스택-결정)
8. [단계별 실행 로드맵](#8-단계별-실행-로드맵)
9. [비용 추정](#9-비용-추정)
10. [NOT in scope](#10-not-in-scope)

---

## 1. 현재 아키텍처 & 한계

### 현재 흐름

```
유저 (이미지/프롬프트)
  → Next.js API Route (/api/analyze)
    → GPT-4o-mini Vision (이미지 분석)
    → 구조화된 JSON 추출 (category, color, fit, fabric, style_node, ...)
  → Next.js API Route (/api/search-products)
    → product_ai_analysis 테이블 JOIN
    → 11개 필드 가중치 스코어링 (enum exact match)
    → 브랜드/플랫폼 중복 제거
    → Top 7 반환
```

### 근본적 한계

| # | 문제 | 원인 | 결과 |
|---|------|------|------|
| 1 | 스타일 노드/브랜드 데이터 미활용 | brand_nodes 테이블에 데이터 있지만 검색에 반영 안 됨 | 브랜드 DNA를 무시한 추천 |
| 2 | 패션 용어 이해 불가 | korean-vocab.ts에 70항목 수동 매핑, LLM은 "무지"="solid" 모름 | 한국어 패션 슬랭으로 검색 시 실패 |
| 3 | 1회성 키워드 매칭 | LLM이 키워드만 뽑고 끝. 대화 맥락 없음. 리파인 무의미 | 5턴 리파인이 같은 결과만 반복 |
| 4 | 블랙박스 추천 | 왜 이 상품이 나왔는지 추적 불가 | 품질 개선 방향을 모름 |

---

## 2. P1: 데이터 정규화 미흡

### 현상

- `brand_nodes` 테이블에 브랜드별 스타일 속성(attributes)이 저장되어 있음
- `fashion-genome.ts`에 15개 스타일 노드 + 12개 감도 태그 정의
- **하지만 검색 엔진에서 활용하는 방식이 단순 exact match (style_node === "C" → 0.30점)**
- 브랜드-스타일 관계가 추천에 반영되지 않음
- 스타일 노드 간 "거리" 개념 없음 (미니멀 ↔ 컨템포러리는 가까운데, 미니멀 ↔ 스트릿은 먼데 동일 취급)

### 해결 방향

#### Phase 1: 스타일 노드 거리 맵 (코드 변경만)

```typescript
// 스타일 노드 간 유사도 맵 (0.0 ~ 1.0)
const STYLE_ADJACENCY: Record<string, Record<string, number>> = {
  "F": { "F": 1.0, "G": 0.7, "E": 0.5, "D": 0.3, ... },  // minimal
  "G": { "G": 1.0, "F": 0.7, "H": 0.5, ... },              // contemporary
  ...
};
```

- 검색 엔진의 style_node 스코어링을 exact match → gradient scoring으로 변경
- 데이터: Fashion Genome v2 엑셀 기반으로 도메인 전문가가 정의

#### Phase 2: 브랜드 DNA 부스팅 (검색 로직 변경)

```
유저 무드: "미니멀, 하이엔드"
→ brand_nodes에서 미니멀 성향 브랜드 조회 (AURALEE, LEMAIRE, ...)
→ 해당 브랜드 상품에 부스트 점수 부여
```

- brand_nodes.attributes를 검색 시 활용
- 브랜드 성향과 유저 무드의 정합성을 스코어에 반영

#### Phase 3: 임베딩 기반 스타일 유사도 (AI 서버 필요)

- 각 스타일 노드를 텍스트로 설명 → 임베딩 생성
- 스타일 간 cosine similarity로 자동 거리 계산
- 수동 맵 유지보수 불필요

### 인프라 요구사항

- Phase 1-2: 코드 변경만. 인프라 불필요.
- Phase 3: 임베딩 모델 + 벡터 저장소 (pgvector 또는 Qdrant)

---

## 3. P2: 패션 도메인 어휘 한계

### 현상

- `korean-vocab.ts`: "무지"→"solid", "기모"→"fleece" 등 70+항목 수동 매핑
- LLM(GPT-4o-mini)이 한국어 패션 슬랭을 이해 못 함
- 새 용어가 나올 때마다 수동 추가 필요 → 확장 불가

### 해결 방향

#### Phase 1: 수동 매핑 확장 (즉시)

- 현재 70항목 → 200항목으로 확장
- 크롤링 데이터(상품명, 설명)에서 빈출 패션 용어 자동 추출
- 한계: 여전히 수동, 신조어 대응 불가

#### Phase 2: 임베딩 기반 유사 용어 매칭 (핵심)

**회사 스택 참고: BGE-M3 (multilingual, Korean native)**

```
유저 입력: "무지 맨투맨"
→ BGE-M3 임베딩 생성
→ 상품 임베딩과 cosine similarity
→ "solid plain sweatshirt" 상품이 높은 유사도로 매칭
```

- korean-vocab.ts 수동 매핑 의존도를 크게 줄임
- 신조어, 슬랭도 유사 의미의 상품과 자동 매칭
- **회사에서 이미 BGE-M3를 seed-lognia에서 운영 중** → 동일 패턴 적용

#### Phase 3: FashionSigLIP 도메인 특화 임베딩

**Marqo/marqo-fashionSigLIP** (Apache 2.0):
- 1M+ 패션 상품으로 학습된 CLIP 모델
- FashionCLIP 2.0 대비 +57% recall@1
- 7개 패션 측면 최적화: descriptions, colors, styles, keywords, materials
- 이미지 → 텍스트, 텍스트 → 이미지 양방향 검색

```
유저 이미지 업로드
→ FashionSigLIP으로 이미지 임베딩
→ 상품 이미지 임베딩과 직접 유사도 비교
→ enum 매칭 없이도 "비슷한 느낌의 옷" 찾기
```

### 인프라 요구사항

- Phase 1: 코드만
- Phase 2: BGE-M3 모델 서빙 (seed-lognia 패턴 참고) + pgvector/Qdrant
- Phase 3: FashionSigLIP 모델 서빙 (GPU 불필요, CPU에서 충분)

---

## 4. P3: 대화형 추천 불가

### 현상

현재 `sticky-refine-bar.tsx`에서 최대 5턴 리파인을 지원하지만:
1. 매 턴마다 GPT-4o-mini가 새로 키워드를 뽑아서 enum 매칭 → 동일 로직 반복
2. 이전 턴의 결과/피드백이 다음 턴에 반영되지 않음
3. "좀 더 캐주얼하게" 같은 상대적 지시를 처리할 수 없음
4. 결과: 리파인해도 비슷한 결과 → 유저 이탈

### 해결 방향: AI 서버 도입

**회사 스택 참고: seed-lognia의 LangGraph RAG 파이프라인**

#### 목표 아키텍처

```
유저 → Next.js → AI Server (FastAPI)
                    │
                    ├─ LangGraph (대화 상태 관리)
                    │   ├─ Node 1: 의도 분석 (query enhancement)
                    │   ├─ Node 2: 검색 전략 결정
                    │   ├─ Node 3: 하이브리드 검색
                    │   │   ├─ Structured: enum 매칭 (기존 로직)
                    │   │   ├─ Vector: 임베딩 유사도 (BGE-M3 / FashionSigLIP)
                    │   │   └─ Rerank: Cohere Rerank 4.0
                    │   ├─ Node 4: 결과 생성
                    │   └─ Node 5: 메타데이터 수집
                    │
                    ├─ Qdrant / pgvector (벡터 검색)
                    └─ LiteLLM (LLM 라우팅)
```

#### LangGraph 그래프 설계

```python
# portal.ai RAG Graph (seed-lognia 패턴 차용)
class PortalRAGState(TypedDict):
    query: str                    # 유저 입력
    messages: list[BaseMessage]   # 대화 히스토리
    enhanced_query: str           # LLM이 재작성한 쿼리
    search_params: dict           # enum 필터 + 벡터 검색 조건
    products: list[Product]       # 검색 결과
    feedback: str | None          # 유저 피드백 ("더 캐주얼하게")
    usage_meta: dict              # 토큰/비용 추적

# Nodes
enhance_query    → LLM이 대화 맥락을 반영한 검색 쿼리 생성
                   "더 캐주얼하게" + 이전 결과 → "캐주얼 무드의 면 소재 상의"
search_products  → 하이브리드 검색 (enum + vector + rerank)
generate_result  → 결과 정리 + 추천 이유 생성
collect_metadata → 토큰 사용량, 검색 스코어 기록
```

#### 핵심 차이: query enhancement

현재:
```
유저: "좀 더 캐주얼하게"
→ GPT-4o-mini: {category: "Top", fit: "relaxed"} (맥락 없이 새로 추출)
→ 기존과 비슷한 결과
```

개선 후:
```
유저: "좀 더 캐주얼하게"
→ LangGraph state: 이전 검색이 "미니멀 울 코트"였음을 알고 있음
→ enhance_query: "미니멀 스타일이지만 소재는 면이나 저지, 핏은 릴랙스드, 캐주얼 무드"
→ enum 필터 조정: fit=relaxed, fabric=cotton, mood_tags 변경
→ 벡터 검색: "casual minimal cotton" 임베딩으로 유사 상품 탐색
→ 의미 있게 다른 결과
```

#### seed-lognia에서 가져올 수 있는 것

| 컴포넌트 | seed-lognia 원본 | portal.ai 적용 |
|---------|-----------------|---------------|
| LangGraph 그래프 | `app/graphs/rag.py` (4 nodes) | 동일 패턴, 노드 내용만 변경 |
| ScoreRetriever | `app/integrations/retrievers/score_retriever.py` | 하이브리드 검색 (dense + sparse) |
| Reranker | `app/integrations/rerankers/litellm_proxy.py` | Cohere Rerank 동일 |
| Provider 패턴 | `LLMProvider`, `VectorProvider`, `RerankerProvider` | 싱글톤 + DI 패턴 그대로 |
| SSE 스트리밍 | `astream_events(version="v2")` | 리파인 실시간 응답에 활용 |
| RequestContext | ASGI 미들웨어 기반 요청 추적 | 디버깅/관찰성에 활용 |

### 인프라 요구사항

- FastAPI AI 서버 (EC2 t4g.medium~large)
- LangGraph + LangChain
- Qdrant 또는 pgvector (벡터 검색)
- LiteLLM (기존 프록시 활용 또는 AI 서버 내장)
- LLM API: GPT-4o-mini 또는 Bedrock (상시 서빙이라 API가 경제적)

---

## 5. P4: 평가/디버깅 인프라 부족

### 현상

- `eval-prompt.ts`, `eval-search.ts` 스크립트가 있지만 CLI 전용
- "왜 이 상품이 추천됐는지" 시각적으로 추적 불가
- 스코어링 breakdown이 안 보임
- 프롬프트 변경 시 품질 회귀 감지 어려움

### 해결 방향

#### Phase 1: 검색 스코어 breakdown (코드 변경만)

```typescript
// search-products API 응답에 score_breakdown 추가
{
  product: { id, name, brand, ... },
  total_score: 1.85,
  score_breakdown: {
    subcategory: 0.25,    // exact match
    color_family: 0.20,   // exact
    color_adjacent: 0.00, // no adjacent
    style_primary: 0.30,  // node match
    fit: 0.15,            // exact
    fabric: 0.15,         // exact
    season: 0.15,         // exact
    pattern: 0.15,        // exact
    mood_tags: 0.10,      // 2/3 match
    keywords: 0.10,       // 2 keywords matched
    name_match: 0.20,     // product name contains subcategory
  },
  match_tier: "exact_subcategory",
  rank_reason: "High style + subcategory match"
}
```

- 어드민 UI에서 각 추천 상품의 점수 분해를 시각화
- "이 상품이 왜 1등인지" 즉시 파악 가능

#### Phase 2: LangSmith 연동 (AI 서버 도입 시)

**회사 스택 참고: seed-lognia의 LangSmith 통합**

```python
# seed-lognia에서 이미 사용 중인 패턴
@traceable(name="search_products", tags=["portal-ai"])
async def search_products(query: str, filters: dict):
    # 각 단계가 LangSmith에 span으로 기록됨
    enhanced = await enhance_query(query, history)
    results = await hybrid_search(enhanced, filters)
    reranked = await rerank(results)
    return reranked
```

LangSmith가 제공하는 것:
- **Trace 시각화**: 요청 → 쿼리 개선 → 검색 → 리랭킹 전체 흐름
- **프롬프트 버전 관리**: A/B 테스트 가능
- **평가 데이터셋**: 골든셋 기반 자동 회귀 테스트
- **비용 추적**: 요청당 토큰 사용량/비용

대안: **Langfuse** (오픈소스, 셀프호스트 가능)
- seed-lognia가 LangSmith를 쓰고 있으므로 동일 도구 사용이 학습비용 최소
- 단, portal.ai 단독이라면 Langfuse 셀프호스트도 괜찮음 (Docker 1개)

#### Phase 3: 어드민 검색 디버거

```
어드민 UI: 검색 디버거 페이지
├─ 쿼리 입력 (텍스트/이미지)
├─ 실행 → 각 상품별 score breakdown 테이블
├─ "왜 이 상품이 탈락했는지" 필터링
├─ enum 매칭 vs 벡터 유사도 비교 뷰
├─ LangSmith trace 링크 (해당 요청의 전체 흐름)
└─ 프롬프트 에디터 (실시간 테스트)
```

### 인프라 요구사항

- Phase 1: 코드만
- Phase 2: LangSmith SaaS (무료 5K traces/월) 또는 Langfuse Docker
- Phase 3: 어드민 프론트엔드 작업

---

## 6. 인프라 설계: AI 서버

### 왜 AI 서버가 필요한가

현재 Next.js API Routes에서 모든 AI 로직을 처리하고 있는데, 다음 한계가 있다:

1. **상태 관리 불가**: Vercel serverless는 stateless. 대화 맥락 유지 어려움
2. **Python 생태계 접근 불가**: LangGraph, BGE-M3, FashionSigLIP 등은 Python
3. **벡터 검색 통합 어려움**: Qdrant 클라이언트는 Python이 1등 시민
4. **관찰성 도구**: LangSmith, Langfuse 모두 Python SDK가 주력

### AI 서버 아키텍처

```
┌─ Vercel (Next.js) ──────────────────────────────┐
│  프론트엔드 + 기존 API Routes                    │
│  /api/analyze → GPT-4o-mini Vision (유지)        │
│  /api/search-products → AI Server로 위임         │
│  /api/feedback → Supabase (유지)                 │
└───────────────────┬─────────────────────────────┘
                    │ HTTP/SSE
┌───────────────────▼─────────────────────────────┐
│  AI Server (FastAPI, EC2 t4g.medium)            │
│                                                  │
│  ┌─ LangGraph ────────────────────────────────┐ │
│  │  enhance_query → search → rerank → respond │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ┌─ 벡터 검색 ───────────────────┐              │
│  │  pgvector (Supabase 내장)     │              │
│  │  OR Qdrant (Docker)           │              │
│  └───────────────────────────────┘              │
│                                                  │
│  ┌─ LLM 라우팅 ──────────────────┐              │
│  │  LiteLLM (기존 프록시 재활용   │              │
│  │  OR AI 서버 내장)              │              │
│  └───────────────────────────────┘              │
│                                                  │
│  ┌─ 관찰성 ──────────────────────┐              │
│  │  LangSmith / Langfuse         │              │
│  └───────────────────────────────┘              │
└──────────────────────────────────────────────────┘
                    │
        ┌───────────▼──────────────┐
        │  Supabase (PostgreSQL)   │
        │  ├─ products             │
        │  ├─ product_ai_analysis  │
        │  ├─ pgvector extension   │
        │  └─ analyses, feedbacks  │
        └──────────────────────────┘
```

### seed-lognia 패턴을 portal.ai에 적용

| seed-lognia | portal.ai 적용 | 변경점 |
|-------------|---------------|--------|
| Qdrant (Docker, 별도 컨테이너) | pgvector (Supabase 내장) | 26K 상품이라 pgvector로 충분. 인프라 추가 없음 |
| BGE-M3 (HuggingFace, GPU/MPS) | BGE-M3 (API 또는 CPU) | 26K 임베딩은 1회 배치. 온라인 쿼리는 작아서 CPU OK |
| LangGraph RAGGraph (4 nodes) | PortalRAGGraph (4-5 nodes) | 노드 내용만 패션 도메인에 맞게 변경 |
| Cohere Reranker via LiteLLM | 동일 | LiteLLM /rerank 엔드포인트 활용 |
| LangSmith (@traceable) | LangSmith 또는 Langfuse | 동일 패턴 |
| SSE 스트리밍 | SSE 스트리밍 | Next.js ↔ AI Server 간 SSE |
| Spring Batch (청킹 파이프라인) | tsx 배치 스크립트 (기존) | 상품 데이터는 이미 구조화됨. 문서 파싱 불필요 |

### 벡터 DB 결정: pgvector vs Qdrant

| 기준 | pgvector (Supabase) | Qdrant (Docker) |
|------|---------------------|-----------------|
| 추가 인프라 | 없음 (이미 사용 중) | EC2에 Docker 추가 |
| 26K 벡터 성능 | 충분 (HNSW, <20ms) | 과잉 |
| 하이브리드 검색 | WHERE + vector 조합 | 네이티브 Prefetch + Fusion |
| 필터링 | SQL WHERE (익숙) | Qdrant Filter API (seed-lognia 경험) |
| 확장성 (100K+) | 한계 있음 | 강력 |

**추천: pgvector로 시작** → 규모가 커지면 Qdrant 마이그레이션

이유:
- 26K 상품에 Qdrant는 오버엔지니어링
- Supabase에 이미 있으므로 인프라 추가 없음
- `product_ai_analysis` 테이블에 `embedding vector(768)` 컬럼만 추가하면 됨
- SQL WHERE (enum 필터) + vector similarity를 하나의 쿼리로 결합 가능

---

## 7. 기술 스택 결정

### 확정 스택

| 영역 | 기술 | 이유 |
|------|------|------|
| **AI 서버** | FastAPI | seed-lognia와 동일. Python AI 생태계 접근 |
| **그래프** | LangGraph | seed-lognia에서 검증됨. 대화 상태 + 조건부 노드 |
| **LLM** | GPT-4o-mini (LiteLLM 경유) | 비용 효율. 100-1000 쿼리/일에 API가 경제적 |
| **임베딩 (텍스트)** | BGE-M3 | 한국어 네이티브, seed-lognia에서 운영 중 |
| **임베딩 (이미지)** | FashionSigLIP | 패션 도메인 특화. 텍스트와 별개 벡터 |
| **벡터 DB** | pgvector (Supabase) | 인프라 추가 없음. 26K에 충분 |
| **리랭킹** | Cohere Rerank 4.0 | 한국어 네이티브. LiteLLM /rerank 활용 |
| **관찰성** | LangSmith | seed-lognia와 동일 도구. 학습비용 최소 |
| **LLM 라우팅** | LiteLLM | 기존 portal-litellm 활용 또는 AI 서버 내장 |

### 쓰지 않는 것과 이유

| 기술 | 이유 |
|------|------|
| LlamaIndex | 상품 데이터가 이미 구조화됨. 문서 RAG가 아님 |
| Qdrant | 26K 상품에 과잉. pgvector로 충분 |
| LangChain AgentExecutor | deprecated. LangGraph으로 대체 |
| Haystack / Semantic Kernel | 에코시스템 불일치 |
| vLLM 상시 서빙 | 100-1000 쿼리/일에 API가 경제적 |
| Langfuse | LangSmith와 중복. 회사와 동일 도구 선택 |

---

## 8. 단계별 실행 로드맵

### Phase 0: GPU 배치 분석 (이번 세션)

> 별도 문서: `2026-04-10-gpu-batch-analysis-design.md`

- g5.xlarge Spot + vLLM + Qwen2.5-VL-7B
- 30K 이미지 분석 3-4시간 내 완료
- 기존 프롬프트/스키마 유지

---

### Phase 1: 검색 품질 즉시 개선 (코드만, 1-2일)

**P1 + P4 일부 해결**

작업:
1. 스타일 노드 거리 맵 추가 → gradient scoring
2. 검색 API에 score_breakdown 응답 추가
3. 어드민에 score breakdown 시각화

변경 파일:
- `src/app/api/search-products/route.ts` (스코어링 + 응답)
- 신규: `src/lib/enums/style-adjacency.ts`
- `src/app/admin/search-quality/page.tsx` (시각화)

인프라: 없음

---

### Phase 2: 임베딩 기반 검색 추가 (3-5일)

**P2 핵심 해결**

작업:
1. Supabase에 pgvector extension 활성화
2. `product_ai_analysis`에 `embedding vector(768)` 컬럼 추가
3. BGE-M3로 26K 상품 텍스트 임베딩 배치 생성 (이름+설명+키워드)
4. 검색 엔진에 vector similarity를 스코어링 시그널로 추가
5. (선택) FashionSigLIP으로 이미지 임베딩 추가

검색 쿼리 예시:
```sql
SELECT p.*, pai.*,
  1 - (pai.embedding <=> query_embedding) as vector_score
FROM product_ai_analysis pai
JOIN products p ON p.id = pai.product_id
WHERE pai.version = 'v1'
  AND pai.category = 'Top'         -- enum 필터 유지
  AND p.in_stock = true
ORDER BY (enum_score * 0.6 + vector_score * 0.4) DESC
LIMIT 50;
```

인프라: Supabase pgvector (이미 내장, 활성화만)

---

### Phase 3: AI 서버 MVP (1-2주)

**P3 핵심 해결**

작업:
1. FastAPI 프로젝트 생성 (seed-lognia 구조 참고)
2. LangGraph 기본 그래프 구현 (enhance_query → search → respond)
3. Supabase 직접 연동 (enum 필터 + pgvector)
4. LiteLLM 연동 (GPT-4o-mini)
5. Next.js에서 AI 서버 호출하도록 /api/search-products 변경
6. SSE 스트리밍 (리파인 실시간 응답)

EC2 배포:
```
portal-ai 계정
├─ portal-litellm (t4g.small) — 기존, LLM 프록시
└─ portal-ai-server (t4g.medium) — 신규, FastAPI AI 서버
   ├─ FastAPI + LangGraph
   ├─ BGE-M3 (CPU, 온라인 쿼리 임베딩용)
   └─ LangSmith 연동
```

인프라: EC2 t4g.medium 1대 추가 (~$30/월)

---

### Phase 4: 리랭킹 + 관찰성 (3-5일)

**P4 완전 해결**

작업:
1. Cohere Rerank 4.0 연동 (LiteLLM /rerank)
2. LangSmith @traceable 데코레이터 추가
3. 어드민 검색 디버거 페이지 (LangSmith trace 링크 포함)
4. 프롬프트 A/B 테스트 기반 마련

인프라: LangSmith SaaS (무료 티어 5K traces/월)

---

### Phase 5: 고도화 (장기)

- FashionSigLIP 이미지 임베딩 → 이미지 ↔ 이미지 유사도 검색
- 브랜드 DNA 부스팅 (brand_nodes 활용)
- 유저 프로필/선호 학습 (피드백 데이터 기반)
- BGE-M3 파인튜닝 (크롤링 데이터로 패션 도메인 특화)
- pgvector → Qdrant 마이그레이션 (상품 수 100K+ 시)

---

## 9. 비용 추정

### 월간 운영비 (Phase 3 완료 후)

| 항목 | 비용/월 | 비고 |
|------|--------|------|
| portal-litellm (t4g.small) | ~$15 | 기존 |
| portal-ai-server (t4g.medium) | ~$30 | 신규 |
| LLM API (GPT-4o-mini) | ~$3-10 | 1000 쿼리/일 기준 |
| Cohere Rerank | ~$1-5 | 1000 쿼리/일 기준 |
| Supabase | 기존 | pgvector 추가 비용 없음 |
| LangSmith | $0 | 무료 티어 (5K traces/월) |
| **합계** | **~$50-60/월** | |

### 일회성 비용

| 항목 | 비용 | 비고 |
|------|------|------|
| GPU 배치 분석 (Phase 0) | ~$5-10 | g5.xlarge Spot 3-4시간 |
| BGE-M3 임베딩 배치 (Phase 2) | ~$0 | CPU로 충분, 기존 EC2에서 실행 |

현재 AWS 크레딧 $950 기준 → **약 15개월 운영 가능**

---

## 10. NOT in scope

이 로드맵에서 다루지 않는 것:

- GPU 상시 서빙 (비용 대비 효과 없음)
- 자체 LLM 학습/파인튜닝 (데이터 규모 부족)
- 다국어 지원 (한국어 + 영어 only)
- 모바일 앱
- 실시간 크롤링 연동
- 유저 인증/결제 시스템
- Spring Boot 백엔드 도입 (Next.js + FastAPI로 충분)
