# 어필리에이트 & 글로벌 확장 전략

> - **작성일**: 2026-04-02
> - **최종 검증**: 2026-04-02 (웹 검색 기반 팩트체크 완료)
> - **프로젝트**: portal.ai — AI 이미지 기반 패션 무드 분석 & 상품 추천
> - **목적**: 현재 국내 편집샵 크롤링 한계 → 지속 가능한 상품 소싱 & 수익화 전략 수립

---

## 현재 상태 진단

### 지금 하고 있는 것
| 항목 | 상태 | 한계 |
|------|------|------|
| Cafe24 편집샵 크롤링 | 9개 샵 운영 중 | Cafe24 기반만 가능, JS 렌더링 불안정 |
| Fashion Genome DB | 1,079 브랜드 매핑 | 크롤링된 상품만 검색 가능 (~8K-10K SKU) |
| SerpApi fallback | DB 부족 시 Google Shopping | 어필리에이트 아님, 월 100회 무료 한계 |

### 핵심 문제
1. **스케일 한계**: Cafe24 편집샵만 크롤링 → SKU 수 부족, 브랜드 다양성 제한
2. **수익화 부재**: 상품 링크가 직접 링크 → 커미션 트래킹 없음
3. **법적 리스크**: 크롤링은 합법이나, 대형 플랫폼(무신사/29CM)은 안티스크래핑 + ToS 위반 우려
4. **재고 신선도**: 크롤링 기반이라 실시간 재고/가격 반영 불가

---

## 플랫폼별 어필리에이트 & API 현황 (2026-04-02 검증)

### ~~ShopStyle Collective~~ → 폐업 확정

| 항목 | 상태 |
|------|------|
| 현재 상태 | **2025-12-12 폐업 발표**, "Collective Voice"로 리브랜딩 후 서비스 종료 |
| 어필리에이트 링크 | **2026-03-31부로 트래킹 중단** (이미 종료) |
| 최종 정산 | 2026-07-19 |
| 계정 완전 폐쇄 | 2026-07-31 |
| Product Search API | **완전 사망** — 신규 가입 불가, 엔드포인트 403 |

> **결론: ShopStyle/Collective Voice는 선택지에서 완전 제외**

### CJ Affiliate ✅ 검증 완료 — 가입 가능

| 항목 | 검증 결과 |
|------|----------|
| 가입 URL | `https://signup.cj.com/member/signup/publisher/` → `public.cj.com/signup/publisher` (리디렉트, 정상) |
| 한국 퍼블리셔 | **가능** — 200+ 국가 지원, Payoneer 결제 (수수료 0%) |
| 최소 결제 | $50 (Payoneer) |
| API | **GraphQL Product API** — `https://ads.api.cj.com/query` (REST는 deprecated) |
| API 인증 | Personal Access Token + CompanyId |
| API 문서 | `https://developers.cj.com/graphql/reference/Product%20Feed` |
| 승인 소요 | 퍼블리셔 1-3일, 개별 광고주 1-4주 |
| 주의사항 | API 안정성 이슈 보고됨 (2025년, 수일간 다운 사례) |

**확인된 럭셔리 패션 광고주:**

| 브랜드 | CJ 상태 | 커미션 | 쿠키 기간 | 비고 |
|--------|---------|--------|----------|------|
| **SSENSE** | ✅ Active | **7.5%** | 30일 | Partnerize에도 있음 |
| **Farfetch** | ✅ Active | **5-13%** (기본 ~7%) | — | 쿠팡 인수 후에도 유지, 한국 포함 12개 지역 |
| **NET-A-PORTER** | ✅ Active | ~6% | — | Rakuten에도 있음 |
| **REVOLVE** | ✅ Active | — | — | CJ 케이스 스터디 존재 |
| **Saks Fifth Avenue** | ✅ Active | 3-6% | — | — |
| **Nordstrom** | ✅ Active | 2-5% | — | — |

### AWIN ✅ 검증 완료 — 가입 가능

