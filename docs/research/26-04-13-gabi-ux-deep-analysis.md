# GABI (가전비서 V2) UX 딥 분석 — portal.ai Q&A Agent 개선 적용

> 작성일: 2026-04-13
> 목적: GABI의 UX 패턴을 portal.ai `/agent` 4단계 MVP에 적용 가능한 개선안 도출
> 기반: gabi.ai.kr 소스코드 분석, 경쟁사(HAVI) 실제 서비스, AI 쇼핑 에이전트 UX 벤치마크

---

## Quick Wins — 즉시 적용 가능한 상위 5개 개선

| # | 대상 Step | 개선 내용 | 이유 | 1일 내 가능 |
|---|-----------|----------|------|-------------|
| 1 | Step 1 (Input) | **분석 중 "Stream of Thought" 로딩 UI** — 현재 `animate-pulse` 텍스트 한 줄 → 분석 단계별 진행 표시 ("Detecting items... → Extracting attributes... → Mapping styles...") | GABI는 OCR 파싱 중 품목/가격이 하나씩 나타나는 스트리밍 UI 사용. 사용자가 "AI가 일하고 있다"는 느낌을 받아야 이탈 방지 | O |
| 2 | Step 2 (Attributes) | **AI 추출 결과 인라인 수정 가능** — 현재 lock/unlock만 가능 → 각 attribute 카드 탭 시 드롭다운으로 값 변경 가능하게 ("AI가 추출한 값을 사용자가 검증/수정") | GABI의 견적서 파싱 후 "사용자 검증" 패턴 핵심. Shape of AI의 "Verification" 패턴 | O |
| 3 | Step 2 (Attributes) | **"1~2개 lock" 제한 제거, 대신 우선순위 표시** — 필수 lock 개수 대신 모든 속성 토글 가능 + 선택 순서 표시 (1st, 2nd 뱃지) | GABI는 "중요도 순서"로 사용자 의사를 반영. 현재 2개 제한은 직관적이지 않음 | O |
| 4 | Step 3 (Refine) | **톨러런스 슬라이더 → 텍스트 기반 선택지 3개로 단순화** — "Exact match / Similar / Explore widely" 카드 3장 | GABI는 예산 외 조건을 AI가 Q&A로 추론. range input보다 의미 있는 프리셋이 모바일에서 훨씬 접근성 높음 | O |
| 5 | Step 4 (Results) | **Reference vs Recommended 나란히 비교 뷰** — 현재 레퍼런스 카드가 상단에 작게만 표시 → 첫 번째 추천 상품과 나란히 "원본 vs AI 추천" 비교 카드 | GABI의 `/quote-agent/product-compare` 핵심 패턴. "이게 왜 더 나은지"를 시각적으로 증명해야 구매 확신 | O |

---

## 1. GABI 서비스 개요 & 조사 제한 사항

### 조사 범위

| 소스 | 상태 |
|------|------|
| gabi.ai.kr 직접 접근 | React SPA (Vite + Stackflow) → 정적 크롤 불가, 타이틀만 수집 |
| 한국 블로그/커뮤니티 후기 | 2026-04 기준 공개 사용 후기/캡쳐 없음 (PMF 초기 비공개 단계 추정) |
| 소스코드 JS 번들 분석 | 기존 분석 문서에서 라우트 구조, API 엔드포인트, 컴포넌트 이름 확인 |
| 경쟁사 HAVI (롯데하이마트) | 2026-04-02 오픈 베타, 뉴스 기사에서 UX 방향성 확인 |
| AI 쇼핑 에이전트 UX 벤치마크 | Shape of AI, Eleken, Opascope 등에서 패턴 라이브러리 수집 |

> 주의: GABI의 실제 화면 캡쳐를 확보하지 못했습니다. 아래 분석의 상당 부분은 소스코드의 라우트/컴포넌트 구조 + 업계 표준 UX 패턴에 기반한 합리적 추론입니다. (추정) 표시로 구분합니다.

---

## 2. GABI 단계별 UX 패턴 분석

