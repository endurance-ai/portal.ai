# 품질 평가 테스트 케이스 v1

> 15개 케이스 (중간 난이도) — 2026-04-07
> 가격대: 10~50만원
> 이미지 소스: `/Users/hansangho/Desktop/스타트업/목데이터/`

---

## A. 이미지 전용 (5개)

### A-1. `3.jpg` — 2인 사진, 누구를 분석할 것인가

- **입력**: 이미지만 (`3.jpg`)
- **난이도 포인트**: 2명이 찍힘 (왼쪽: 블랙 데님자켓+스트라이프 팬츠+레드캡, 오른쪽: 네이비 데님자켓+로데님+블랙캡). AI가 2인을 어떻게 처리하는지 확인
- **기대 결과**:
  - 2인 모두 분석 or 메인 피사체 1인 선택 후 분석
  - category: Outer(denim-jacket), Bottom(jeans/wide-pants)
  - styleNode: A-3 (헤리티지 빈티지) or I (재패니즈 워크웨어)
  - colorFamily: NAVY, BLACK
  - fit: oversized, relaxed
  - fabric: denim
- **평가 기준**: 2인 처리 방식의 합리성, 데님 온 데님 인식 정확도

---

### A-2. `12.jpg` — 하체 가려진 앉은 자세 + 액세서리 다수

- **입력**: 이미지만 (`12.jpg`)
- **난이도 포인트**: 쪼그려 앉아서 하체가 거의 안 보임. 네이비 니트 + 카모 버킷햇 + 체인 브레이슬릿 + 올리브 팬츠 → 하체 추론 필요, 악세서리 다수
- **기대 결과**:
  - category: Top(sweater), Accessories(hat), Bottom(추론)
  - subcategory: sweater or knit-top, cargo-pants or chinos
  - colorFamily: NAVY, GREEN/KHAKI, BROWN
  - styleNode: D (컨템퍼러리 캐주얼) or A-3 (빈티지)
  - fit: relaxed
  - fabric: knit, cotton
- **평가 기준**: 가려진 하체 처리 (무시 vs 추론), 소품 인식률

---

### A-3. `11.jpg` — 보더 스트라이프 + 와이드 팬츠, 패턴 인식

- **입력**: 이미지만 (`11.jpg`)
- **난이도 포인트**: 보더 스트라이프 컷소(네이비×화이트)는 단색이 아닌 패턴. 와이드 블랙 팬츠. 컬러 판단이 NAVY인지 MULTI인지 애매
- **기대 결과**:
  - category: Top(t-shirt or knit-top), Bottom(wide-pants or trousers)
  - colorFamily: 상의 NAVY or MULTI, 하의 BLACK
  - styleNode: I (재패니즈 워크웨어) or D (컨템퍼러리 캐주얼)
  - fit: regular(상), relaxed/oversized(하)
  - fabric: jersey or cotton, cotton or wool
- **평가 기준**: 스트라이프 패턴 → colorFamily 매핑 정확도, 스타일 노드 판별

---

### A-4. `f5.jpg` — 여성 레이어드 룩, 가디건+이너 분리

- **입력**: 이미지만 (`f5.jpg`)
- **난이도 포인트**: 블루 가디건 + 그레이 이너(탱크탑 or 캐미솔) + 로데님 → 레이어드 분리 인식. 가디건이 Outer인지 Top인지 분류 애매
- **기대 결과**:
  - category: Outer(cardigan) or Top(cardigan), Top(tank-top or camisole), Bottom(jeans)
  - colorFamily: BLUE, GREY, NAVY/BLUE
  - styleNode: D (컨템퍼러리 캐주얼) or K (영캐주얼)
  - fit: regular(가디건), slim(이너), relaxed(데님)
  - fabric: knit, cotton, denim
  - gender: women
- **평가 기준**: 가디건 카테고리 분류, 이너 분리 인식, 성별 감지

---

### A-5. `4.jpg` — 그래픽 티 텍스트 해석 + 스트라이프 와이드팬츠

- **입력**: 이미지만 (`4.jpg`)
- **난이도 포인트**: "WAKE AND MAKE" 레터링 티 → AI가 텍스트를 스타일 정보로 혼동할 수 있음. 그레이 스트라이프 와이드팬츠 + 캡 + 토트백
- **기대 결과**:
  - category: Top(t-shirt), Bottom(wide-pants or trousers), Accessories(cap), Bag(tote)
  - colorFamily: GREY(상하 모두)
  - styleNode: H (스트릿 캐주얼) or D (컨템퍼러리 캐주얼)
  - fit: oversized(상), relaxed(하)
  - fabric: cotton, cotton or linen
- **평가 기준**: 그래픽/텍스트 티셔츠 처리, 스트라이프 팬츠 subcategory 정확도

---

## B. 프롬프트 전용 (5개)

### B-1. 모호한 무드 표현

