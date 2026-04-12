# 올웨이즈(Alwayz) "가전비서 V2" (GABI) 경쟁 분석

> 작성일: 2026-04-12
> 목적: 커머스 AI 에이전트 경쟁사 분석 — 도메인은 다르지만(가전 vs 패션) 방향성 유사

---

## 1. 회사 개요

| 항목 | 내용 |
|------|------|
| 운영사 | 레브잇(Levit) — 올웨이즈와 동일 법인 |
| 대표 | 강재윤 |
| 서비스 URL | gabi.ai.kr |
| 포지션 | AI 기반 가전제품 구매 도우미 ("깎아오는 가전비서") |
| 조직 | PMF팀 (CEO 직속) — 올웨이즈 본업과 별도 운영 |

### 창업팀 (서울과학고 + 서울대 동문 3인)

| 이름 | 역할 | 배경 |
|------|------|------|
| 강재윤 | CEO | 서울대 전기정보공학부, DEER(전동킥보드 공유) 공동창업 CTO, 회원 70만 |
| 이현직 | Full Stack Tech Lead | 서울대 물리학 석사, DEER 풀스택 엔지니어 |
| 박상우 | UI/UX & Front-End | 서울대 기계공학, DEER VP Product, 창업 후 2주 만에 프론트엔드 독학 |

### 투자

| 라운드 | 시기 | 금액 | 주요 투자사 |
|--------|------|------|------------|
| Series A1 | 2022 초 | ~136억 | 미래에셋, 한국투자, GS벤처스 |
| Series A2 | 2022.09 | 133억 | 동일 |
| Series B | 2023.06 | 600억 ($46M) | **DST Global** (Facebook, Airbnb 투자사), 본드캐피털 등 |
| **누적** | | **869억+** | |

- 2025.01: 설립 후 최초 월 영업이익 흑자 달성
- 2026 초: 영업이익 26억, 3분기 연속 흑자

---

## 2. 올웨이즈 본업 (맥락)

- C2M 팀구매 커머스 (한국판 핀둬둬)
- 수수료 ~3.5% (업계 10~15% 대비 극저가)
- 가입자 700만, MAU 250만, DAU 130만, 월 거래액 400억
- 50+ 백엔드 마이크로서비스 + 100+ 크론잡 + ML 추천, Amazon EKS
- **본업 BEP 달성 수익을 AI 쇼핑 에이전트 신사업에 재투자 중**

---

## 3. 가전비서 V2 (GABI) — 제품 분석

### 핵심 가치 제안

"가전 살 때마다 어디가 싸지? 바가지 쓰는 건 아닌지 불안" → 검증된 대리점 5곳이 경쟁해서 최저가 견적

### 사용자 플로우 (소스코드 분석 기반)

```
1. 온보딩 (/onboarding)
   ↓
2. 견적서 업로드 (/consultation/upload)
   → 기존 견적서 이미지를 올리면 AI가 자동 파싱
   ↓
3. OCR/AI 견적 파싱 (/consultation/parsing)
   → 품목, 가격, 모델명 자동 인식 (16+ 카테고리)
   ↓
4. 라이프스타일 Q&A (/quote-agent/lifestyle-questions)
   → 가족 수, 주거 크기, 요리 빈도, 브랜드 선호, 우선순위 설문
   ↓
5. 구매 목적 상담 (/consultation/purpose)
   → 구매 계기, 결제 방식, 구독/렌탈 여부, 기존 가전 수거
   ↓
6. 스펙 기반 필터링 (/quote-agent/hard-filters)
   → AI 추천 스펙 조건을 사용자가 커스터마이징
   ↓
7. 예산 설정 (/quote-agent/budget)
   ↓
8. AI 제품 추천 (/quote-agent/product-result, product-stream)
   → SSE 스트리밍으로 실시간 분석 결과 전달
   ↓
9. 제품 비교 (/quote-agent/product-compare)
   → 원본 견적 제품 vs AI 추천 대안 비교
   ↓
10. 대리점 경쟁 입찰 → 최저가 견적 수집
    ↓
11. 견적 설명 상담 → 구매 확정 → 결제 → 배송
```

### 음성 AI 에이전트

- LiveKit (WebRTC) + ElevenLabs (TTS) 기반
- 음성으로 가전 상담 및 견적 비교 결과 설명 가능
- "버튼을 눌러 음성 상담을 시작하세요" / "맞춤 추천 상품" / "검색 조건을 화면에 표시했습니다"

---

## 4. 기술 스택

### 프론트엔드
- React (Vite SPA) + Stackflow (모바일 네비게이션) + Chakra UI + Framer Motion
- Sentry 모니터링, Facebook Pixel 분석

### 백엔드
- **Supabase** (PostgreSQL) — product_categories, 제품/스펙/가격 데이터
- **Railway 호스팅** — 올웨이즈 본업 인프라(EKS)와 분리, 빠른 프로토타이핑
  - `cheaper-quote-api-production.up.railway.app` — 메인 API
  - `gabi-quote-parser-production.up.railway.app` — 견적서 OCR 파싱 서버

### AI/ML API 구조 (소스코드에서 확인)