### 2-1. 온보딩 (/onboarding)

**(추정)** Stackflow 기반 모바일 네이티브 앱 느낌의 스택 네비게이션. Chakra UI + Framer Motion.

| 패턴 | 설명 |
|------|------|
| 진행 표시 | (추정) 상단 프로그레스 바 또는 스텝 인디케이터. Stackflow activity 기반이므로 화면 전환 시 iOS/Android 네이티브 슬라이드 애니메이션 |
| 질문 톤 | (추정) 한국어 캐주얼 격식체 ("~해 주세요", "~인가요?"). 가전이라 격식/친근 중간 톤 |
| CTA | (추정) 화면 하단 고정 "다음" 버튼. Chakra Button + motion 페이드 |

**portal.ai 적용 시사점**: 현재 `/agent`의 AgentProgress는 상단 수평 스텝퍼로 데스크탑에 적합하지만, 모바일에서 4개 스텝 라벨이 좁아질 수 있음. GABI처럼 스텝 번호만 표시하고 라벨은 화면 제목으로 이동하는 것을 고려.

### 2-2. 견적서 업로드 & AI 파싱 (/consultation/upload → /consultation/parsing)

| 패턴 | 설명 |
|------|------|
| 입력 | 견적서 이미지 업로드 (카메라/갤러리) |
| AI 파싱 피드백 | (추정) SSE 또는 polling 기반으로 품목이 하나씩 나타나는 스트리밍 UI. `gabi-quote-parser-production` 별도 서버 존재 |
| 사용자 검증 | (추정) 파싱 결과를 리스트로 보여주고 각 항목 수정/삭제/추가 가능. 16+ 카테고리 드롭다운 |

**핵심 UX**: 사용자가 이미 가지고 있는 맥락(견적서)을 출발점으로 삼는다. portal.ai에서는 "레퍼런스 이미지"가 이에 해당.

**portal.ai 대응** (Step 1 → Step 2):
- 현재: 이미지/프롬프트 제출 → 로딩 → 갑자기 Step 2로 전환
- 개선안: 분석 중 단계별 피드백 ("Found 3 items → Extracting colors → Mapping style nodes") + 결과를 한 번에 보여주되 "맞나요?" 확인 스텝 삽입

### 2-3. 라이프스타일 Q&A (/quote-agent/lifestyle-questions)

| 패턴 | 설명 |
|------|------|
| 질문 구조 | 가족 수, 주거 크기, 요리 빈도, 브랜드 선호, 우선순위 — 맥락 기반 |
| 선택지 카드 | (추정) 아이콘 + 짧은 텍스트 카드 (Chakra Card). 한 화면에 4~6개 선택지 |
| 진행 | (추정) 1화면 1질문 (Stackflow activity 스택 push/pop) |
| 응답 방식 | (추정) 단일선택(라디오)/다중선택(체크박스)/슬라이더 혼합 |

**핵심 UX**: "1화면 1질문" 원칙으로 인지 부하를 최소화. 사용자가 5초 내 의사결정 가능한 수준.

**portal.ai 적용 시사점**:
- 현재 Step 3 (Refine)에 슬라이더 + 가격 입력 + 이유 선택이 한 화면에 몰려 있음
- GABI처럼 "1화면 1질문" 분리 고려: (a) 톤 선택 → (b) 예산 → (c) 이유
- 단, portal.ai는 이미 4단계라 더 늘리면 피로감. 대안: Step 3 내에서 섹션별 스크롤 + 각 섹션에 명확한 질문 헤딩

### 2-4. 구매 목적 상담 & 스펙 필터 (/consultation/purpose → /quote-agent/hard-filters)

| 패턴 | 설명 |
|------|------|
| 조건 추론 | `/api/infer-conditions`: Q&A 응답 + 예산 → AI가 검색 조건 자동 추론 |
| 사용자 검증 | (추정) AI가 추천한 스펙 조건을 카드/칩 형태로 보여주고 사용자가 on/off 토글 |
| 필터 UI | (추정) 카테고리별 다른 필터 (냉장고: 용량/도어타입/에너지등급, TV: 크기/해상도 등) |

