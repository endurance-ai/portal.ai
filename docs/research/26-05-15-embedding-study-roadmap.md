# 임베딩 학습 로드맵 — brand vector 설계 결정용

> 목적: SPEC-SEARCH-V6 의 **Q1 결정** (brand multimodal vector 를 어떻게 만들까) 을
> 스스로 판단할 수 있는 최소 지식 습득. 총 3시간.
> 작성: 2026-05-15

---

## 결정해야 할 것 (Q1)

brand 의 "정체성"을 나타내는 768-dim vector 를 어떻게 만들까?

| 옵션 | 정의 | 특징 |
|---|---|---|
| **B** | `AVG(products.embedding WHERE brand_node_id=X)` 전수 평균 | robust, 비용 0 (products 91% 이미 임베딩됨), generic 수렴 위험 |
| **A** | representative 1~10장 + attributes text chunk 평균 | 큐레이션 sharp, sparse noise |
| **C** | `0.4×B + 0.6×A` hybrid | 둘의 중간 |

→ 학습 후 이 trade-off 를 이해하고 선택.

---

## 3시간 커리큘럼

### 🟢 Block 1 (0:00–0:35) — 임베딩 / 벡터 / cosine 기초
필수. 없으면 나머지 안 들어옴.

- 🎥 [3Blue1Brown — How word vectors encode meaning](https://www.youtube.com/shorts/FJtFZwbvkI4) (5분)
- 🎥 [3Blue1Brown YouTube 채널](https://www.youtube.com/c/3blue1brown) — GPT 시리즈 embedding 파트
- 📄 [Pinecone — Sentence Embeddings 시리즈](https://www.pinecone.io/learn/series/nlp/sentence-embeddings/) (20분)
- 📄 [Medium — Cosine Similarity and Word Embeddings](https://spencerporter2.medium.com/understanding-cosine-similarity-and-word-embeddings-dbf19362a3c) (10분)

핵심: 벡터 = 의미 좌표, cosine = 유사도 (1=동일, 0=무관).
연결: brand 유사도 = brand vector 끼리 cosine. clustering/추천의 수학 기반.

### 🟢 Block 2 (0:35–1:15) — CLIP / SigLIP
이미지+텍스트가 같은 공간인 이유.

- 📄 [OpenAI — CLIP: Connecting text and images](https://openai.com/index/clip/) (15분)
- 📄 [Hugging Face — Computer Vision Course: CLIP](https://huggingface.co/learn/computer-vision-course/en/unit4/multimodal-models/clip-and-relatives/clip) (20분, 그림 多)
- 📄 [Medium — SigLIP vs CLIP: The Sigmoid Advantage](https://medium.com/@jiangmen28/siglip-vs-clip-the-sigmoid-advantage-457f1cb872ab) (10분)
- 📄 [SigLIP 논문 (arXiv 2303.15343)](https://arxiv.org/abs/2303.15343) (선택, 깊이)

핵심: 이미지 vector ≈ 텍스트 vector (같은 768차원). 그래서 평균 가능.
연결: Q1 의 "product 이미지 평균" 이 valid 한 이유.

### 🟡 Block 3 (1:15–1:50) — Aggregation / Mean Pooling ⭐ Q1 핵심
여러 개(product N) → 하나(brand 1) 합치는 방법. 결정의 본질.

- 📄 [hackerllama — Sentence Embeddings Introduction](https://osanseviero.github.io/hackerllama/blog/posts/sentence_embeddings/) (20분) ← **이것만은 꼭**
- 📄 [ML6 — pooling methods](https://www.ml6.eu/en/blog/sentence-embeddings-pooling-methods-compressed-representations-nlp-cosine-similarity) (15분)

핵심: mean pooling = 평균 = centroid. N 클수록 robust but generic.
연결: B(전수평균)=N 큼=robust/generic. A(큐레이션)=N 작음=sharp/variance. **bias-variance trade-off**.

### 🟡 Block 4 (1:50–2:25) — FashionCLIP / Marqo
generic CLIP 안 쓰고 FashionSigLIP 쓰는 이유.

- 📄 [Marqo — Embedding Models for Ecommerce](https://www.marqo.ai/blog/search-model-for-fashion) (15분) — 우리가 쓰는 그 모델
- 📄 [TDS — Teaching CLIP Some Fashion](https://towardsdatascience.com/teaching-clip-some-fashion-3005ac3fdcc3/) (15분)
- 📄 [Width.ai — Product Similarity Search with Fashion CLIP](https://www.width.ai/post/product-similarity-search-with-fashion-clip) (10분) — 우리와 같은 use case

핵심: 패션 fine-tune 이 일반 CLIP 대비 +18% 우위.
연결: brand/product 임베딩 품질 근거.

### 🟢 Block 5 (2:25–2:50) — pgvector / HNSW (가볍게)

- 📄 [Neon — vector search and HNSW with pgvector](https://neon.com/blog/understanding-vector-search-and-hnsw-index-with-pgvector) (15분)
- 📄 [Crunchy Data — HNSW Indexes with Postgres](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector) (10분)

핵심: HNSW = 빠른 근사 top-K. 연결: brand_multimodal_embeddings 인덱스 동작 원리.

### 🔴 Block 6 (2:50–3:00) — Q1 의사결정

판단 기준:
1. 우리 brand 들 product 다양성 큰가? → 크면 B 의 generic 위험 → A/C
2. representative 선정 (crawler) 신뢰 가능한가? → 아니면 B 안전
3. 텍스트 신호(attributes) 필요한가? → 필요하면 A/C, 순수 시각이면 B

---

## 1시간 압축 버전
- Block 1: 3Blue1Brown 영상 (5분)
- Block 2: HF CLIP course (20분)
- Block 3: hackerllama (20분) ← 필수
- Block 6: 결정 프레임 (15분)

---

## 결정 후 다음 액션 (HANDOFF.md 참조)
Q1 결정 → brand 풀배치 → centroid → adjacency → SPEC 5 P1~P5 코드.