- **프롬프트**: `"카페에서 입기 좋은 꾸안꾸 봄 데일리룩 남자"`
- **난이도 포인트**: "꾸안꾸"는 구체적 아이템이 아닌 무드. AI가 어떻게 카테고리/아이템으로 변환하는지
- **기대 결과**:
  - items: Top(shirt or knit-top), Bottom(chinos or trousers), Shoes(loafers or sneakers)
  - colorFamily: BEIGE, CREAM, WHITE, GREY 계열
  - styleNode: D (컨템퍼러리 캐주얼)
  - fit: relaxed or regular
  - season: spring
  - gender: men
  - 가격대: 15~35만원
- **평가 기준**: 무드 → 구체적 아이템 변환 품질, 검색 결과 적합도

---

### B-2. 복합 조건 + 소재 지정

- **프롬프트**: `"린넨 셔츠에 와이드 치노 여름 코디 30만원대"`
- **난이도 포인트**: 소재(린넨)+아이템(셔츠)+실루엣(와이드)+아이템(치노)+시즌+가격 → 복합 조건 파싱
- **기대 결과**:
  - items: Top(shirt, linen, relaxed), Bottom(chinos, wide, cotton or linen)
  - colorFamily: BEIGE, WHITE, CREAM, KHAKI
  - styleNode: D or I
  - fit: relaxed(상), relaxed/oversized(하)
  - season: summer
  - 가격대: 25~35만원
- **평가 기준**: 소재/실루엣/가격 조건이 검색 결과에 실제 반영되는지

---

### B-3. 서브컬처 레퍼런스

- **프롬프트**: `"90년대 그런지 감성 데님 자켓 코디 여자"`
- **난이도 포인트**: "90년대 그런지"라는 서브컬처 레퍼런스 → 구체적 스타일 속성으로 변환 필요
- **기대 결과**:
  - items: Outer(denim-jacket), Top(t-shirt or tank-top), Bottom(jeans or skirt)
  - colorFamily: BLUE, BLACK, GREY
  - styleNode: B-2 (얼터너티브 캐주얼) or A-3 (헤리티지 빈티지)
  - fit: oversized(자켓), relaxed
  - fabric: denim, cotton
  - gender: women
  - 가격대: 10~30만원
- **평가 기준**: 서브컬처 키워드의 스타일 노드 매핑 정확도

---

### B-4. 구체적 아이템 + 스타일링 맥락

- **프롬프트**: `"네이비 블레이저에 어울리는 캐주얼 하의 뭐가 좋을까 남자 40만원"`
- **난이도 포인트**: 상의가 이미 정해진 상태에서 하의 추천. 매칭 능력 테스트
- **기대 결과**:
  - items: Bottom(chinos or jeans or trousers), 상의는 참고용으로만 추출
  - colorFamily: BEIGE, GREY, CREAM, KHAKI (네이비와 매칭)
  - styleNode: D (컨템퍼러리 캐주얼) or C (미니멀 컨템퍼러리)
  - fit: regular or slim
  - fabric: cotton, denim, wool
  - gender: men
  - 가격대: 20~40만원
- **평가 기준**: 상의 기반 하의 추천 로직, 컬러 매칭 적합도

---

### B-5. 오케이전 + TPO

- **프롬프트**: `"주말 미술관 데이트 코디 여자 깔끔하게"`
- **난이도 포인트**: "미술관 데이트"라는 TPO에서 적절한 드레스코드 추론 필요. "깔끔하게"라는 수식어
- **기대 결과**:
  - items: Top(blouse or knit-top) or Dress(midi-dress or shirt-dress), Bottom(trousers or skirt), Bag(shoulder-bag or tote), Shoes(loafers or flats)
  - colorFamily: WHITE, CREAM, BEIGE, BLACK, NAVY
  - styleNode: F (미니멀 페미닌) or D (컨템퍼러리 캐주얼)
  - fit: regular or slim
  - occasion: date
  - gender: women
  - 가격대: 20~45만원
- **평가 기준**: TPO → 드레스코드 추론 품질, 오케이전 매칭

---

## C. 이미지 + 프롬프트 (이미지는 무드 참고용, 5개)

### C-1. `1.jpg` + 무드 유지, 아이템 변경

- **이미지**: `1.jpg` (세이지 가디건 + 워싱 와이드 데님 + 펄체인 + NY캡)
- **프롬프트**: `"이 무드로 여름 버전 코디 찾아줘 30만원"`
- **난이도 포인트**: 무드(빈티지 스트릿)는 유지하면서 여름 아이템으로 전환. 두꺼운 가디건→가벼운 아우터/상의
- **기대 결과**:
  - 무드: 빈티지/스트릿 유지
  - items: Top(t-shirt or shirt), Bottom(shorts or jeans), Accessories(cap)
  - styleNode: A-3 or H (원본 무드 유지)
  - colorFamily: GREEN, BLUE 계열 유지
  - fit: oversized or relaxed
  - fabric: cotton, denim, linen
  - season: summer
  - 가격대: 15~30만원