**핵심 UX**: "AI가 추출 → 사용자가 검증/수정" 패턴 (Shape of AI: Verification pattern). 사용자에게 통제감을 줌.

**portal.ai 적용 시사점** (Step 2 핵심 개선):
- 현재: AI가 추출한 6개 속성을 보여주고 lock만 가능
- 개선안: 각 속성 카드를 탭하면 AI가 추출한 값 + 대안 값 드롭다운 표시. 예: colorFamily "Black" 탭 → "Navy", "Charcoal", "Dark Brown" 선택 가능
- GABI의 `/api/spec-advice` 처럼 각 속성의 중요도/설명 툴팁 추가 가능 (장기)

### 2-5. 예산 설정 (/quote-agent/budget)

| 패턴 | 설명 |
|------|------|
| 입력 방식 | (추정) 슬라이더 + 직접 입력 혼합. 가전은 가격 범위가 크므로 프리셋 + 커스텀 |
| 프리셋 | (추정) "30만원 이하 / 50만원 / 100만원 / 직접 입력" 같은 빠른 선택지 |

**portal.ai 적용 시사점** (Step 3):
- 현재: Min ₩ / Max ₩ 수동 입력. 대부분의 패션 아이템은 가격 범위 예측 가능
- 개선안: 카테고리별 프리셋 가격 범위 추가 ("Under ₩50K / ₩50-100K / ₩100-200K / Custom")

### 2-6. AI 제품 추천 — 스트리밍 (/quote-agent/product-result, product-stream)

| 패턴 | 설명 |
|------|------|
| 스트리밍 | SSE(`/api/analyze-result-stream`) 기반 실시간 분석 결과 전달 |
| 로딩 UX | (추정) 분석 메시지가 한 줄씩 타이핑 효과로 나타남 → 제품 카드가 하나씩 등장 |
| 결과 표시 | (추정) 카테고리별 추천 + 각 제품에 "왜 이걸 추천했는지" AI 설명 |

**핵심 UX**: 결과가 "한 번에 뿅" 나타나지 않고 스트리밍으로 점진적 표시. 대기 시간 체감 감소.

**portal.ai 적용 시사점** (Step 4):
- 현재: `searching` 상태에서 6개 skeleton 카드 → 결과 한 번에 표시
- 개선안: 상품이 하나씩 `stagger` 애니메이션으로 나타나도록 (현재 `delay: idx * 0.04`로 이미 일부 구현되어 있지만, skeleton → 실제 카드 전환이 한 번에 발생)
- SSE 스트리밍까지 가지 않아도 검색 결과 도착 후 카드별 딜레이를 0.04 → 0.15초로 늘리면 "하나씩 찾아주는" 느낌

### 2-7. 제품 비교 (/quote-agent/product-compare)

| 패턴 | 설명 |
|------|------|
| 비교 구조 | `/api/generate-comparison`: 원본 견적 제품 vs AI 추천 대안 |
| 시각화 | (추정) 사이드바이사이드 비교 카드. 좌: 원본, 우: 추천. 공통 스펙 행 정렬 |
| AI 설명 | (추정) 각 비교 포인트에 "이 대안이 왜 나은지" 자연어 설명 |
| 가격 차이 | (추정) 원본 가격 vs 추천 가격 하이라이트 (절감액 표시) |

**핵심 UX**: "단순 추천" → "비교를 통한 확신" 전환. 사용자가 왜 대안을 선택해야 하는지 근거 제시.

**portal.ai 적용 시사점** (Step 4 핵심 개선):
- 현재: 레퍼런스 카드가 상단에 작은 `h-20 w-20` 썸네일로만 표시
- 개선안:
  1. 결과 상단에 "Your Reference vs Top Match" 비교 섹션 추가
  2. 좌: 레퍼런스 이미지 + AI 추출 속성, 우: 1위 추천 상품 + 매칭 속성
  3. 속성별 일치/차이를 시각적으로 표시 (체크마크 / 다른 값)
  4. 패션에서는 가격보다 "스타일 매치도" 강조 → gradient score 시각화

