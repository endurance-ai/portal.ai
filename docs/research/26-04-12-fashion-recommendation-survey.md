# 패션 추천 기술 서베이 — 논문 분석 요약

> 작성일: 2026-04-12
> 원본: "Computational Technologies for Fashion Recommendation: A Survey" (Ding et al., ACM Computing Surveys, 2023)
> 목적: 패션 추천 기술 전체 지형 파악 → portal.ai 검색 엔진 고도화를 위한 학술적 기반 마련

---

## 1. 패션 추천의 4대 분류

논문은 패션 추천을 크게 **Product Recommendation**과 **Outfit Recommendation** 두 축으로 나누고, 각각을 다시 세분화한다.

```
Fashion Recommendation
├── Product Recommendation
│   ├── Personalized (PFR) — Section 3
│   └── Complementary (CFR) — Section 4
├── Outfit Recommendation (FOR) — Section 5
└── Special Recommendation (SPR) — Section 6
    ├── Body Shape 기반
    ├── Size 추천
    └── 날씨/장소/상황 기반
```

---

## 2. 개인화 패션 추천 (PFR) — Section 3

### 핵심 문제
유저 u와 아이템 i에 대해 개인화 점수 `s(u,i) = f(u,i)`를 예측하는 것.

### 주요 방법론 진화

| 세대 | 방법 | 핵심 아이디어 |
|------|------|-------------|
| 1세대 | MF-BPR | Matrix Factorization + Bayesian Personalized Ranking. 유저-아이템 임베딩 내적 |
| 2세대 | VBPR | Visual BPR — CNN으로 추출한 **시각 특징**을 BPR에 통합. "사진 안 보고 옷 안 산다" |
| 3세대 | VBPR + Aesthetic | 미적(aesthetic) 특징 추가 — "이게 뭔가" + "이게 예쁜가" 동시 모델링 |
| 4세대 | Attribute-specific | 의미 속성(semantic attribute) 공간 학습 — 색상/소재/핏별 fine-grained 선호 |

### portal.ai 시사점

**VBPR + Attribute-specific 접근법이 우리의 "니치 취향 에이전트"에 핵심적.**

현재 우리: GPT-4o-mini Vision → 텍스트 속성 추출 → enum 매칭
논문이 제시하는 방향: **이미지 자체에서 다차원 visual embedding 추출 → 속성별 유사도 벡터 공간에서 직접 계산**

특히 Hou et al. [54]의 **semantic attribute visual space**가 주목할 만함:
- 각 차원이 하나의 속성(색상, 핏, 소재 등)에 대응
- fine-grained 선호를 캡처할 수 있음
- **설명 가능한 추천**이 자연스럽게 따라옴 (어떤 속성이 매치되었는지 보여줄 수 있음)

---

## 3. 보완 추천 / 코디 추천 (CFR) — Section 4

### 핵심 문제
주어진 아이템 i에 **호환되는(compatible)** 다른 아이템을 추천. "이 상의에 어울리는 하의는?"

### Compatibility ≠ Similarity
- **Similarity**: 비슷한 아이템 찾기 (같은 카테고리 내)
- **Compatibility**: 어울리는 아이템 찾기 (다른 카테고리 간)
- 이 둘은 수학적으로 다름 — similarity는 transitive하지만 compatibility는 아님

### 3대 접근법

#### 3.1 Topic Model (LDA 기반)
- 아웃핏을 document, 속성을 word로 간주
- 잘 어울리는 아이템 쌍은 topic proportion이 유사
- 한계: 너무 단순, 비주얼 정보 활용 미흡

#### 3.2 Metric Learning
- 핵심 3단계: (1) compatible/incompatible 데이터 수집 (2) 유사도 함수 설계 (3) compatible이 더 가까워지도록 학습
- **type-specific compatibility space** [48, 157]: 카테고리 쌍마다 다른 공간에서 호환성 측정
- 이유: "상의-하의" 호환성과 "상의-신발" 호환성은 기준이 다름

#### 3.3 Graph-based
- **Knowledge Graph** + GNN이 최신 트렌드
- TransE/TransR로 아이템 간 호환성 관계 모델링
- Graph Auto-encoder (GAE)로 맥락 정보(같이 코디된 아이템, 같이 본 아이템) 통합
- **Yang et al. [174]**: 구매 관계 + 같이 본 관계를 heterogeneous graph로 모델링

### portal.ai 시사점

**우리의 "발렌시아가 마이애미 더비 비슷하지만 저렴한 것" 문제는 CFR의 변형.**

다만 기존 CFR은 "다른 카테고리" 간 호환인데, 우리는 **"같은 카테고리 내 fine-grained 대체품"** 찾기.
이것은 순수 similarity도 아니고 compatibility도 아닌, **"attribute-level substitutability"**라는 특수한 문제.