- **평가 기준**: 원본 무드 추출 + 시즌 전환 능력

---

### C-2. `9.jpg` + 소재 변경 요청

- **이미지**: `9.jpg` (블랙 크루넥 + 올리브 카고팬츠 + 네온 스니커즈)
- **프롬프트**: `"이 느낌인데 전부 니트 소재로 찾아줘 남자 40만원"`
- **난이도 포인트**: 무드와 컬러는 유지하되 소재를 전부 니트로 변경. 카고팬츠의 니트 버전 → 어떤 subcategory로 매핑하는지
- **기대 결과**:
  - 무드: 컨템퍼러리 캐주얼 유지
  - items: Top(sweater or knit-top), Bottom(trousers or joggers — 니트 소재)
  - colorFamily: BLACK, KHAKI/GREEN
  - styleNode: D
  - fit: relaxed
  - fabric: knit, wool
  - gender: men
  - 가격대: 25~40만원
- **평가 기준**: 소재 조건 반영도, 원본 컬러/무드 유지

---

### C-3. `f1.jpg` + 성별 전환

- **이미지**: `f1.jpg` (여성, 체크 크롭티 + 브라운 와이드팬츠 + 캡)
- **프롬프트**: `"이 무드 남자 버전으로 찾아줘 25만원"`
- **난이도 포인트**: 여성 룩의 무드를 남성 아이템으로 변환. 크롭티→? 로의 자연스러운 전환
- **기대 결과**:
  - 무드: 컨템퍼러리 캐주얼 / 영캐주얼
  - items: Top(t-shirt or shirt), Bottom(wide-pants or chinos)
  - colorFamily: WHITE/BLUE(체크 무드 유지), BROWN
  - styleNode: D or K
  - fit: regular or relaxed
  - fabric: cotton
  - gender: men (프롬프트 우선)
  - 가격대: 15~25만원
- **평가 기준**: 성별 전환 시 무드 보존율, 아이템 대체 합리성

---

### C-4. `13.jpg` + 가격 축소 + 부분 교체

- **이미지**: `13.jpg` (파타고니아 플리스 + 그레이 팬츠 + 캡 + 백팩)
- **프롬프트**: `"비슷한 아웃도어 캐주얼인데 플리스 말고 바람막이로 10만원대"`
- **난이도 포인트**: 특정 아이템(플리스)만 교체 요청 + 저가격대 제약. 나머지 무드 유지
- **기대 결과**:
  - items: Outer(windbreaker or anorak), Bottom(trousers or chinos), Accessories(cap)
  - colorFamily: BEIGE/CREAM(원본 유지), GREY
  - styleNode: G (테크니컬 고프코어) or A-1
  - fit: regular or relaxed
  - fabric: nylon, ripstop, gore-tex
  - 가격대: 10~19만원
- **평가 기준**: 부분 교체 정확도, 가격 제약 반영

---

### C-5. `f3.jpg` + 격식 올리기

- **이미지**: `f3.jpg` (여성, 기능성 스트라이프 블라우스 + 카키 반바지 + 캡)
- **프롬프트**: `"이 컬러감 유지하면서 좀 더 격식 있게 입고 싶어 회사 캐주얼데이 50만원"`
- **난이도 포인트**: 캐주얼 → 비즈캐주얼로 격식 올리면서 컬러톤 유지. 반바지→풀렝스, 블라우스 유지/업그레이드
- **기대 결과**:
  - 무드: 컬러감 유지 (블루+카키)
  - items: Top(blouse or shirt), Bottom(trousers or chinos), Shoes(loafers or flats)
  - colorFamily: BLUE, BEIGE/KHAKI
  - styleNode: F (미니멀 페미닌) or D
  - fit: regular or slim
  - fabric: cotton, linen
  - occasion: office casual
  - gender: women
  - 가격대: 30~50만원
- **평가 기준**: 격식 레벨 조절 능력, 컬러톤 보존율

---

## 평가 체크리스트

각 케이스에 대해 아래 항목을 점수화 (1~5):

| 항목 | 설명 |
|------|------|
| **아이템 추출** | 이미지/프롬프트에서 아이템을 빠짐없이 정확하게 추출했는가 |
| **카테고리 정확도** | category + subcategory가 올바른가 |
| **스타일 노드** | 기대 styleNode와 일치 or 인접 노드인가 |
| **컬러 매칭** | colorFamily가 실제 이미지/프롬프트와 부합하는가 |
| **핏/소재** | fit, fabric 추출이 정확한가 |
| **검색 결과 적합도** | 반환된 상품이 실제로 원본 스타일과 어울리는가 |
| **조건 반영** | 가격, 성별, 시즌 등 명시 조건이 결과에 반영되었는가 |
| **특수 처리** | 난이도 포인트(2인, 가려짐, 성별전환 등)를 잘 처리했는가 |
