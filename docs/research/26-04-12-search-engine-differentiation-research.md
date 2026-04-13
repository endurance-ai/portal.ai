# 검색 엔진 차별화를 위한 리서치 종합

> 작성일: 2026-04-12
> 목적: "니치 취향 에이전트"를 위한 검색 엔진 레시피 도출
> 핵심 질문: Daydream이 "넓고 세련된 패션 쇼핑 에이전트"라면, 우리는 어떤 기술 구조로 "아주 구체적인 취향을 끝까지 이해하는 에이전트"가 될 수 있는가?

---

## 1. 문제 정의: 우리가 풀어야 하는 검색 문제

### 유저의 실제 질문

> "발렌시아가 마이애미 더비 같은 제품인데, 그것보다 저렴한 제품을 찾아줘"

이것을 시스템이 이해해야 하는 형태로 분해하면:

```
레퍼런스 제품: 발렌시아가 마이애미 더비
  ↓ (AI가 해체)
핵심 속성 추출:
  - 카테고리: 더비슈즈
  - 앞코 쉐입: 길고 세련된 (elongated, sexy)
  - 토 스타일: 약간의 스퀘어토 (mild square toe)
  - 느낌: 클래식 + 약간 캐주얼 (청바지 매치 가능)
  - 스타일 노드: contemporary / minimalist
  - 가격대: < 발렌시아가 가격
  ↓ (속성 우선순위화)
"이 제품을 이 제품답게 만드는" 핵심 속성:
  1순위: 앞코 쉐입 (가장 distinctive)
  2순위: 스퀘어토 정도
  3순위: 더비 실루엣
  4순위: 클래식+캐주얼 밸런스
  ↓ (대체품 검색)
이 속성 조합을 가진 다른 브랜드 제품 (가격 필터 적용)
```

### 기존 검색과의 차이

| 기존 검색 (Daydream 포함) | 우리가 목표하는 검색 |
|-------------------------|----------------|
| "뭘 찾으세요?" | "이 제품에서 진짜 좋아한 건 뭔가?" |
| 유저 프로필 + 자연어 → 카탈로그 매칭 | 레퍼런스 제품 분석 → 속성 해체 → 우선순위화 → 대체품 |
| 많은 결과 중 고르기 | 적지만 핵심을 배신하지 않는 결과 |
| 첫 발견(discovery)에 강함 | 재탐색(re-exploration)에 강함 |

---

## 2. 에이전틱 커머스 동향이 시사하는 것

### 2.1 양면적 데이터 구조화 (어센트코리아)

모든 상품 데이터가 두 층으로 존재해야 함:

| 레이어 | 용도 | portal.ai 매핑 |
|--------|------|---------------|
| **Agent-Readable** | AI가 필터/비교/실행 | product_enums, product_ai_analysis, fashion-genome |
| **Consumer-Readable** | 인간이 납득/설득 | 매칭 이유 칩, ProductCard 설명 |

**시사점**: 우리의 enum 체계 + AI 분석이 이미 Agent-Readable 레이어. Consumer-Readable 서사 품질을 높이면 전환율 직접 개선.

### 2.2 목적 특화형 AI 에이전트 > 범용 (데이터라이즈)

> "범용 에이전트보다 목적 특화형 에이전트가 효과적"

이것이 우리의 "니치 취향 에이전트" 포지셔닝을 정당화하는 핵심 근거.
- ChatGPT Shopping: 범용 → 패션 도메인 지식 깊이 부족
- Google UCP: 가장 큰 상품 DB → 니치 취향 해석 약함
- Daydream: 패션 특화 → 하지만 매스 타겟
- **portal.ai: 패션 + 니치 취향 특화 → 가장 좁고 깊음**

### 2.3 LLM 가성비 아키텍처

상품 데이터가 풍부할수록 LLM 호출 감소:
- 구조화된 속성 데이터로 비교/필터링 (저비용)
- **추론이 필요한 순간에만 LLM 호출** (고비용)