### 2-8. 음성 AI (LiveKit + ElevenLabs)

| 패턴 | 설명 |
|------|------|
| 호출 위치 | (추정) 상담 결과 화면 하단 또는 플로팅 버튼 |
| 용도 | 복잡한 스펙 비교를 음성으로 설명 ("이 냉장고가 왜 좋은지") |
| 인터랙션 | "버튼을 눌러 음성 상담을 시작하세요" → WebRTC 양방향 음성 |

**portal.ai 적용**: 장기 백로그. 패션은 가전보다 설명 복잡도가 낮아 음성 우선순위 낮음.

---

## 3. GABI vs portal.ai 현재 MVP 갭 분석

| GABI 패턴 | portal.ai 현재 (Step) | 갭 | 개선 난이도 |
|-----------|----------------------|-----|----------|
| 견적서 AI 파싱 → 스트리밍 피드백 | 분석 중 `animate-pulse` 한 줄 (Step 1) | 스트리밍/단계별 피드백 없음 | Low |
| 파싱 결과 사용자 검증/수정 | 속성 lock만 가능, 값 수정 불가 (Step 2) | 사용자 통제감 부족 | Medium |
| 1화면 1질문 Q&A | 슬라이더+가격+이유 한 화면 (Step 3) | 인지 부하 높음 | Low |
| AI 추천 스펙 조건 on/off | 6개 속성 2개 제한 lock (Step 2) | 제한적 유연성 | Low |
| 원본 vs 대안 비교 뷰 | 레퍼런스 작은 썸네일 (Step 4) | 비교 근거 시각화 없음 | Medium |
| SSE 스트리밍 결과 | 전체 결과 한 번에 표시 (Step 4) | 대기 체감 줄이기 부족 | Low |
| 카테고리별 프리셋 가격 | Min/Max 수동 입력 (Step 3) | 편의성 부족 | Low |
| AI 스펙 설명 제공 | 속성 설명 없음 (Step 2) | 교육적 컨텐츠 부재 | Medium |
| 음성 AI 상담 | 없음 | 채널 부재 | High |
| 대리점 경쟁 입찰 | N/A (패션에 해당 없음) | N/A | N/A |

---

## 4. 확장 개선 제안 (6~10위)

### 6. Step 2 — 속성 카드에 AI 신뢰도 표시
- **현재**: 6개 속성을 동등하게 나열
- **개선**: 각 속성에 AI 신뢰도 뱃지 (High/Medium/Low). 낮은 신뢰도 속성은 "수정 권장" 힌트
- **이유**: GABI의 `spec-advice` API처럼 사용자가 어디를 수정해야 할지 가이드
- **난이도**: Medium (analyze API 응답에 신뢰도 필드 추가 필요)

### 7. Step 1 → 2 전환 — "이게 맞나요?" 확인 화면
- **현재**: 분석 완료 → 바로 Step 2로 자동 전환
- **개선**: "We found 3 items. Tap to review." 중간 확인 화면 삽입. 사용자가 "Looks good" 탭해야 진행
- **이유**: Shape of AI "Verification" 패턴. 사용자가 AI 결과를 승인하는 느낌
- **난이도**: Low (현재 reducer에 `ANALYZE_SUCCESS` → 자동 `step: "attributes"` 변경 부분에 중간 상태 추가)

### 8. Step 3 — 가격 프리셋 칩
- **현재**: Min ₩ / Max ₩ 수동 텍스트 입력
- **개선**: 카테고리별 프리셋 가격 범위 칩 추가 ("Under ₩50K", "₩50K-100K", "₩100K-200K", "₩200K+", "No limit")
- **이유**: GABI 예산 설정에서 프리셋 사용 추정. 모바일에서 숫자 입력보다 탭이 빠름
- **난이도**: Low