| 항목 | 검증 결과 |
|------|----------|
| 가입 URL | `https://ui.awin.com/publisher-signup` |
| 가입비 | **$1-5 (환불 가능)** — 첫 정산 시 돌려줌 |
| 한국 퍼블리셔 | **가능** — 17개 글로벌 거점, Payoneer 지원 |
| API | **Product Feed API** — JSONL (Google Format), 5 req/min |
| API 엔드포인트 | `GET https://api.awin.com/publishers/{ID}/awinfeeds/download/{ADVERTISER_ID}-{VERTICAL}-{LOCALE}` |
| API 문서 | `https://developer.awin.com/docs/product-feed-intro` (2025년 7-10월 업데이트) |

**확인된 패션 광고주:**

| 브랜드 | 커미션 | 쿠키 | 비고 |
|--------|--------|------|------|
| **ASOS** | ~6% | 45일 | AWIN 주력 패션 |
| **END Clothing** | 3-5% | — | 검색에서 확인 필요 (AWIN 디렉토리) |
| **H&M** | — | — | 지역별 상이 |

### Rakuten Advertising ✅ 검증 완료 — 가입 가능

| 항목 | 검증 결과 |
|------|----------|
| 가입 | 무료, 수일 내 승인 |
| Product Search API | **XML 응답**, 최대 5,000 결과, **100 req/min** |
| API 문서 | `https://developers.rakutenadvertising.com/guides/product_search` |
| 제한사항 | ⚠️ US 퍼블리셔는 SSN/EIN 필요 — 한국 퍼블리셔 세금 처리 확인 필요 |

**확인된 패션 광고주:**

| 브랜드 | 비고 |
|--------|------|
| **NET-A-PORTER** | ✅ 11년 파트너십 (Rakuten 케이스 스터디) |
| **Mr Porter** | ✅ 동일 그룹 |
| **SSENSE** | △ 재구조화 중 (2025년 리더십 교체) — 확인 필요 |

### Amazon PA-API → ⚠️ 이달 폐기 예정

| 항목 | 상태 |
|------|------|
| PA-API 5.0 | **2026-04-30 폐기**, 5/15 엔드포인트 완전 종료 |
| 대체 | **Amazon Creators API** (OAuth 2.0) |
| 가입 조건 | ⚠️ **최근 30일간 10건 이상 판매 실적** 필요 |
| Shopbop | 어필리에이트 자체는 유지 (5-10%, 14일 쿠키) |

> **결론: 신규 가입자는 판매 실적 요건 때문에 당장 사용 불가. 장기 과제로 분류.**

### 기타 검증된 네트워크

| 네트워크 | 상태 | Product API | 패션 강점 | portal.ai 적합도 |
|----------|------|------------|----------|-----------------|
| **Skimlinks** | ✅ Active | Product API (query/categories) | Farfetch, H&M, Everlane (48,500+ 머천트) | ★★★★ 자동 링크 변환 |
| **Impact.com** | ✅ Active | Catalog API v12 (JSON) | Adidas, Reebok, Stitch Fix | ★★★ DTC 중심 |
| **Connexity** | ✅ Active | CSV feed + API | 100M+ 상품 | ★★★ 가격 비교 |
| **ChatAds** | ✅ Active | AI 전용 API | AI 쇼핑 어시스턴트 특화 | ★★★★ 조사 필요 |

### 국내 플랫폼 (변동 없음)

| 플랫폼 | 어필리에이트 | API | 현실적 접근 |
|--------|------------|-----|------------|
| **무신사** | X (인플루언서 한정) | X | 당장 불가 |
| **29CM** | X (케이스별 협의) | X | 무신사 그룹 — 동일 |
| **쿠팡** | O (파트너스) | △ (매출 기준) | 패션 특화 아님 |
| **LinkPrice** | O (한국 전문) | O | 한국 패션 5-15% |

---

## 실행 전략: 3단계 로드맵 (검증 기반 수정)

### Phase 1 — 지금 당장 가능 (1-2주)

#### 1-1. ✅ CJ Affiliate 가입 (P0)
**왜 첫 번째인가**: 럭셔리 패션 광고주 최다 + GraphQL Product API 제공 + 한국 퍼블리셔 가능