→ 우리의 현재 구조 (enum 매칭 + LLM은 분석에만)가 이미 이 설계.

---

## 3. 최신 연구에서 찾은 핵심 기술들

### 3.1 Attribute-Specific Embedding Network (ASEN)

**출처**: IEEE/AAAI — Fine-Grained Fashion Similarity Learning

```
일반적인 visual search:
이미지 → 글로벌 임베딩 → 전체 유사도 계산

ASEN 방식:
이미지 → 속성별 임베딩 (색상 / 핏 / 소재 / 디테일 ...)
       → 특정 속성 기준으로 유사 상품 검색
       → "이 재킷과 핏감이 비슷한 다른 재킷" 가능
```

**왜 중요한가**: "발렌시아가 마이애미 더비 같은 것"을 찾을 때, 글로벌 유사도가 아니라 **"앞코 쉐입"이라는 특정 속성에서의 유사도**가 핵심. ASEN은 이것을 가능하게 하는 아키텍처.

### 3.2 FashionCLIP / Visual Embedding

**출처**: LookSync (arxiv 2511.00072) — 프로덕션 규모 visual search

```
파이프라인:
이미지 → LLM으로 enhanced search query 생성
       → CLIP 벡터화 (이미지+텍스트 같은 공간)
       → 벡터 DB에서 candidate retrieval
       → 리랭킹 (domain-specific rules)
```

- CLIP이 대안 모델 대비 3~7% 높은 mean opinion score
- **FashionCLIP**: CLIP을 패션 도메인에 fine-tune한 변형
- **FashionSigLIP**, **DINOv2**: 대안 embedding 모델

**왜 중요한가**: 현재 우리는 "텍스트로 변환한 속성"으로만 매칭. 이미지 자체의 시각적 뉘앙스 (앞코의 미묘한 커브, 가죽의 광택감 등)는 텍스트로 완전히 표현 불가. Visual embedding이 이 갭을 채움.

### 3.3 Fashionpedia — 패션 도메인 온톨로지

**출처**: arxiv 2004.12276 (사실상 de facto standard)

```
27개 main apparel categories
  + 19개 apparel parts (collar, sleeve, pocket, hem, ...)
  + 294개 fine-grained attributes
  + 관계 정의 (has-part, compatible-with, ...)
  + 48K 이미지에 segmentation mask 어노테이션
```

**왜 중요한가**: 우리의 현재 enum 체계 (subcategory, colorFamily, fit, fabric, season, pattern)는 **~50개 수준**. Fashionpedia의 294개 fine-grained attributes를 참조하면 **apparel parts** (collar type, sleeve length, pocket style, toe shape 등)의 세분화가 가능.

"앞코가 긴 스퀘어토 더비"를 검색하려면, "toe_shape: elongated_square"라는 속성이 시스템에 존재해야 함.

### 3.4 Fashion Knowledge Graph

```
현재 portal.ai:
fashion-genome (15 style nodes)
  + brand_nodes (브랜드별 스타일 DNA)
  + korean-vocab.ts (한국어 → enum 매핑)
  + color-adjacency (색상 인접 맵)
  + style-adjacency (스타일 유사도 맵)

→ 사실상 "경량 knowledge graph"이지만, 구조화되지 않음
```

체계적 Knowledge Graph가 되려면:
- **노드**: 아이템, 속성, 브랜드, 스타일, 시즌, occasion
- **엣지**: has-attribute, similar-to, compatible-with, alternative-to, same-brand-dna
- **가중치**: 각 관계의 강도 (브랜드 DNA 유사도, 속성 매칭 정도)

### 3.5 PAE (LLM-based Product Attribute Extraction)

**출처**: arxiv 2405.17533

- BERT representation 기반 catalog matching
- 8개 속성 추출: Color, Sleeve Style, Product Type, Material, Features, Categories, Age, Neck
- **평균 92.5% F1-Score**
- 텍스트 + 이미지 멀티모달 처리

