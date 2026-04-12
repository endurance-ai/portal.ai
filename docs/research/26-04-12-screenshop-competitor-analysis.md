# ScreenShop (Clothes Finder) 경쟁 분석

> 작성일: 2026-04-12
> 목적: 이미지 기반 패션 검색 직접 경쟁사 분석

---

## 핵심 발견

**"ScreenShop"이라는 이름의 앱이 2개 존재한다.**

| 구분 | 오리지널 (Craze Inc.) | 신규 (Viral Development LLC) |
|------|------|------|
| 출시 | 2017.11 | 2024.09 |
| 현재 | Snap에 인수 → Snapchat Camera Scan에 통합 | 활발히 운영 중 |
| 관계 | 별개 회사 — 동일 브랜드명 재사용 추정 | 오리지널과 기술적 무관 |
| 실력 | 진짜 기술 (1000+ GPU, custom 모델, 1000만 상품 DB) | API 래핑 수준 추정 |

사용자가 언급한 앱은 **신규 ScreenShop (App Store ID: 6621184169)**이지만, 오리지널의 기술 아키텍처가 업계 벤치마크로서 더 유의미하므로 둘 다 분석한다.

---

## Part 1: 오리지널 ScreenShop (Craze Inc.) — 2017~2020

### 1.1 회사 개요

| 항목 | 내용 |
|------|------|
| 정식명칭 | Craze Inc. (Craze Ltd.) |
| 본사 | 뉴욕 |
| R&D | 예루살렘 Bizmax 비즈니스 센터 |
| 직원 | ~13명 (뉴욕 5 + 예루살렘 8) |
| 별명 | "패션계의 Shazam" |

### 1.2 창업팀

| 이름 | 역할 | 배경 |
|------|------|------|
| Mark Fishman | CEO | Pearl Capital 리스크 매니저 |
| Meir Hurwitz | Chief Visionary Officer | Pearl Capital 공동창업 (~6천만 달러 매각) |
| Molly Hurwitz | CMO | Meir의 자매 |
| Jonathan Caras | CTO | 예루살렘, 컴퓨터 과학자, Glide 공동창업 |
| Ari Bregin | 공동창업자 | - |

**Kim Kardashian** — Early Adopter & Advisor. UI/UX 피드백 + 마케팅 프로모션. 미디어 인터뷰 후 **하루 100만 건+ 의류 스캔** 기록.

### 1.3 기술 아키텍처 (NVIDIA 블로그에서 확인)

**파이프라인**:
```
이미지 입력 → Object Detection (의류 감지/분류) → Fashion Embeddings (유사도 벡터) → Similarity Search → 상품 매칭
```

**기술 스택**:
- TensorFlow (초기) → PyTorch 혼용
- 오픈소스 object detection + image classification 모델 자체 fine-tuning
- PyTorch 기반 Fashion Embeddings (semantic search 정확도 향상)
- TensorFlow Serving → **NVIDIA Triton Inference Server** 마이그레이션
- **TensorRT**로 FP32 → FP16 양자화: **3배 처리량, 66% 비용 절감** (정확도 손실 없음)
- 목표 latency: **100ms 이하**
- 피크 시 **1,000대+ NVIDIA T4/L4 GPU** (Kubernetes 오케스트레이션)

> Snap ML 엔지니어 Ke Ma: "We did not want to deploy bespoke inference serving platforms for our Screenshop pipeline"

**이미지 인식 원리**: "뇌가 색상, 형태, 움직임, 질감을 보는 방식을 모방" — 딥러닝 신경망 기반

### 1.4 상품 데이터베이스

- **~1,000만 개 상품**
- **~460개 브랜드/리테일러 파트너**: Nordstrom, Saks, Selfridges, H&M, ASOS 등
- **특허 출원**: AI 의류/액세서리 식별 워크플로우

### 1.5 Snap 인수

- 2020.11 인수 (2021.04~05 공식 발표)
- Snapchat Scan 기능 내 "Screenshop"으로 통합
- 월 1.7억+ Snapchat 사용자가 Scan 기능 접근 가능
- 같은 시기 **Fit Analytics도 $124M에 인수** → 사이징 기능 강화

### 1.6 비즈니스 모델
- 어필리에이트 커미션 (외부 리테일러 구매 시 수수료)
- 앱 무료

---

## Part 2: 신규 ScreenShop (Viral Development LLC) — 2024~현재

### 2.1 회사 개요