**가입 절차:**
1. `https://signup.cj.com/member/signup/publisher/` 접속
2. 필요 정보: portal.ai URL, 프로모션 모델("AI-powered fashion product recommendation"), 트래픽 정보
3. W-8BEN 세금 양식 제출 (개인) — [IRS 양식](https://www.irs.gov/forms-pubs/about-form-w-8-ben)
4. Payoneer 계정 연결 (없으면 가입 필요 — payoneer.com, 무료)
5. 퍼블리셔 승인 대기 (1-3일)
6. 승인 후: SSENSE, Farfetch, NET-A-PORTER, Mytheresa, LUISAVIAROMA에 개별 Apply
7. `developers.cj.com`에서 Personal Access Token 발급 → GraphQL API 사용 시작

**예상 수익 시뮬레이션:**
- SSENSE 7.5%, 평균 주문 $300 → 건당 $22.5
- Farfetch 7%, 평균 주문 $400 → 건당 $28
- 월 50건 전환 가정 → **월 $1,000-1,400 (약 130-180만원)**

#### 1-2. ✅ AWIN 가입 (P0)
**왜 동시에 하는가**: CJ에 없는 ASOS (10만+ SKU) + 유럽 패션 커버리지

**가입 절차:**
1. `https://ui.awin.com/publisher-signup` 접속
2. 가입비 $1-5 결제 (첫 정산 시 환불)
3. portal.ai URL + 프로모션 설명 입력
4. 승인 후: ASOS, END Clothing 등 패션 광고주 Apply
5. Product Feed API로 상품 데이터 수집 시작

#### 1-3. Skimlinks 가입 (P1)
**왜**: 기존 크롤링 상품 URL을 자동으로 어필리에이트 링크로 변환 가능

**가입 절차:**
1. `https://www.skimlinks.com/` 퍼블리셔 가입 (무료)
2. 기존 product_url → Skimlinks 래핑 적용
3. 48,500+ 머천트 자동 커버

### Phase 2 — 앞으로 고려할 부분 (1-3개월)

#### 2-1. 멀티 소스 상품 파이프라인 아키텍처
```
[CJ GraphQL API]  ──┐
[AWIN Feed API]   ──┤
[Rakuten API]     ──┼──→ [통합 상품 DB] ──→ [검색 API]
[기존 크롤링]     ──┤      (Supabase)
[Skimlinks 래핑]  ──┘
```
- products 테이블에 `source`, `affiliate_url`, `commission_type`, `commission_rate` 추가
- 소스별 상품 동기화 스케줄러 (daily/weekly)

#### 2-2. Rakuten Advertising 가입
- NET-A-PORTER 11년 파트너십 → 럭셔리 피드 확보
- Product Search API (XML, 100 req/min) — CJ보다 안정적일 수 있음
- 한국 퍼블리셔 세금 처리 방식 사전 확인 필요

#### 2-3. ChatAds 조사 & 연동 검토
- AI 쇼핑 어시스턴트 전용으로 설계된 신규 플랫폼
- 커미션 수수료 0% (API 호출당 과금)
- portal.ai 같은 AI 기반 서비스에 최적화 가능성 — 상세 조사 필요

#### 2-4. Fashion Genome DB ↔ 어필리에이트 상품 매핑
- 1,079 브랜드의 스타일 노드 → 어필리에이트 상품 자동 태깅
- brand_nodes.brand_name_normalized ↔ 피드 브랜드명 매칭 로직

### Phase 3 — 오래 걸리지만 꼭 하면 좋은 부분 (3-6개월+)

#### 3-1. Amazon Creators API 연동 (Shopbop)
- PA-API 5.0 → 2026-04-30 폐기, Creators API로 마이그레이션 필수
- **선결 조건**: Associates 계정에서 30일간 10건 판매 실적
- Shopbop 상품 프로그래매틱 검색 가능
- Skimlinks를 통한 Shopbop 링크로 먼저 실적 쌓기 → 이후 직접 API 전환

#### 3-2. 커미션 최적화 엔진
- 같은 상품이 여러 소스에 있을 때, 커미션이 가장 높은 소스 우선 노출
- A/B 테스트: CPC vs CPA 수익 비교

#### 3-3. 국내 플랫폼 공식 파트너십
- 서비스 트래픽 확보 후 무신사/29CM에 직접 제휴 제안
- LinkPrice 통한 국내 패션 브랜드 어필리에이트 네트워크

#### 3-4. 실시간 재고/가격 동기화
- 어필리에이트 피드 기반 → 크롤링보다 신선한 데이터
- 품절 상품 자동 비활성화

---

## 우선순위 매트릭스 (검증 기반 수정)

| 액션 | 임팩트 | 난이도 | 우선순위 | 비고 |
|------|--------|--------|---------|------|
| CJ Affiliate 가입 | ★★★★★ | ★★ | **P0** | SSENSE 7.5%, Farfetch 7% |
| AWIN 가입 | ★★★★ | ★★ | **P0** | ASOS 6%, 유럽 커버리지 |
| Skimlinks 가입 | ★★★ | ★ | **P1** | 기존 상품 자동 수익화 |
| Rakuten 가입 | ★★★★ | ★★ | **P1** | NET-A-PORTER |
| 멀티 소스 DB 설계 | ★★★★ | ★★★ | **P1** | Phase 2 기반 |
| ChatAds 조사 | ★★★ | ★ | **P1** | AI 전용 — 잠재력 높음 |
| Genome ↔ 어필리에이트 매핑 | ★★★★ | ★★★ | **P1** | 차별화 핵심 |
| Amazon Creators API | ★★★ | ★★★★ | **P2** | 판매 실적 선결 |
| 커미션 최적화 | ★★★ | ★★★★ | **P2** | 데이터 축적 후 |
| 무신사/29CM 파트너십 | ★★★★ | ★★★★★ | **P2** | 트래픽 확보 후 |

---

## NOT in scope

- ~~ShopStyle Collective~~ — 2026-03-31부로 서비스 종료, 선택지 제외
- ~~Amazon PA-API 5.0~~ — 2026-04-30 폐기 예정, 신규 가입 불가
- 자체 결제/체크아웃 시스템 구축
- 무신사/29CM 크롤링 (법적 리스크)
- 중국 플랫폼 (Taobao, JD 등)
- 인플루언서 마케팅 플랫폼 (LTK 등)

---

## 핵심 인사이트 (검증 후 수정)

1. **ShopStyle은 죽었다** — 2026-03-31부로 트래킹 종료. 대안은 CJ + AWIN + Rakuten 조합.

2. **CJ Affiliate가 Phase 1 최우선** — SSENSE(7.5%), Farfetch(5-13%), NET-A-PORTER(6%) 모두 확인됨. GraphQL Product API 제공. 한국 퍼블리셔 가능.

3. **AWIN은 ASOS 확보용** — 10만+ SKU의 ASOS를 잡으려면 AWIN 필수. CJ와 동시 진행 가능.

4. **Amazon은 당장 못 한다** — PA-API는 이달 폐기, Creators API는 판매 실적 10건 요구. Skimlinks로 우회하며 실적 쌓기.

5. **ChatAds는 다크호스** — AI 쇼핑 어시스턴트 전용 어필리에이트. portal.ai와 콘셉트 일치. 상세 조사 가치 있음.

6. **크롤링 → 어필리에이트 전환은 필수 방향** — 합법성, 스케일, 수익화 모두 어필리에이트가 우세.

---

## 출처 (검증에 사용된 소스)

- ShopStyle 폐업: [RetailBoss](https://retailboss.co/collective-voice-shut-down-what-happened/), [netinfluencer](https://www.netinfluencer.com/creator-marketing-platform-collective-voice-announces-closure/)
- CJ 가입: [signup.cj.com](https://signup.cj.com/member/signup/publisher/) (302 → public.cj.com, 정상)
- CJ API: [developers.cj.com/graphql/reference/Product Feed](https://developers.cj.com/graphql/reference/Product%20Feed)
- CJ + Payoneer: [junction.cj.com](https://junction.cj.com/article/global-innovation-payoneer)
- SSENSE on CJ: [affi.io/m/ssense](https://affi.io/m/ssense)
- Farfetch 어필리에이트: [getlasso.co/affiliate/farfetch](https://getlasso.co/affiliate/farfetch/)
- AWIN 가입: [ui.awin.com/publisher-signup](https://ui.awin.com/publisher-signup/en/awin/)
- AWIN API: [developer.awin.com/docs/product-feed-intro](https://developer.awin.com/docs/product-feed-intro)
- Rakuten API: [developers.rakutenadvertising.com/guides/product_search](https://developers.rakutenadvertising.com/guides/product_search)
- Amazon PA-API 폐기: [webservices.amazon.com/paapi5/documentation](https://webservices.amazon.com/paapi5/documentation/)
- Skimlinks: [developers.skimlinks.com](https://developers.skimlinks.com/)