필요한 것:
1. 레퍼런스 제품의 핵심 속성을 해체 (앞코 쉐입, 스퀘어토 정도, 더비 실루엣 등)
2. 각 속성의 중요도 가중치 판단 (어떤 속성이 "이 제품을 이 제품답게 만드는가")
3. 해당 속성 조합을 가진 대체품을 가격 필터와 함께 검색

---

## 4. 아웃핏 추천 (FOR) — Section 5

### 파이프라인 (3단계)

```
Item Embedding Generation → Outfit Modeling → Compatibility Discrimination
(아이템 특징 추출)       (아웃핏 구조 모델링)    (호환성 판별)
```

### Outfit Modeling 방법론

| 방법 | 장점 | 단점 |
|------|------|------|
| Non-parametric Pooling | 단순, 효율적 | 아이템 간 복잡한 관계 못 잡음 |
| Sequence Modeling (Bi-LSTM) | 순서 관계 모델링 | 아웃핏은 순서 없음 → 부적합 |
| **Graph Modeling (GNN)** | 복잡한 관계 탐색, 순서 무관 | 연산 비용 높음 |
| **Attention/Transformer** | 유연한 set modeling, SOTA | 데이터 많이 필요 |

### 핵심 모델: Fashion Outfit Model (FOM)
- Chen et al. [13]: Transformer 기반, masked item prediction으로 학습
- OutfitTransformer [129]: outfit token + item token → global outfit representation

### portal.ai 시사점

**현재 우리는 "룩 분해" (이미지 → 개별 아이템)를 하고 있지만, "아웃핏 추천" (이 룩에 어울리는 다른 아이템)은 아직 없음.**

향후 "이 룩에서 신발만 바꾸고 싶어" 같은 니즈를 위해 아웃핏 호환성 모델 도입을 검토할 수 있음.
단, 현재 단계에서는 오버엔지니어링 — 우선 단일 아이템 대체품 검색 품질부터 확보.

---

## 5. 특수 추천 (SPR) — Section 6

### 5.1 체형 기반 추천
- body shape 추정 + clothing-body affinity 학습
- 아직 초기 단계, 데이터 부족이 큰 병목
- Hisao et al. [56]: visual body-aware embedding + CNN + SMPL 3D body 모델

### 5.2 사이즈 추천
- Product Size Embedding (PSE) [29]: 제품별 사이즈 편차를 latent space에 모델링
- 브랜드마다 사이즈 기준이 달라서 사실상 brand-specific 모델 필요
- **우리 팀이 언급한 "온라인에서 핏/사이즈감을 알 수 없다" 문제의 학술적 접근**

### 5.3 상황/occasion 기반 추천
- 날씨, 장소, 상황(wedding, casual brunch, office)에 맞는 추천
- SVM 기반 feature-occasion-attribute 모델링 [99]
- scene-aware: 아웃핏 이미지의 **배경 장면**도 호환성에 영향

### portal.ai 시사점

사이즈 추천은 팀이 인식한 고객 pain point이지만, 기술적으로 매우 어렵고 데이터 의존도가 높음.
**현 단계에서는 "사이즈 정보 표시"에 집중하고, 추천 로직은 후순위.**

occasion 기반 추천은 이미 우리의 mood/occasion 분석과 맞닿아 있음 — 강화 가능 영역.

---

## 6. 평가 방법론 — Section 7

### 주요 평가 Task

| Task | 설명 | 주요 메트릭 |
|------|------|-----------|
| **PCR** (Pairwise Complementary) | 두 아이템이 호환되는지 | AUC |
| **FITB** (Fill-In-The-Blank) | 빈 슬롯에 맞는 아이템 고르기 | Top-1 Accuracy |
| **OP** (Outfit Prediction) | 아웃핏 전체의 호환성 점수 | AUC |
| **Top-K Ranking** | K개 추천 목록의 품질 | Recall@K, MRR@K, NDCG@K |

### 주요 데이터셋

| 데이터셋 | 규모 | 특징 |
|---------|------|------|
| Polyvore | 644K 아이템, 409K 아웃핏 | 가장 많이 사용, 유저가 만든 코디 |
| Amazon Fashion | 1.5M 아이템 | 실제 구매 데이터, 리뷰 포함 |
| iFashion (Taobao) | 3.6M 유저, 4.5M 아이템 | 클릭 시퀀스 데이터 |
| IQON3000 | 672K 아이템 | 일본 패션, likes 데이터 |

### portal.ai 시사점

**우리의 eval 파이프라인 (eval-search.ts, eval-prompt-v2.ts)은 이미 좋은 출발점.**
학술적 평가 프로토콜을 참고해서:
- Golden set 기반 Recall@7 (상위 7개 결과의 관련성)
- Attribute-level precision (요청한 속성이 실제로 매칭되는 비율)
- 이 두 가지를 체계화하면 검색 엔진 개선의 정량적 근거를 만들 수 있음