**왜 중요한가**: 우리의 product_ai_analysis 자동화 파이프라인 고도화에 직접 적용 가능. 크롤링된 26,000+ 상품의 비정형 설명에서 구조화된 속성을 더 정확하게 자동 추출.

---

## 4. Daydream vs portal.ai: 구조 비교

### 4.1 검색 파이프라인 비교

```
┌─── Daydream ────────────────────────────────────┐
│                                                  │
│  유저 쿼리 → Ensemble AI (12 models)              │
│    → Intent Understanding (합의 기반)             │
│    → Fashion Knowledge Graph (어휘 변환)          │
│    → Hybrid Search (Lexical + Vector + Image)    │
│    → 결과 (200만 상품 풀)                         │
│                                                  │
│  강점: 규모, 다양한 검색 모달리티, 깊은 자금력      │
│  약점: 매스 타겟, 재탐색 구조 없음                  │
└──────────────────────────────────────────────────┘

┌─── portal.ai (현재) ────────────────────────────┐
│                                                  │
│  이미지/프롬프트 → GPT-4o-mini Vision             │
│    → 텍스트 속성 추출 (enum 체계)                  │
│    → 검색 엔진 v4 (enum 매칭 + gradient scoring)  │
│    → 결과 (2.6만 상품 풀)                         │
│                                                  │
│  강점: 룩 분해, 속성 기반 설명, 크로스 가격대       │
│  약점: vector search 없음, 상품 풀 작음            │
└──────────────────────────────────────────────────┘

┌─── portal.ai (목표) ────────────────────────────┐
│                                                  │
│  레퍼런스 제품 (이미지/URL/이름)                    │
│    ↓                                             │
│  [속성 해체 엔진]                                  │
│    - GPT-4o Vision: 텍스트 속성 추출               │
│    - FashionCLIP: 시각적 임베딩 생성               │
│    - Fashionpedia 참조: fine-grained 속성 분류     │
│    ↓                                             │
│  [속성 우선순위화]                                  │
│    - "이 제품을 이 제품답게 만드는" 속성 식별         │
│    - 유저 컨텍스트 반영 (가격 제약, 선호 브랜드)     │
│    ↓                                             │
│  [Hybrid Search]                                  │
│    - Enum 매칭 (구조화된 속성)                     │
│    - Vector Similarity (시각적 뉘앙스)             │
│    - Brand DNA Scoring (스타일 그래프)             │
│    ↓                                             │
│  [대체 가능성 설명]                                 │
│    - "이 제품은 앞코 쉐입이 80% 유사하며,           │
│      더 캐주얼한 느낌입니다"                        │
│    - 속성별 매칭/차이 시각화                        │
│                                                  │
│  강점: 니치 취향 해체력, 설명 가능성, 재탐색 구조    │
└──────────────────────────────────────────────────┘
```

### 4.2 핵심 차이점 요약

| 차원 | Daydream | portal.ai (목표) |
|------|----------|-----------------|
| **질문의 중심** | "뭘 찾으세요?" | "이 제품에서 진짜 좋아한 건?" |
| **검색 기준** | 유저 프로필 + 쿼리 | 레퍼런스 제품 속성 |
| **속성 해상도** | 범용적 (formality, color, occasion) | **Fine-grained** (toe shape, fabric sheen, silhouette curve) |
| **결과 설명** | 불분명 | 속성별 매칭/차이 명시 |
| **타겟** | 매스 (럭셔리 중심) | 니치 취향 트렌드세터 |
| **가격 축** | 프리미엄 중심 | **크로스 가격대** (대안/저가 제품 적극 탐색) |

---

## 5. "왜 우리만 이걸 잘 할 수 있는가?"에 대한 기술적 답변 (초안)

### 5.1 이미 갖춘 것

