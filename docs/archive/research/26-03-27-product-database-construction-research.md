# 상품 DB 구축 옵션 리서치

> 작성일: 2026-03-27
> 목적: MOODFIT POC→MVP 전환을 위한 상품 데이터베이스 구축 방안 조사

---

## 목차

1. [쿠팡 파트너스 API](#1-쿠팡-파트너스-api)
2. [CJ Affiliate](#2-cj-affiliate)
3. [무신사 큐레이터 / 파트너](#3-무신사-큐레이터--파트너)
4. [한국 어필리에이트 네트워크](#4-한국-어필리에이트-네트워크)
5. [글로벌 어필리에이트 API](#5-글로벌-어필리에이트-api)
6. [SPA 브랜드 직접 제휴](#6-spa-브랜드-직접-제휴)
7. [크롤링 vs 어필리에이트 법적 비교](#7-크롤링-vs-어필리에이트-법적-비교)
8. [벡터 DB 비교](#8-벡터-db-비교)
9. [POC→MVP 실행 전략 권고](#9-pocmvp-실행-전략-권고)

---

## 1. 쿠팡 파트너스 API

### 1.1 가입 및 승인

| 항목 | 상세 |
|------|------|
| 가입 조건 | 14세 이상, 초기 비용 없음 |
| 등록 채널 | 블로그, 웹사이트, 모바일 앱, SNS, YouTube |
| 초기 승인 | 영업일 기준 1~3일 소요, 이메일 통보 |
| **최종 승인** | 판매금액 **15만 원 이상** 달성 필수 |
| 최종 승인 시 필요 | 채널 URL 등록 + 활동 스크린샷 + [광고] 표기 |
| 거절 사유 | SNS 콘텐츠 부족, 금지 콘텐츠 포함 등 |

> **주의**: API 사용은 최종 승인(15만 원 매출) 후에만 가능. POC 단계에서 빠르게 테스트하려면 먼저 수동 링크로 15만 원 매출 달성 필요.

### 1.2 API 스펙

**Base URL**: `https://api-gateway.coupang.com`

**인증**: HMAC-SHA256 (Access Key + Secret Key)
```
CEA algorithm=HmacSHA256, access-key={}, signed-date={}, signature={}
```

**지원 언어**: Java, Python, PHP, C#, Node.js

| 엔드포인트 | 설명 | 파라미터 |
|-----------|------|---------|
| `/v2/.../products/search` | **상품 검색** | `keyword`, `limit` (최대 10) |
| `create_deeplink` | **딥링크 생성** | `coupang_urls`, `sub_id` |
| `get_goldbox_offers` | 골드박스(타임딜) | params |
| `get_best_category_products` | 카테고리별 베스트 | `category_id`, `limit` (최대 20) |
| `get_recommended_products` | 추천 상품 | `deviceId` |
| `search_products` | 키워드 검색 | `keyword`, `limit`, `image_size` |
| `get_coupang_pl_products` | 쿠팡 PL 상품 | `limit` (최대 20) |
| `get_coupang_pl_brand_products` | PL 브랜드별 | `brand_id`, `limit` |

**응답 JSON 필드** (`productData` 배열):
- `productId`, `productName`, `productPrice`, `productImage`
- `productUrl`, `keyword`, `rank`
- `isRocket` (로켓배송 여부), `isFreeShipping`

### 1.3 API 호출 제한

| 제한 | 수치 |
|------|------|
| **검색 API** | **시간당 최대 10회** |
| 초과 시 | 429 Too Many Requests |
| 상품 검색 결과 | 요청당 최대 10개 |
| 카테고리 베스트 | 카테고리당 최대 100개 |

> **치명적 제한**: 시간당 10회는 실시간 서비스에 매우 부족. 캐싱 전략 필수.

### 1.4 수수료 구조 (어필리에이트 커미션)

| 카테고리 | 커미션율 |
|---------|---------|
| **기본 (별도 미지정)** | **3%** |
| 패션 의류 | 약 3% (별도 명시 없으면 기본) |
| 화장품/건강기능식품 | 높은 편 (별도 지정) |

> 쿠팡 "판매자 수수료"(5~13%)와 혼동 주의. 어필리에이트 커미션은 별도로 기본 3%.

### 1.5 패션 카테고리 커버리지

- 쿠팡은 한국 최대 이커머스로 패션 카테고리 폭넓게 보유
- SPA 브랜드(ZARA, H&M 등)는 제한적 (직접 입점 아닌 병행수입 위주)
- 국내 브랜드, 로드샵, 동대문 패션 등은 풍부
- 로켓배송 패션 상품 증가 추세

### 1.6 실시간 재고/가격 반영

- API 응답에 가격 포함, 호출 시점 기준 반영
- 단, 시간당 10회 제한으로 실시간 갱신은 사실상 불가
- **권장**: 일 1~2회 배치 업데이트 + 클릭 시 쿠팡 페이지로 리디렉트

### 1.7 MOODFIT 적합도 평가

| 항목 | 평가 |
|------|------|
| 접근성 | ★★★★☆ (가입 쉬움, 15만원 허들) |
| API 품질 | ★★★☆☆ (기본적인 검색만 가능) |
| 호출 제한 | ★☆☆☆☆ (시간당 10회는 치명적) |
| 패션 커버리지 | ★★★★☆ (대중 패션 강점) |
| 수익성 | ★★☆☆☆ (3% 커미션) |

---

## 2. CJ Affiliate

### 2.1 개요

CJ Affiliate(구 Commission Junction)는 글로벌 최대 어필리에이트 네트워크 중 하나.

| 항목 | 상세 |
|------|------|
| 글로벌 광고주 | 수천 개 (패션, 여행, 금융 등) |
| 한국 시장 | 직접 운영 없음, 글로벌 브랜드를 통해 간접 접근 |
| API | Product Import API, Commission Detail API |
| 딥링크 | 지원 (특정 상품 페이지 직접 링크) |

### 2.2 API 스펙

- **CJ Developer Portal**: developers.cj.com
- Product Feed API: 표준화된 Shopping Feed 형식
- Commission Detail API: 실적 조회
- 2025년 API 안정성 이슈 보고됨 (간헐적 장애)

### 2.3 한국 패션 브랜드 커버리지

| 브랜드/플랫폼 | CJ 등록 | 비고 |
|-------------|---------|------|
| W컨셉 | 미확인 | 신세계 그룹 산하, 직접 제휴 필요 |
| 29CM | 미확인 | 무신사 그룹 산하 |
| SSF몰 | 미확인 | 삼성물산 패션 |
| 글로벌 패션 브랜드 | O | Nike, ASOS 등 일부 |

> **결론**: CJ Affiliate는 글로벌 브랜드 접근에는 유용하나, 한국 로컬 패션 플랫폼(W컨셉, 29CM 등) 커버리지는 약함. 한국 타겟이면 링크프라이스가 더 적합.

### 2.4 수수료율

- 광고주별 상이 (보통 3~15%)
- 패션 카테고리 평균: 5~10%
- 성과 기반 보너스/티어드 구조 가능

---

## 3. 무신사 큐레이터 / 파트너

### 3.1 무신사 큐레이터 (어필리에이트 프로그램)

2024년 7월 베타 런칭, 현재 공식 운영 중.

| 항목 | 상세 |
|------|------|
| 프로그램명 | **무신사 큐레이터** |
| 런칭 | 2024년 7월 |
| 활성 큐레이터 | 4,400명+ (2025년 12월 기준) |
| 누적 거래액 | **1,200억 원** (1.5년) |
| 커미션율 | **최대 10% 이상** (직접 기여 시) |
| 대상 | 승인된 인플루언서 |
| 방식 | SNS 콘텐츠 → 무신사 상품 추천 → 매출 발생 시 수수료 |

**성과 사례**:
- 2024년 11월 프로모션: 2,380억 원 매출
- 640명 큐레이터가 49,000+ 상품 추천 포스트 생성
- 100+ 큐레이터가 10일간 개인 5,000만 원+ 매출 달성

### 3.2 API 접근

| 항목 | 상태 |
|------|------|
| 공개 API | **없음** |
| 상품 검색 API | **없음** |
| 딥링크 API | **없음** (SNS 콘텐츠 기반만) |
| 파트너 센터 | partner.musinsa.com (입점 브랜드 전용) |

> **결론**: 무신사는 큐레이터 프로그램은 있지만, API를 통한 프로그래매틱 접근은 불가. 인플루언서 채널 기반의 수동 링크 방식만 지원. MOODFIT 같은 자동화 서비스에는 직접 통합 불가.

### 3.3 대안: 무신사 상품 데이터 접근 방법

1. **무신사 큐레이터 등록 후 링크 생성** → 수동, 자동화 어려움
2. **무신사 파트너 센터** → 입점 브랜드 전용, 외부 서비스 불가
3. **크롤링** → 법적 리스크 존재 (아래 7번 참고)
4. **무신사 광고 파트너 센터** (musinsabiz.oopy.io) → 광고주용, 어필리에이트 아님

---

## 4. 한국 어필리에이트 네트워크

### 4.1 링크프라이스 (LinkPrice)

한국 최대 어필리에이트 네트워크 (2006년 설립).

| 항목 | 상세 |
|------|------|
| 광고주 수 | **약 500개** 국내 주요 기업 |
| 카테고리 | 패션, 도서/문화, 여행, 금융 등 |
| API | **있음** — Reward API, Performance Query API, Deep Link 자동 변환 |
| 딥링크 | URL → 자동 어필리에이트 딥링크 변환 API |
| 정산 | 구매월 기준 익익월 (2개월 후) |
| 수수료율 | 광고주별 상이 (패션 보통 3~10%) |

**API 데이터 구조**:
- `merchant_id`: 광고주 ID
- `order_code`: 주문 번호
- `product_code`: 상품 코드
- `sales`: 매출액
- `commission`: 수수료
- `status`: confirmed/cancelled

**패션 브랜드 커버리지**:
- 주요 국내 쇼핑몰 다수 등록 (정확한 패션 브랜드 리스트는 가입 후 확인 필요)
- W컨셉, 29CM, SSF몰 등 프리미엄 플랫폼 등록 여부는 직접 확인 필요

### 4.2 애드픽 (Adpick)

| 항목 | 상세 |
|------|------|
| 설립 | 2013년 12월 |
| 회원 수 | 90만+ |
| 유형 | 인플루언서 마케팅 + 어필리에이트 |
| API | **있음** — 캠페인 리스트 API (JSON) |
| 수수료율 | 0.5% ~ 10%+ (광고주별 상이) |
| 패션 특화 | 패션 캠페인 있으나 상세 브랜드 리스트 미공개 |

**API 사용법**:
- JSON API로 현재 진행 중 캠페인 목록 조회 가능
- 앱/웹서비스에 자동 노출 가능
- 가이드: `adpick.co.kr/?ac=guide&tac=sdk&md=api`

### 4.3 텐핑 (Tenping)

| 항목 | 상세 |
|------|------|
| 유형 | 퍼포먼스 마케팅 플랫폼 |
| 캠페인 타입 | CPA (참여형), CPA+TP |
| 전환 목표 | 회원가입, 구매, 앱 설치 등 |
| 패션 | 캠페인 존재하나 CPS(매출 연동) 방식은 제한적 |
| API | 공개 API 미확인 |

> **텐핑 한계**: CPA(참여 기반) 중심으로, 상품 검색/추천 서비스에 적합한 CPS(매출 기반) 구조가 약함.

### 4.4 한국 네트워크 비교 요약

| 네트워크 | API | 패션 커버리지 | MOODFIT 적합도 |
|---------|-----|------------|--------------|
| **링크프라이스** | O (딥링크+실적) | ★★★★☆ | **최적** |
| 애드픽 | O (캠페인리스트) | ★★★☆☆ | 보조 |
| 텐핑 | X | ★★☆☆☆ | 부적합 |
| 쿠팡 파트너스 | O (검색+딥링크) | ★★★★☆ | 호출 제한 문제 |
| 무신사 큐레이터 | X | ★★★★★ | API 없음 |

---

## 5. 글로벌 어필리에이트 API

### 5.1 Amazon Product Advertising API

| 항목 | 상세 |
|------|------|
| API 버전 | PA-API 5.0 (**2026년 4월 30일 deprecated 예정** → Creators API 이전) |
| 한국 마켓플레이스 | **미지원** (amazon.co.kr 없음) |
| 지원 마켓 | US, CA, UK, DE, JP, SG 등 15개국 |
| 한국 패션 커버리지 | **매우 낮음** (한국 시장 직접 운영 안 함) |
| 커미션 | 카테고리별 1~10% |
| API 활성화 조건 | 180일 내 3건 이상 판매 |

> **결론**: Amazon은 한국 시장 미진출. 글로벌 패션 브랜드 추천 시에만 보조적 사용 가능. PA-API deprecation도 리스크.

### 5.2 AWIN (+ ShareASale 통합)

| 항목 | 상세 |
|------|------|
| 네트워크 규모 | **30,000+ 브랜드** |
| 패션 강점 | Nike(UK/EU), ASOS, COS, UNIQLO 등 |
| API | Product Feed, Commission API |
| 한국 커버리지 | 글로벌 브랜드 위주, 한국 로컬 약함 |
| 가입비 | 가입 시 $5 보증금 (승인 후 환급) |

ShareASale은 2025년 AWIN에 완전 통합됨.

### 5.3 Rakuten Advertising

| 항목 | 상세 |
|------|------|
| 포지셔닝 | 프리미엄 네트워크 (소수 정예) |
| 패션 강점 | 패션, 뷰티, 전자제품 |
| API | Affiliate APIs 1.0.0 (OAS3) |
| 한국 | Rakuten Japan 연동 가능, 한국 직접 운영 제한적 |

### 5.4 글로벌 네트워크 비교

| 네트워크 | 패션 브랜드 수 | 한국 적합도 | API 품질 |
|---------|-------------|-----------|---------|
| AWIN | ★★★★★ | ★★☆☆☆ | ★★★★☆ |
| Rakuten | ★★★★☆ | ★★☆☆☆ | ★★★☆☆ |
| CJ Affiliate | ★★★★☆ | ★★☆☆☆ | ★★★☆☆ |
| Amazon PA-API | ★★★☆☆ | ★☆☆☆☆ | ★★★★☆ (곧 deprecated) |

---

## 6. SPA 브랜드 직접 제휴

### 6.1 ZARA (Inditex)

| 항목 | 상세 |
|------|------|
| 프로그램명 | **Zara Ambassadors** (Captiv8 관리) |
| 커미션 | **4~8%** per sale |
| 쿠키 기간 | 24시간 |
| 대상 | 인플루언서 중심 (전통 어필리에이트 아님) |
| 지역 | 현재 미국 중심 |
| API | 없음 (프로그래매틱 접근 불가) |

> 인플루언서 전용. MOODFIT 같은 서비스에 API 통합 어려움.

### 6.2 H&M Group (H&M, COS, & Other Stories, ARKET, Weekday)

| 항목 | 상세 |
|------|------|
| 커미션 | 일반 고객 **7~7.5%**, 신규 고객 **11.25%** |
| 쿠키 기간 | **30일** |
| 네트워크 | Sovrn Commerce (공식), AWIN, Skimlinks 등 복수 |
| API | **있음** — Super Affiliate 대상 H&M API 제공 |
| 브랜드 | H&M, H&M Home, COS, & Other Stories, Monki, Weekday, ARKET |

> **H&M이 가장 API 친화적**. Super Affiliate 승인 시 API로 상품 데이터 접근 가능.

### 6.3 UNIQLO

| 항목 | 상세 |
|------|------|
| 커미션 | **2~7%** (네트워크별 상이) |
| 쿠키 기간 | 30일+ |
| 네트워크 | AWIN (3~7%), Skimlinks (6.5%), FlexOffers (1.6%), Partnerize |
| 글로벌 프로그램 | `signup.partnerize.com/signup/en/uniqloglobal` |
| API | 네트워크 API를 통한 간접 접근 |

### 6.4 SPA 브랜드 요약

| 브랜드 | 커미션 | API 접근 | MOODFIT 적합도 |
|--------|--------|---------|--------------|
| **H&M Group** | 7~11% | **O (Super Affiliate)** | **최적** |
| UNIQLO | 2~7% | 간접 (네트워크) | 양호 |
| ZARA | 4~8% | X | 부적합 |

---

## 7. 크롤링 vs 어필리에이트 법적 비교 (한국)

### 7.1 핵심 판례: 대법원 2021도1533 (2022.5.12 선고)

한국 대법원이 웹 크롤링 형사책임에 대해 최초로 판단한 판례.

**사건 개요**: 숙박 플랫폼 A사가 경쟁사 B사의 모바일 앱/API 서버에서 데이터를 크롤링한 사건.

**판결**: 3가지 혐의 모두 **무죄** 확정.

| 혐의 | 판단 | 핵심 논리 |
|------|------|----------|
| **정보통신망침해** | 무죄 | 접근권한 제한 여부는 보호조치, 이용약관 등 객관적 사정 종합 판단 |
| **저작권법 위반 (DB권)** | 무죄 | DB의 "상당한 부분" 복제는 양적+질적 측면 모두 고려 |
| **컴퓨터등장애 업무방해** | 무죄 | 서버에 실질적 장애를 초래하지 않은 경우 |

### 7.2 관련 법률 체계

| 법률 | 적용 조항 | 크롤링 관련 |
|------|----------|-----------|
| 정보통신망법 | 제48조 (침입 금지) | 기술적 보호조치 우회 시 위반 |
| 저작권법 | 제93조 (DB제작자 권리) | DB의 상당 부분 무단 복제 시 위반 |
| 형법 | 제314조 (업무방해) | 서버 과부하 유발 시 |
| 부정경쟁방지법 | 제2조 제1호 차목 | 타인의 성과물 무단 사용 |

### 7.3 합법적 크롤링 조건

1. **공개 데이터만 수집** — 로그인 필요 없는 페이지
2. **robots.txt 준수** — 크롤링 허용 영역만
3. **이용약관 확인** — 크롤링 금지 조항 여부
4. **필요 최소한 수집** — DB 전체/상당 부분 복제 금지
5. **서버 부하 최소화** — 적절한 요청 간격
6. **개인정보 미수집** — 판매자 정보 등 제외

### 7.4 가격비교 사이트의 법적 구조

| 서비스 | 데이터 수집 방식 | 법적 기반 |
|--------|---------------|----------|
| **다나와** | 크롤링 + **제휴 API** | 쇼핑몰과 공식 제휴 계약, 자체 Open API도 공개 |
| **에누리** | 크롤링 + 제휴 | 쇼핑몰과 직접 계약 |
| **네이버 쇼핑** | EP (상품 정보 파일) 수신 | 판매자가 직접 상품 정보 전송 |

> **다나와 API**: 카테고리별 상품 목록, 카테고리 정보, 검색 등을 외부 개발자에 공개. `api.danawa.com`에서 인증 후 이용 가능.

### 7.5 실무 권고

| 방식 | 법적 리스크 | 비용 | 권고 |
|------|-----------|------|------|
| **어필리에이트 API** | **없음** | 무료 (수수료 구조) | **최우선** |
| **공개 API (다나와 등)** | 낮음 | 무료~저렴 | 보조 활용 |
| **공개 페이지 크롤링** | 중간 | 개발 비용 | robots.txt 준수 시 가능 |
| **로그인 후 크롤링** | **높음** | - | **금지** |
| **API 서버 직접 호출** | **매우 높음** | - | **절대 금지** |

---

## 8. 벡터 DB 비교

### 8.1 주요 벡터 DB 비교표

| 항목 | **Qdrant** | **Pinecone** | **Weaviate** | **Chroma** |
|------|-----------|-------------|-------------|-----------|
| 언어 | Rust | 독자 | Go | Python (2025 Rust 재작성) |
| 호스팅 | Self-hosted + Cloud | **Managed only** | Self-hosted + Cloud | Self-hosted + Cloud |
| 무료 티어 | 1GB 클러스터 | ~300K~1M 벡터 | Serverless $25/mo | 완전 무료 (self-hosted) |
| QPS (쿼리/초) | **326** | 150 (p2 pods) | **791** | 벤치마크 미공개 |
| 메타데이터 필터링 | **★★★★★** | ★★★☆☆ | ★★★★☆ | ★★★☆☆ |
| 하이브리드 검색 | O | 제한적 | **O (BM25+vector)** | O |
| SOC 2/HIPAA | Cloud 제공 | **O (SOC2, ISO27001, HIPAA)** | O (2025 AWS HIPAA) | X |

### 8.2 비용 비교

| 규모 | Qdrant (self-hosted) | Qdrant Cloud | Pinecone | Weaviate Cloud |
|------|---------------------|-------------|---------|---------------|
| POC (10K 벡터) | **$0** (로컬) | **$0** (무료 1GB) | **$0** (무료 티어) | $25/mo |
| MVP (100K 벡터) | ~$5/mo (VPS) | ~$15/mo | ~$50/mo | ~$25/mo |
| 성장 (1M 벡터) | ~$20/mo | ~$30/mo | ~$70/mo | ~$50/mo |
| 스케일 (10M 벡터) | ~$45/mo | ~$45/mo | ~$70/mo+ | 별도 문의 |

> Pinecone → self-hosted 마이그레이션 전환점: 50~100M 벡터 또는 월 $500+ 시점.

### 8.3 패션 도메인 벡터 검색 적합성

**Qdrant 장점** (패션 추천에 최적):
- 복잡한 메타데이터 필터링: "이 이미지와 비슷한 신발, 단 사이즈 270만" 같은 쿼리
- HNSW 그래프 손상 없는 커스텀 필터링
- Multi-vector 지원: 상품 텍스트 + 이미지 임베딩 동시 검색

**Weaviate 장점**:
- 하이브리드 검색 (벡터 + 키워드 BM25)
- Geo-search (위치 기반 필터링)
- GraphQL 인터페이스

### 8.4 임베딩 모델 비교

| 모델 | 차원 | 한국어 성능 | 비용 | 권고 |
|------|------|-----------|------|------|
| `text-embedding-3-small` | 1536 | 양호 (다국어) | $0.02/1M tokens | **POC 단계 최적** |
| `text-embedding-3-large` | 3072 | 좋음 | $0.13/1M tokens | MVP+ |
| **`bge-m3-korean`** | 1024 | **최고** (한국어 특화) | **무료** (self-hosted) | **한국어 최적** |
| `KR-SBERT-V40K` | 768 | 좋음 (짧은 텍스트) | 무료 | 경량 대안 |
| `KoSimCSE-roberta` | 768 | 좋음 | 무료 | 유사도 특화 |

**bge-m3-korean 상세**:
- BAAI/bge-m3 기반 한국어 파인튜닝
- 568M 파라미터, 최대 시퀀스 8192 토큰
- KorSTS, KorNLI 벤치마크 파인튜닝
- 긴 텍스트에 강점 (짧은 텍스트는 KR-SBERT 대안)
- 한국어 토큰 밀도: 영어 대비 2.36배

**권고 전략**:
- POC: `text-embedding-3-small` (빠른 프로토타이핑, API 호출만으로 가능)
- MVP: `bge-m3-korean` (한국어 패션 용어 정확도 향상)
- 하이브리드: 텍스트는 `bge-m3-korean`, 이미지는 CLIP 기반 모델

---

## 9. POC→MVP 실행 전략 권고

### 9.1 Phase 1: POC (현재 → 1개월)

**목표**: 최소 비용으로 동작하는 상품 추천 파이프라인 구축

| 구성 요소 | 선택 | 이유 |
|----------|------|------|
| 상품 검색 | **SerpApi (현행 유지)** + 쿠팡 파트너스 API | SerpApi는 호출 제한 없이 다양한 소스 커버 |
| 벡터 DB | **Chroma (in-memory)** 또는 **Qdrant (Docker)** | 로컬 개발, 무료, 빠른 셋업 |
| 임베딩 | **text-embedding-3-small** | API 호출만으로 즉시 사용, 한국어 기본 지원 |
| 어필리에이트 | 쿠팡 파트너스 가입 진행 (15만원 매출 달성 목표) | |

**예상 비용**: ~$0 (SerpApi 무료 100회/월 + OpenAI 소량 사용)

### 9.2 Phase 2: MVP (1~3개월)

**목표**: 실제 수익 모델 + 다양한 상품 소스

| 구성 요소 | 선택 | 이유 |
|----------|------|------|
| 상품 소스 1 | **쿠팡 파트너스 API** | 한국 최대 이커머스, 3% 커미션 |
| 상품 소스 2 | **링크프라이스** | 다양한 국내 쇼핑몰 접근, 딥링크 API |
| 상품 소스 3 | **H&M Affiliate API** | SPA 브랜드 커버리지, 7~11% 커미션 |
| 벡터 DB | **Qdrant Cloud** (무료 1GB) | 메타데이터 필터링 강점, 패션 도메인 적합 |
| 임베딩 | **bge-m3-korean** (self-hosted) | 한국어 패션 용어 정확도 |
| 캐싱 | Redis/Upstash | 쿠팡 시간당 10회 제한 대응 |

**예상 비용**: ~$20~50/월

### 9.3 Phase 3: Growth (3~6개월)

| 구성 요소 | 선택 |
|----------|------|
| 추가 소스 | AWIN (글로벌 패션), 애드픽, 네이버 쇼핑 커넥트 |
| 벡터 DB | Qdrant self-hosted (VPS) |
| 브랜드 DB | 자체 구축 (크롤링 + 어필리에이트 데이터 병합) |
| 이미지 검색 | CLIP 임베딩 추가 → 이미지 유사도 검색 |

### 9.4 상품 소스 우선순위 (최종)

| 순위 | 소스 | 이유 |
|------|------|------|
| **1** | **쿠팡 파트너스** | 한국 최대 이커머스, 가입 간편 |
| **2** | **링크프라이스** | 다양한 국내 쇼핑몰, API 제공 |
| **3** | **SerpApi** (현행) | 크로스플랫폼, 호출 제한 유연 |
| **4** | **H&M Affiliate** | SPA 브랜드 API 접근 |
| **5** | **AWIN/Rakuten** | 글로벌 패션 브랜드 |
| **6** | **다나와 Open API** | 가격비교 데이터, 공식 API |
| 보류 | 무신사 | API 미제공, 큐레이터 프로그램은 수동 |

### 9.5 기술 아키텍처 권고

```
[사용자 이미지 업로드]
    ↓
[GPT-4o-mini Vision 분석] → 무드/아이템/컬러 추출
    ↓
[bge-m3-korean 임베딩] → 분석 결과를 벡터화
    ↓
[Qdrant 벡터 검색] → 유사 상품 매칭 (메타데이터 필터: 카테고리, 성별, 가격대)
    ↓                    ↑
    ↓              [상품 DB (배치 업데이트)]
    ↓                    ↑
    ↓         ┌──────────┼──────────┐
    ↓      쿠팡 API   링크프라이스   H&M API
    ↓      (배치 캐싱)  (딥링크)    (Product Feed)
    ↓
[결과 랭킹 + 어필리에이트 링크 부착]
    ↓
[사용자에게 상품 추천]
```

---

## 참고 소스

### 쿠팡 파트너스
- [Coupang Partners 공식](https://partners.coupang.com/)
- [Coupang Open API 개발자 포털](https://developers.coupangcorp.com/hc/en-us)
- [PCoupangAPI Python 래퍼](https://github.com/JEJEMEME/PCoupangAPI)
- [쿠팡 파트너스 API 검색 활용법](https://codedosa.com/12603)
- [쿠팡 카테고리별 판매 수수료](https://cloud.mkt.coupang.com/Fee-Table)
- [쿠팡 파트너스 이용 가이드](https://partners.coupangcdn.com/partners-guide/partners-guide-20240716100922.pdf)

### 무신사
- [무신사 큐레이터 4400명 활동, 누적 거래액 1200억](https://newsroom.musinsa.com/newsroom-menu/2025-1226)
- [무신사 파트너 스테이지](https://partner-stage.one.musinsa.com/posts/affiliate-services)
- [무신사 파트너 센터](https://partner.musinsa.com/)

### 한국 어필리에이트 네트워크
- [링크프라이스 공식](https://www.linkprice.com/)
- [링크프라이스 Affiliate Setup (GitHub)](https://github.com/linkprice/AffiliateSetup)
- [애드픽 API 가이드](https://adpick.co.kr/?ac=guide&tac=sdk&md=api)
- [텐핑 공식](https://tenping.kr/)

### 글로벌 어필리에이트
- [Amazon PA-API 5.0 문서](https://webservices.amazon.com/paapi5/documentation/)
- [AWIN 네트워크](https://www.awin.com/)
- [Rakuten Advertising API](https://developers.rakutenadvertising.com/documentation/en-US/affiliate_apis)
- [CJ Developer Portal](https://developers.cj.com/)
- [H&M Affiliate Program](https://odiproductions.com/blog/hm-affiliate-program)
- [ZARA Affiliate Program](https://www.touchdownmoney.com/zara-affiliate-program-review/)
- [UNIQLO Affiliate (Partnerize)](https://signup.partnerize.com/signup/en/uniqloglobal)

### 법적 분석
- [대법원 2021도1533 판결 — 크롤링 형사처벌 분석](https://atlaw.kr/kr-blog/%EC%9B%B9%ED%81%AC%EB%A1%A4%EB%A7%81-%ED%98%95%EC%82%AC%EC%B2%98%EB%B2%8C-%EA%B0%80%EB%8A%A5%EC%84%B1-%EB%8C%80%EB%B2%95%EC%9B%90-2021%EB%8F%841533-%ED%8C%90%EA%B2%B0-%EC%99%84%EC%A0%84%EB%B6%84/)
- [데이터 크롤링의 한국법상 허용기준 (Mondaq)](https://www.mondaq.com/copyright/1266554/%EB%8D%B0%EC%9D%B4%ED%84%B0-%ED%81%AC%EB%A1%A4%EB%A7%81%EC%9D%98-%ED%95%9C%EA%B5%AD%EB%B2%95%EC%83%81-%ED%97%88%EC%9A%A9%EA%B8%B0%EC%A4%80)
- [무단 크롤링의 법적 함정 (법률신문)](https://www.lawtimes.co.kr/news/articleView.html?idxno=202909)
- [대법원 판례속보](https://www.scourt.go.kr/portal/news/NewsViewAction.work?seqnum=8456&gubun=4&type=5)

### 벡터 DB
- [Vector DB 비교 2025 (LiquidMetal AI)](https://liquidmetal.ai/casesAndBlogs/vector-comparison/)
- [Pinecone vs Qdrant vs Weaviate (Xenoss)](https://xenoss.io/blog/vector-database-comparison-pinecone-qdrant-weaviate)
- [Self-hosting vs SaaS 비용 분석 (OpenMetal)](https://openmetal.io/resources/blog/when-self-hosting-vector-databases-becomes-cheaper-than-saas/)
- [Qdrant vs Pinecone (ScoutOS)](https://www.scoutos.com/blog/qdrant-vs-pinecone-picking-the-right-vector-database)

### 임베딩 모델
- [bge-m3-korean (Hugging Face)](https://huggingface.co/upskyy/bge-m3-korean)
- [KR-SBERT-V40K (Hugging Face)](https://huggingface.co/snunlp/KR-SBERT-V40K-klueNLI-augSTS)
- [KoSimCSE-roberta (Hugging Face)](https://huggingface.co/BM-K/KoSimCSE-roberta)

### 기타
- [다나와 Open API](http://img.danawa.com/new/open_api/api_guide.html)
- [한국 어필리에이트 마케팅 현황 (Acceleration Partners)](https://www.accelerationpartners.com/resources/apac-spotlight-affiliate-marketing-in-south-korea/)
- [한국 패션 플랫폼 순위 2025 (KoRank)](https://korank.org/fashion-platform-july-202/)