---

## 7. 미래 연구 방향 & 미해결 과제 — Section 8

논문이 제시하는 5대 미래 방향:

### 7.1 설명 가능한 추천 (Explainability)
> "왜 이 아이템이 추천되었는지 설명할 수 없는 것이 현재 가장 큰 한계"

- Knowledge Graph + attention mechanism이 유력 접근
- visual explanation (이미지의 어느 부분이 매칭 근거인지)도 중요

**→ 우리의 "매칭 이유 칩"이 이미 이 방향. 더 정교하게 만들 수 있음.**

### 7.2 도메인 지식 통합 (Fashion Domain Knowledge)
> "데이터 기반 방법만으로는 한계, 패션 전문가의 규칙과 지식을 통합해야"

- Fashion Knowledge Extraction: 이미지/텍스트/메타데이터에서 구조화된 지식 추출
- Knowledge Distillation: 전문가 규칙을 모델에 증류

**→ 우리의 fashion-genome (15 style nodes + 12 sensitivity tags)이 정확히 이 역할. Daydream도 사내 패션 전문가를 두고 training data 생성 중.**

### 7.3 이종 데이터 & 다중 행동 모델링
- implicit feedback, 리뷰 텍스트, 아이템 속성, 아이템 관계를 동시에 모델링
- **Heterogeneous Graph Neural Network (HGNN)**이 유망
- 유저의 다양한 행동 (클릭, 저장, 구매, 리뷰)을 차별적으로 학습

### 7.4 견고한 벤치마크 부재
- 패션 추천에 표준 벤치마크가 없음
- 대부분 Polyvore 기반인데, Polyvore는 이미 서비스 종료
- 실제 이커머스 데이터 기반 벤치마크 필요

### 7.5 학계-산업 간극
- 학계: 알고리즘 정확도에 집중
- 산업: 실시간 응답, 비용, 확장성, 콜드스타트에 집중
- **옴니채널 추천** (여러 플랫폼의 유저 행동을 통합)이 실용적으로 중요하지만 연구 부족

**→ 우리의 크로스플랫폼 (22개 편집샵) 구조가 학계에서도 미개척인 영역.**

---

## 8. 핵심 기술 용어 정리

| 용어 | 설명 | portal.ai 매핑 |
|------|------|---------------|
| Collaborative Filtering (CF) | 유저-아이템 상호작용 기반 추천 | 아직 미도입 (유저 데이터 부족) |
| Content-Based Filtering | 아이템 속성 기반 추천 | **현재 우리의 핵심 방식** (enum 매칭) |
| Visual Semantic Embedding (VSE) | 이미지+텍스트를 같은 벡터 공간에 매핑 | 미도입 → 향후 FashionCLIP으로 가능 |
| Knowledge Graph (KG) | 엔티티-관계 그래프로 도메인 지식 구조화 | fashion-genome + brand_nodes가 경량 버전 |
| Graph Neural Network (GNN) | 그래프 구조에서 메시지 패싱으로 학습 | 미도입 |
| Metric Learning | 유사/비유사 아이템의 거리를 학습 | 미도입 → vector search 도입 시 핵심 |
| BPR (Bayesian Personalized Ranking) | 유저별 아이템 순위 최적화 | 미도입 (개인화 미시작) |
| Cold Start | 신규 아이템/유저에 대한 추천 한계 | **우리에게 핵심 과제** — 비주얼 피처로 완화 가능 |

---

## 9. 결론: portal.ai에 가장 관련성 높은 기술 방향

| 우선순위 | 기술 | 이유 | 복잡도 |
|---------|------|------|--------|
| **P0** | Attribute-specific Embedding | "이 제품의 어떤 점이 좋은가"를 구조적으로 해체 — 니치 취향 에이전트의 핵심 | High |
| **P0** | Fashion Knowledge Graph 강화 | style nodes + brand DNA + 아이템 속성 관계를 그래프로 체계화 | Medium |
| **P1** | Visual Embedding (FashionCLIP) | 이미지 기반 유사도 검색 레이어 추가 → hybrid search | Medium |
| **P1** | Explainable Recommendation 강화 | "왜 이 제품인지" 설명 품질 향상 → 전환율 직결 | Low |
| **P2** | Outfit Compatibility Modeling | "이 룩에서 하나만 바꾸기" 기능 — 현재는 오버스펙 | High |
| **P2** | Personalization (CF 도입) | 유저 행동 데이터 축적 후 개인화 — 현재 데이터 부족 | High |

---

> 이 문서는 팀 내부 논의용이며, 원본 논문의 전체 내용을 포함하지 않습니다.
> 논문 DOI: https://doi.org/10.1145/3627100