### 9. Step 4 — 매칭 스코어 시각화
- **현재**: `matchReasons` 텍스트 칩만 표시
- **개선**: 각 상품 카드에 "Match 85%" 같은 수치 + 작은 바 차트로 어떤 속성이 매칭/불일치인지 표시
- **이유**: GABI의 스펙 비교 차원(33개+)처럼 매칭 근거를 수치로 보여줘야 신뢰감 향상
- **난이도**: Medium (search-products API가 이미 score 반환 중이므로 프론트만 추가)

### 10. 모바일 최적화 — 하단 CTA 고정
- **현재**: CTA 버튼이 콘텐츠 하단 인라인 배치
- **개선**: Step 2, 3에서 "Next" 버튼을 `sticky bottom-0` 으로 고정. 스크롤해도 항상 보이게
- **이유**: GABI는 Stackflow 기반 모바일 퍼스트 → CTA가 항상 화면 하단. Wizard UI 베스트 프랙티스
- **난이도**: Low

---

## 5. 벤치마크 UX 패턴 — AI 쇼핑 에이전트 업계 표준

### 5-1. Shape of AI 핵심 패턴 매핑

| Shape of AI 패턴 | GABI 적용 | portal.ai 현재 | 개선 기회 |
|-----------------|----------|--------------|----------|
| **Verification** — AI 결정을 사용자가 확인 후 진행 | 견적 파싱 결과 검증 | 없음 (자동 전환) | Step 1→2 확인 화면 |
| **Variations** — 여러 변형 중 선택 | 대안 제품 비교 | 상품 그리드만 있음 | 비교 뷰 추가 |
| **Stream of Thought** — AI 로직 과정 공개 | (추정) 파싱 진행 표시 | 없음 | 분석 중 피드백 |
| **Follow up** — 추가 정보 요청 | 라이프스타일 Q&A | Step 3 Refine | 이미 구현, 개선 여지 |
| **Suggestions** — 빈 캔버스 해결 | (추정) 인기 카테고리 추천 | 프롬프트 placeholder | 예시 프롬프트 칩 추가 |
| **Action plan** — 실행 전 단계 공개 | 조건 추론 후 보여주기 | 없음 | 검색 전 "이렇게 찾겠습니다" 요약 |
| **Citations** — 출처 표시 | 제품 스펙 출처 | matchReasons 칩 | 이미 일부 구현 |

### 5-2. Wizard UI 베스트 프랙티스 (Eleken)

| 원칙 | portal.ai 현재 준수도 | 개선 필요 |
|------|---------------------|----------|
| 3~7 스텝 이내 | O (4스텝) | - |
| 프로그레스 바 | O (AgentProgress) | 모바일에서 라벨 가독성 |
| 1화면 1의사결정 | X (Step 3에 3개 모음) | 섹션 분리 |
| Next/Back 일관된 위치 | O | 모바일에서 sticky bottom 필요 |
| 자동 저장 | X (새로고침 시 초기화) | 장기 (URL state 또는 sessionStorage) |
| 에러 인라인 표시 | O (Step 1 에러 배너) | - |

### 5-3. 롯데하이마트 HAVI 참고점

| HAVI 패턴 | 설명 | portal.ai 적용 |
|-----------|------|--------------|
| 하단 네비게이션 바에서 즉시 접근 | 어떤 화면에서든 AI 상담 진입 | 메인 페이지에서 `/agent` 진입 경로 명확화 |
| 자연어 질문 + 맥락 유지 | "신혼집에 맞는 냉장고" → 추가 조건 입력 시 맥락 보존 | 현재 Refine 단계가 유사하지만 텍스트 리파인 없음 |
| 추천 → 장바구니 직결 | 상품 클릭 → 바로 구매 | 외부 링크로 이동 (현재 적절) |
| 상품 간 비교 분석 강화 예정 | 2026 하반기 정식 오픈 시 | 비교 뷰는 우리가 먼저 구현 가능 |

---

## 6. 장기 백로그 (현재 적용 어려운 항목)