| 항목 | 내용 |
|------|------|
| 개발사 | Viral Development LLC |
| 소재지 | 60 Heather Drive, Roslyn, NY 11576 |
| 웹사이트 | viraldevelopment.co / getscreenshop.com |
| 연락처 | team@getscreenshop.com |
| 자칭 | "10+ years of experience crafting the best apps" |

### 2.2 핵심 인물 — Cal AI 팀

Viral Development LLC = **Cal AI**의 모회사. 동일 팀이 다수 앱 운영:

| 앱 | 성과 |
|----|------|
| **Cal AI - Calorie Tracker** | 1,500만+ 다운로드, $30M+ ARR, **2025.12 MyFitnessPal에 인수** |
| **Screenshop - Clothes Finder** | 17,000+ 다운로드, 4.45/5 |
| Swole AI - Gym Workout Planner | - |
| Locked In - Motivation & Alarm | - |

**Zach Yadegari** (CEO) — 18세, Forbes 30 Under 30 (2026), 7세부터 코딩, 16세에 게임사이트 $100K 매각
**Blake Anderson** (공동창업) — RizzGPT 등 ChatGPT 기반 앱 제작 경력

→ **ScreenShop은 Cal AI 팀의 사이드 프로젝트. 패션 도메인 전문성이 아닌 "AI API 래핑 → 바이럴 앱" 역량이 핵심.**

### 2.3 제품 기능

| 기능 | 설명 |
|------|------|
| **Circle & Shop** | 이미지 업로드 → 원하는 아이템을 원으로 표시 → 구매처 + 저렴한 대안(dupes) 검색 |
| **AI Stylist** | 채팅형 — 아웃핏 계획, 아이템 찾기, 스타일 조언 |
| **Fit Check** | 자기 옷차림 사진 → AI 즉시 피드백 |
| **Style Me** | 이벤트/날씨/분위기 맞춤 아웃핏 추천 |
| **Complete the Look** | 한 아이템 업로드 → 어울리는 나머지 추천 |
| **Virtual Try-On** | 구매 전 가상 피팅 |
| **Daily Picks** | 매일 큐레이션 스타일 추천 (재방문 유도) |
| **Instagram Share** | iOS Share Extension으로 인스타 포스트 직접 앱 전송 |

### 2.4 사용자 플로우

```
소셜 미디어에서 룩 발견 → 스크린샷
  ↓
ScreenShop에서 이미지 업로드
  ↓
원하는 아이템을 원으로 표시 (circle)
  ↓
AI가 동일/유사 아이템 + 저렴 대안 검색
  ↓
매칭 스코어와 함께 결과 표시
  ↓
외부 쇼핑몰 링크로 이동 → 구매
```

### 2.5 기술 추정 (공식 공개 없음)

| 영역 | 추정 |
|------|------|
| 이미지 분석 | **GPT-4o Vision API** (Cal AI가 칼로리 분석에 GPT Vision 사용, 동일 패턴 추정) |
| Circle 기능 | 사용자 관심 영역 crop → Vision API 전송 |
| 상품 매칭 | 어필리에이트 네트워크 API (ShopStyle, CJ, Amazon) 또는 자체 크롤링 |
| Virtual Try-On | 오픈소스/상용 모델 (IDM-VTON, FASHN.ai, Aiuta 등) |
| 자체 모델 | 없음 (추정) — API 래핑 중심 |

### 2.6 앱 성과

| 지표 | 수치 |
|------|------|
| 출시일 | 2024.09.16 |
| 현재 버전 | 2.0.1 (2026.01.26) |
| 다운로드 | 17,000+ |
| 평점 | 4.45/5 (720개 리뷰) |
| 플랫폼 | iOS 전용 |
| 언어 | 영어만 |

### 2.7 구독 모델

| 플랜 | 가격 |
|------|------|
| 무료 | 제한적 기능 |
| Unlimited 1 | $3.99 |
| Unlimited 2 | $6.99 |
| 주간 구독 | $6.99/주 |

### 2.8 사용자 리뷰에서 드러나는 문제

**긍정**:
- "Pinterest/Instagram에서 본 아웃핏 유사 상품 찾기 좋다"
- "패션 전문가를 항상 대기시켜 놓은 것 같다"

**반복되는 부정 이슈**:
- **매칭 정확도**: "tan off-the-shoulder top 검색 → men's long sleeve crew shirt 반환"
- **색상 불일치**: "green cargo pants → yellow jeans, linen pants"
- **기능 오류**: "Internal error 반복", "upload 버튼 80% 확률 실패"
- **검색 퇴화**: "어느 날 갑자기 검색이 멈춤"
- **강제 유료 전환**: 프리미엄 구독 강제 페이월 불만