1. **Fashion Genome (15 style nodes + 12 sensitivity tags)**: 패션 감도를 구조화한 자체 온톨로지
2. **Product AI Analysis 파이프라인**: 26,000+ 상품에 대한 AI 속성 분석 인프라
3. **Enum 체계 (product-enums + korean-vocab + color-adjacency + style-adjacency)**: Agent-Readable 데이터 레이어
4. **Look Decomposition**: 이미지 → 아이템별 분해 + 핫스팟 — Daydream에 없음
5. **크로스플랫폼 크롤링 (22개 편집샵)**: 자사몰에 묶이지 않는 독립적 상품 풀
6. **검색 품질 평가 인프라 (eval-search.ts, golden set)**: 정량적 개선 루프

### 5.2 만들어야 하는 것 (레시피의 핵심)

| 구성 요소 | 설명 | Daydream 대비 차별점 |
|----------|------|---------------------|
| **속성 해체 엔진** | 레퍼런스 제품에서 "이 제품을 이 제품답게 만드는" fine-grained 속성을 자동 추출 | Daydream은 유저 쿼리 해석에 집중, 우리는 제품 자체의 미학적 핵심 해체에 집중 |
| **속성 우선순위화 모델** | 추출된 속성 중 어떤 것이 핵심인지 판단 (e.g., 발렌시아가 마이애미 더비 → "앞코 쉐입"이 최우선) | 이것을 할 수 있는 플레이어가 현재 없음 |
| **Hybrid Search (Enum + Vector)** | 구조화 속성 매칭 + 시각적 임베딩 유사도를 결합 | Daydream도 hybrid하지만, 우리는 "특정 속성 기준" 검색이 가능 |
| **Fine-grained Enum 확장** | Fashionpedia 참조하여 apparel parts (toe shape, collar type 등) 세분화 | 현재 아무도 이 수준까지 안 함 |
| **대체 가능성 설명 엔진** | "이 제품은 레퍼런스 대비 앞코 쉐입 80% 유사, 소재 다름" 같은 비교 설명 | "왜 이것을 추천했는가"의 설득력 |

### 5.3 기술 로드맵 (제안)

```
Phase 1: 속성 해상도 높이기 (현재 → 2~3개월)
  - Fashionpedia 참조하여 apparel parts enum 확장
  - product_ai_analysis 자동화 파이프라인 강화 (PAE 프레임워크 참조)
  - 매칭 이유 서사 품질 향상

Phase 2: Visual Embedding 도입 (3~5개월)
  - FashionCLIP으로 상품 이미지 임베딩 생성
  - Supabase pgvector 활용 벡터 저장/검색
  - Enum 매칭 + Vector 유사도 hybrid scoring

Phase 3: 속성 해체 + 우선순위화 (5~7개월)
  - "레퍼런스 제품 입력 → 핵심 속성 해체" 파이프라인
  - 속성 우선순위화 모델 (어떤 속성이 이 제품의 identity인가)
  - "대안 찾기" 전용 검색 모드

Phase 4: 니치 Knowledge Graph (7~12개월)
  - 서브컬처 브랜드 그래프 (브랜드-스타일-가격대 관계)
  - 아이템-속성-대체관계 그래프
  - 유저 취향 프로필 (세션 누적 기반)
```

---

## 6. 참고할 만한 후속 논문 및 자료

### 직접 관련 논문

| 논문 | 핵심 | 관련성 |
|------|------|--------|
| **ASEN** (IEEE/AAAI) | Attribute-Specific Embedding Network | 속성별 유사도 검색의 핵심 아키텍처 |
| **Fashionpedia** (arxiv 2004.12276) | 27 categories + 294 fine-grained attributes | Enum 확장의 참조 온톨로지 |
| **LookSync** (arxiv 2511.00072) | 프로덕션 규모 visual search (CLIP 기반) | Visual embedding 도입 참조 아키텍처 |
| **PAE** (arxiv 2405.17533) | LLM-based Product Attribute Extraction | product_ai_analysis 자동화 |
| **Fashion DNA** [8] (arxiv 1609.02489) | content + sales data로 item DNA 생성 | brand_nodes 고도화 참조 |