| 항목 | GABI 구현 | portal.ai 적용 시 고려사항 | 우선순위 |
|------|----------|-------------------------|---------|
| **음성 AI 상담** | LiveKit + ElevenLabs WebRTC | 인프라 비용 높음, 패션은 시각 중심이라 음성 ROI 낮음 | Low |
| **대리점 경쟁 입찰** | 5개 대리점 견적 수집 | 패션 편집샵에는 견적 개념 없음. 다만 "여러 플랫폼 가격 비교"로 대체 가능 | Medium |
| **SSE 스트리밍 결과** | analyze-result-stream API | 현재 search-products는 단일 응답. SSE로 전환하면 UX 개선 크지만 API 리팩토링 필요 | Medium |
| **견적서 OCR 파싱** | 별도 파싱 서버 (Railway) | 패션에서는 "가격 태그 OCR" 또는 "제품 라벨 인식"으로 변형 가능하지만 ROI 불확실 | Low |
| **멀티턴 AI 채팅** | /api/ai-chat 스트리밍 대화 | 현재 Q&A는 구조화된 스텝 방식. 자유 대화는 방향이 다름. 장기적으로 hybrid 고려 | Medium |
| **Stackflow 네이티브 전환** | 모바일 앱 네이티브 느낌 | Next.js App Router에서 유사 효과는 framer-motion으로 충분. 별도 도입 불필요 | Skip |
| **카테고리별 동적 질문** | /api/spec-questions (품목별 AI 질문 생성) | 패션 아이템별 다른 질문 (코트: 기장/충전재, 바지: 핏/밑위) → 장기적 차별화 가능 | Medium |

---

## 7. portal.ai Q&A Agent 개선 로드맵 요약

### Phase 1 — 즉시 (1~2일)
1. 분석 중 "Stream of Thought" 로딩 UI (Quick Win #1)
2. 톨러런스 슬라이더 → 3개 프리셋 카드 (Quick Win #4)
3. 모바일 하단 CTA 고정 (#10)

### Phase 2 — 이번 주 (3~5일)
4. 속성 카드 인라인 수정 (Quick Win #2)
5. Lock 개수 제한 제거 + 우선순위 표시 (Quick Win #3)
6. Reference vs Recommended 비교 뷰 (Quick Win #5)
7. 가격 프리셋 칩 (#8)

### Phase 3 — 다음 스프린트
8. Step 1→2 "확인" 중간 화면 (#7)
9. 매칭 스코어 시각화 (#9)
10. AI 속성 신뢰도 표시 (#6)

---

## 출처

### GABI 분석 기반
- gabi.ai.kr 프론트엔드 소스코드 분석 (JS 번들 리버스 엔지니어링) — 기존 분석 문서
- [THE VC - 레브잇](https://thevc.kr/levit)
- [서울대 전기정보공학부 강재윤 특강](https://ece.snu.ac.kr/community/events?md=v&bbsidx=56580)

### 경쟁사 HAVI
- [디지털데일리 - 롯데하이마트 하비 도입](https://www.ddaily.co.kr/page/view/2026040208581828999)
- [헤럴드경제 - 하비 띄웠다](https://biz.heraldcorp.com/article/10709406)
- [파이낸셜뉴스 - 검색은 줄이고 상담은 늘렸다](https://www.fnnews.com/news/202604021432357216)

### UX 패턴 벤치마크
- [Shape of AI — UX Patterns for AI Design](https://www.shapeof.ai/)
- [Eleken — Wizard UI Pattern](https://www.eleken.co/blog-posts/wizard-ui-pattern-explained)
- [Opascope — AI Shopping Assistant Guide 2026](https://opascope.com/insights/ai-shopping-assistant-guide-2026-agentic-commerce-protocols/)
- [Algolia — AI Shopping Assistants Guide](https://www.algolia.com/blog/ecommerce/ai-shopping-assistants)
- [Kakao Ventures — AI Agent Shopping](https://www.kakao.vc/blog/ai-agent-shopping)

### 기술 참고
- [Stackflow (daangn/stackflow) GitHub](https://github.com/daangn/stackflow) — GABI가 사용하는 모바일 네비게이션 프레임워크
- [Stackflow 공식 문서](https://stackflow.so/docs/get-started/activity)