→ **API 래핑 방식의 한계가 사용자 리뷰에서 직접 드러남. 특히 색상/카테고리 매칭 정확도가 핵심 약점.**

---

## Part 3: 패션 비주얼 검색 기술 트렌드 (2025~2026)

### 업계 표준 파이프라인

```
이미지 입력
  ↓
Object Detection (CenterNet, YOLO 계열)
  → 의류 아이템 분리
  ↓
Feature Extraction
  → 임베딩 생성 (CLIP, FashionCLIP, FashionSigLIP, DINOv2)
  ↓
Vector Similarity Search
  → 코사인 유사도 매칭 (Qdrant, Pinecone 등)
  ↓
결과 랭킹 & 필터링
  → 카테고리, 색상, 가격, 브랜드
```

### 주요 기술/모델

| 기술 | 설명 |
|------|------|
| **FashionCLIP** | CLIP을 Farfetch 데이터로 fine-tuning, 패션 도메인 특화 |
| **Marqo-FashionSigLIP** | 기존 패션 임베딩 대비 **최대 57% 성능 향상** |
| **LookSync** (2025 논문) | 1,200만 상품 인덱싱, 하루 35만 AI 룩 서빙 프로덕션 시스템 |
| **멀티모달 LLM** | GPT-4o Vision 등이 전통 CV 파이프라인을 점차 대체하는 추세 |

### 인프라 제공업체 (B2B)

| 회사 | 제공 서비스 |
|------|------------|
| Ximilar | Fashion Visual Search API |
| YesPlz | AI 스타일리스트 + 비주얼 검색 (ChatGPT 기반) |
| Pixyle.ai | 패션 비주얼 검색 가이드 |
| Marqo | FashionCLIP/FashionSigLIP 임베딩 모델 |

---

## Part 4: 직접 경쟁 환경

| 앱/서비스 | 출시 | 핵심 특징 | 펀딩 |
|-----------|------|----------|------|
| **Daydream** | 2025.06 | 대화형 AI 쇼핑, 200만 상품, 8000 브랜드 | $50M 시드 |
| Snapchat Screenshop | 2021 (통합) | 카메라 Scan으로 의류 인식, 450+ 리테일러 | Snap 사내 |
| Google Lens | 2017 | 범용 비주얼 검색 | Google |
| Pinterest Lens | 2017 | 비주얼 유사도, 미적 발견 | Pinterest |
| Amazon StyleSnap | 2019 | 이미지 → Amazon 상품 매칭 | Amazon |
| **Phia** | 2025.04 | AI 쇼핑 에이전트, 개인화 | Phoebe Gates 창업 |
| **Alta** | 2025.06 | AI 옷장 + 아웃핏 플래닝 | - |
| **DressX Agent** | 2025.08 | AI 트윈 + 가상 피팅 + 직접 구매 | - |

---

## Part 5: portal.ai와의 비교

### 공통점

| 항목 | ScreenShop (신규) | portal.ai |
|------|-------------------|-----------|
| 이미지 업로드 → 의류 분석 | O | O |
| AI 기반 유사 상품 검색 | O | O |
| 카테고리/색상/스타일 추출 | O (추정) | O (GPT-4o-mini Vision) |
| 프롬프트 지원 | O (AI Stylist 채팅) | O (프롬프트+이미지) |

### 차별점

| 항목 | ScreenShop | portal.ai |
|------|-----------|-----------|
| UX | 이미지 위에 아이템 circle | 전체 이미지 분석 + 핫스팟 |
| 룩 분해 | 단일 아이템 포커스 | **전체 룩을 아이템별 분해** (아코디언) |
| 검색 엔진 | 블랙박스 (어필리에이트 API 추정) | **자체 v4** (enum + gradient + 브랜드 DNA) |
| 상품 DB | 외부 리테일러 연동 추정 | **자체 크롤링 26,000+ 상품** |
| Virtual Try-On | O | X |
| 가격 필터 | 불분명 | O (프롬프트 자동 추출) |
| 피드백 | X | O (좋아요/싫어요 + 태그) |
| 디버거/어드민 | X | O (검색 디버거, 품질 평가) |
| 타겟 | 미국/글로벌 | 한국 (→ 글로벌 확장 예정) |

### ScreenShop의 강점 (참고할 것)