### 원본 서베이 논문에서 우리에게 가장 관련성 높은 레퍼런스

| 번호 | 저자 | 제목 | 왜 중요한가 |
|------|------|------|-----------|
| [54] | Hou et al. | Semantic attribute visual space | fine-grained 속성별 유사도 — 우리의 핵심 방향 |
| [175] | Yang et al. | Decision tree + rich attribute matching | 해석 가능한 속성 기반 매칭 |
| [157] | Tan et al. | Type-specific compatibility spaces | 카테고리별 다른 매칭 기준 |
| [174] | Yang et al. | Heterogeneous graph (구매+뷰 관계) | Knowledge Graph 설계 참조 |
| [142] | Song et al. | Knowledge distillation for matching | 전문가 지식 → 모델 통합 |

### 에이전틱 커머스 참고 자료

| 자료 | 핵심 시사점 |
|------|-----------|
| [어센트코리아: 에이전틱 커머스](https://www.ascentkorea.com/what-is-agentic-commerce/) | 양면적 데이터 구조화 — 우리의 enum 체계가 이미 이 방향 |
| [데이터라이즈: 에이전틱 커머스](https://www.datarize.ai/ko/blog/agentic) | "목적 특화형 에이전트 > 범용" — 니치 포지셔닝 정당화 |
| [Google UCP](https://developers.google.com/merchant/ucp/) | 상품 데이터 표준화 트렌드 — 중기 대응 필요 |
| [OpenAI ACP](https://openai.com/index/buy-it-in-chatgpt/) | Agentic Checkout 프로토콜 — 장기 모니터링 |

---

## 7. 스냅덱 비유로 정리

팀에서 논의한 스냅덱 비유를 검색 엔진에 적용하면:

| 스냅덱 (PPT) | portal.ai (패션 검색) |
|-------------|---------------------|
| 기존: 템플릿 안에 텍스트 생성 → AI 티 많이 남 | 기존: 카탈로그에서 키워드 매칭 → 취향 반영 안 됨 |
| 스냅덱: LLM이 코드로 슬라이드를 그림 → 100% 유저 의도 반영 | portal.ai: AI가 제품의 미학적 핵심을 해체 → 취향을 배신하지 않는 대안 |
| 레시피: 컨텍스트 엔지니어링 + 오케스트레이션 | 레시피: **속성 해체 + 우선순위화 + hybrid search + 설명** |
| 증명: 12.4만 장 생성, PH 1위 | 증명: **만들어야 함 (트랙션이 레시피를 증명)** |

---

## 8. 다음 단계 제안

### 팀 논의가 필요한 질문

1. **"재탐색 자동화" vs "니치 추천"**: 둘 다 추구하되, 기술적으로는 "니치 추천 품질"이 선행 → 그 위에 "재탐색 자동화" 구조를 얹는 것이 자연스러움
2. **Phase 1의 우선순위**: Fashionpedia 기반 enum 확장이 가장 낮은 비용으로 높은 임팩트
3. **Visual Embedding 도입 시점**: 현재 상품 풀 (26K)에서도 의미 있는지, 아니면 상품 풀 확대 후가 나은지
4. **에세이 반영**: "우리만의 레시피"를 기술적으로 설명할 수 있는 수준까지 구체화 필요

### 즉시 실행 가능한 것

- [ ] Fashionpedia 294 attributes 리스트 다운로드 → 현재 enum과 갭 분석
- [ ] FashionCLIP 모델 테스트 (HuggingFace에서 가져와서 샘플 상품 임베딩)
- [ ] eval-search.ts에 attribute-level precision 메트릭 추가
- [ ] "레퍼런스 제품 입력 → 속성 해체" 프롬프트 프로토타입

---

> 이 문서는 팀 논의용이며, 연구/기술 방향의 초안입니다.
> 관련 문서: [논문 서베이](./26-04-12-fashion-recommendation-survey.md), [데이드림 분석](./26-04-12-daydream-competitive-analysis.md)