| API 엔드포인트 | 기능 |
|---------------|------|
| `/api/map-product` | 모델 코드 기반 제품 DB 매칭 |
| `/api/search-products` | 카테고리별 텍스트 검색 + 스펙 필터 |
| `/api/spec-questions` | 카테고리/품목 기반 AI 스펙 질문 자동 생성 |
| `/api/infer-conditions` | 사용자 Q&A 응답 + 예산 → 검색 조건 자동 추론 |
| `/api/match-alternatives` | 핵심 스펙 + 가격 조건 → 더 저렴한 대안 검색 |
| `/api/generate-comparison` | 원본 vs 대안 비교 텍스트 자동 생성 |
| `/api/spec-advice` | 특정 스펙 항목의 중요도/설명 제공 |
| `/api/describe-products` | AI 기반 제품 설명 자동 생성 |
| `/api/ai-chat` | 스트리밍 대화형 AI 상담 (멀티턴) |
| `/api/analyze-result-stream` | SSE 기반 실시간 분석 결과 |

### 지원 가전 카테고리 (16+종)
TV, 냉장고, 김치냉장고, 세탁기, 건조기, 워시타워, 에어컨(시스템에어컨), 청소기(로봇청소기), 공기청정기, 식기세척기, 정수기, 인덕션, 오븐/전자레인지, 스타일러/의류관리기, 안마의자, 음식물처리기, 제습기, 가습기, 프로젝터, 사운드바

### 제품 스펙 비교 차원 (33개+)
건조방식, 냉방능력, 냉방면적, 도어타입, 디스펜서, 모터타입, 에너지등급, 해상도, 화면크기 등

---

## 5. 채용에서 드러나는 기술 방향

- **Product Engineer (Full Stack / AI)**: React + TypeScript, LLM 라이브러리, Prompt engineering, RAG, fine-tuning, 웹 크롤링/스크래핑
- **Problem Solver (AI 인턴)**: 쇼핑 전반(생활, 가전, 가구, 여행, 선물, 가격비교)에서 AI Agent 활용, 가설→프로토→고객검증→개선

→ **가전비서는 여러 버티컬 AI Agent 실험 중 하나이며, 향후 확장 예정**

---

## 6. 비즈니스 모델 (추정)

- 대리점 경쟁 입찰 중개 수수료
- 구독/렌탈 연계
- 셀러(대리점) 프로모션 광고 (`seller-promotions` 코드 확인)

---

## 7. 경쟁사 비교 (가전 버티컬)

| 서비스 | 핵심 기능 | 차별점 | 한계 |
|--------|----------|--------|------|
| **GABI** (레브잇) | 견적서 AI 파싱 + 라이프스타일 추천 + 대리점 경쟁 + 음성 AI | 869억 투자, 300만 MAU 트래픽 | PMF 탐색 초기 |
| 가전나우 | 견적 비교, 전국 매장 최저가 | 신혼/혼수 1위, 커뮤니티 | AI 활용 제한적 |
| 노써치 | 성능 데이터 큐레이션 + 원스톱 구매 | 전문가 리뷰, 데이터 표준화 | 견적 비교/협상 없음 |
| 롯데하이마트 HAVI | AI 쇼핑 에이전트 대화형 추천 | 자체 재고/가격 보유 | 자사 플랫폼 한정 |
| 다나와/에누리 | 가격 비교 | 방대한 DB | 추천/AI 없음 |

---

## 8. portal.ai와의 시사점

### 구조적 유사성

| GABI 플로우 | portal.ai 플로우 |
|------------|-----------------|
| 견적서 이미지 업로드 | 패션 이미지/프롬프트 업로드 |
| AI 파싱 (OCR → 품목/가격/모델) | AI 분석 (Vision → 룩 분해/아이템 속성) |
| 라이프스타일 Q&A → 조건 추론 | 무드/스타일 분석 → 검색 조건 |
| 스펙 기반 대안 검색 | enum 매칭 + gradient scoring |
| 원본 vs 대안 비교 | 상품 카드 + 매칭 이유 칩 |
| SSE 스트리밍 결과 | 분석 중 프로그레스 → 결과 |

### 참고할 점

1. **견적서 파싱 → 즉시 비교 시작**: 사용자의 기존 맥락(이미 본 견적서)을 출발점으로 삼는 UX → 우리도 "레퍼런스 제품"을 출발점으로 삼는 방향과 일치
2. **라이프스타일 기반 추론**: 단순 스펙 매칭이 아닌 사용자 맥락(가족 수, 공간, 우선순위) 기반 추천 → 패션에서는 체형, 스타일 선호, TPO가 대응
3. **음성 AI 상담**: LiveKit + ElevenLabs 조합 — 복잡한 상담을 대화형으로 풀어냄
4. **Railway로 분리된 프로토타이핑**: 본업 인프라와 분리하여 빠른 실험 → PMF 검증에 적합
5. **End-to-End 여정 관리**: 상담→비교→결정→결제까지 일원화 → 우리도 발견→재탐색→비교→확신→구매까지 커버해야 할 목표

### GABI CEO 발언
> "AI 쇼핑 에이전트 등 신사업을 본격화해 고객 경험을 한층 진화시킬 것"

---

## 출처

- [THE VC - 레브잇](https://thevc.kr/levit)
- [TechCrunch - Alwayz $46M funding](https://techcrunch.com/2023/06/29/koreas-alwayz-aims-to-make-online-shopping-fun-again-with-46m-in-funding/)
- [머니투데이 - 시리즈B 600억](https://news.mt.co.kr/mtview.php?no=2023062008274190291)
- [바이라인네트워크 - 영업이익 달성](https://byline.network/2025/02/10_2182873/)
- [한국경제 - 창업 스토리](https://www.hankyung.com/article/202304159702Y)
- [벤처스퀘어 - AI 해커톤](https://www.venturesquare.net/1000954)
- gabi.ai.kr 프론트엔드 소스코드 분석 (JS 번들 리버스 엔지니어링)