1. **Circle & Shop UX** — 사용자가 직접 관심 영역 지정하는 인터랙션이 직관적
2. **AI Stylist 목적별 대화** — "Complete the Look", "Style Me" 등 유스케이스별 분리
3. **Virtual Try-On** — 구매 전 가상 피팅으로 전환율 향상
4. **Instagram Share Extension** — 소셜에서 바로 앱으로 전달
5. **Daily Picks** — 재방문 유도 매일 큐레이션

### ScreenShop의 약점 (우리의 기회)

1. **매칭 정확도 낮음** — 색상/카테고리 불일치 리뷰 반복 → 우리 enum + 색상인접 + gradient scoring 우위
2. **자체 상품 DB 부재** — 외부 API 의존, 품질 통제 불가 → 우리는 직접 크롤링 + AI 분석
3. **기술 안정성 부족** — "80% upload 실패", "internal error" → 소규모 사이드 프로젝트 한계
4. **룩 분해 없음** — 전체 아웃핏을 아이템별 분리하는 기능 부재
5. **패션 도메인 전문성 부족** — 범용 AI 앱 개발사(칼로리, 동기부여)의 패션 진출 → 깊이 부족

---

## 핵심 시사점

1. **신규 ScreenShop은 기술적 위협이 아니다** — Cal AI 팀의 사이드 프로젝트, 17K 다운로드, API 래핑 수준. 매칭 정확도 문제가 리뷰에서 반복.

2. **오리지널 ScreenShop(→Snap)의 아키텍처가 업계 벤치마크** — Object Detection → Fashion Embeddings → Similarity Search 파이프라인, 1000+ GPU, 100ms latency. 이게 "large catalog matching" 방식의 정석.

3. **이 파이프라인의 한계가 우리의 기회** — Embedding 기반 유사도 검색은 "시각적으로 비슷한 것"을 찾지만, "발렌시아가 마이애미 더비의 앞코 쉐입이 가진 감도"를 이해하지 못한다. 우리가 지향하는 **속성 해체 → 우선순위화 → 서브컬처 브랜드 그래프 탐색**은 이 한계를 넘는 접근.

4. **Virtual Try-On은 Table Stakes가 되는 중** — ScreenShop, DressX Agent, Alta 등 신규 앱들이 모두 탑재. 중장기 로드맵에 고려 필요.

5. **패션 비주얼 검색 시장 2025년에 과열** — Daydream $50M, Phia, Alta, DressX 등 5개+ 주요 경쟁자. 그러나 대부분 미국/글로벌 대상이며 **한국 편집샵/브랜드몰에 특화된 니치 서비스는 부재**.

---

## 출처

- [App Store - Screenshop Clothes Finder](https://apps.apple.com/us/app/screenshop-clothes-finder/id6621184169)
- [NVIDIA Blog - Enhancing Apparel Shopping with AI and Screenshop](https://developer.nvidia.com/blog/enhancing-the-apparel-shopping-experience-with-ai-emoji-aware-ocr-and-snapchats-screenshop/)
- [PYMNTS - Snap Quietly Buys Screenshop](https://www.pymnts.com/news/social-commerce/2021/snap-quietly-buys-screenshop-to-propel-clothes-shopping/)
- [NoCamels - Kim Kardashian Partners With Israeli Fashion App](https://nocamels.com/2017/11/kim-kardashian-partners-with-israeli-founded-fashion-app-screenshop/)
- [Medium - Haredi Tech Team Behind Kim K's Favorite Fashion App](https://medium.com/inside-the-ecosystem/the-haredi-tech-team-behind-kim-kardashians-favorite-fashion-app-707dad592370)
- [TechCrunch - MyFitnessPal Acquires Cal AI](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens/)
- [CNBC - Cal AI Teenage CEO](https://www.cnbc.com/2025/09/06/cal-ai-how-a-teenage-ceo-built-a-fast-growing-calorie-tracking-app.html)
- [Crunchbase - Screenshop Profile](https://www.crunchbase.com/organization/craze-style)
- [Digiday - Snap Plans to Integrate Screenshop](https://digiday.com/media/snap-screenshop/)
- [PRNewswire - Daydream Launches](https://www.prnewswire.com/news-releases/daydream-launches-design-forward-iphone-app-to-advance-ai-driven-fashion-search-302618206.html)
- [Glossy - Fashion's AI Boom](https://www.glossy.co/fashion/is-fashions-ai-boom-solving-a-real-problem/)
- [Width.ai - FashionCLIP](https://www.width.ai/post/product-similarity-search-with-fashion-clip)
