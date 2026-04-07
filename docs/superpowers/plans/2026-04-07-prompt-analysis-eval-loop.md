# 프롬프트 분석 품질 평가 루프 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프롬프트 전용 분석 품질을 자동 평가하고, 결과 기반으로 프롬프트를 반복 개선한다.

**Architecture:** 15개 테스트 케이스 JSON + eval 스크립트가 localhost:3400 API를 호출하여 분석 → 기대값 비교 → 점수 산출. Claude Code가 결과를 읽고 프롬프트를 수정한 뒤 재실행하는 루프.

**Tech Stack:** TypeScript (tsx), fetch API, localhost:3400 /api/analyze

---

## File Structure

| 파일 | 역할 |
|------|------|
| `scripts/eval-prompt-cases.json` | 15개 프롬프트 테스트 케이스 (입력 + 기대값) |
| `scripts/eval-prompt.ts` | 평가 스크립트 — API 호출 → 채점 → 리포트 |
| `scripts/output/eval-prompt-*.json` | 라운드별 결과 저장 |
| `src/lib/prompts/prompt-search.ts` | 개선 대상 프롬프트 |

## NOT in scope

- 이미지 분석 테스트 (이번엔 프롬프트 전용만)
- 검색 엔진 가중치 튜닝 (분석 품질 먼저)
- Supabase 골든셋 연동 (로컬 JSON으로 충분)
- UI 변경

---

### Task 1: 테스트 케이스 JSON 작성

**Files:**
- Create: `scripts/eval-prompt-cases.json`

- [ ] **Step 1: 15개 프롬프트 테스트 케이스 작성**

```json
[
  {
    "id": "P-01",
    "prompt": "카페에서 입기 좋은 꾸안꾸 봄 데일리룩 남자",
    "gender": "male",
    "expected": {
      "minItems": 2,
      "items": [
        { "category": "Top", "subcategory": ["shirt", "knit-top", "t-shirt"], "colorFamily": ["BEIGE", "CREAM", "WHITE", "GREY"] },
        { "category": "Bottom", "subcategory": ["chinos", "trousers", "jeans"], "colorFamily": ["BEIGE", "CREAM", "KHAKI", "GREY"] }
      ],
      "styleNode": ["D"],
      "adjacentNodes": ["A-3", "K", "C"],
      "gender": "male"
    }
  }
  // ... 14 more
]
```

각 케이스의 expected 구조:
- `minItems`: 최소 추출 아이템 수
- `items[].category`: 정확 매치
- `items[].subcategory`: 허용 목록 (배열)
- `items[].colorFamily`: 허용 목록 (배열, null 허용)
- `styleNode`: 정확 매치 목록
- `adjacentNodes`: 부분 점수 허용 노드
- `gender`: 기대 성별

---

### Task 2: 평가 스크립트 작성

**Files:**
- Create: `scripts/eval-prompt.ts`

- [ ] **Step 1: 스크립트 작성**

핵심 로직:
```typescript
// 1. 케이스 로드
const cases = JSON.parse(fs.readFileSync("scripts/eval-prompt-cases.json", "utf-8"))

// 2. 케이스별 API 호출
for (const tc of cases) {
  const form = new FormData()
  form.append("prompt", tc.prompt)
  form.append("gender", tc.gender)
  const res = await fetch("http://localhost:3400/api/analyze", { method: "POST", body: form })
  const analysis = await res.json()
  
  // 3. 채점
  const score = scoreCase(tc.expected, analysis)
  results.push({ id: tc.id, score, analysis })
}

// 4. 리포트 출력
```

채점 함수:
```typescript
function scoreCase(expected, actual): CaseScore {
  let total = 0
  
  // category 매치 (30점) — 기대 아이템 카테고리가 실제 아이템에 있는지
  // subcategory 매치 (20점) — 허용 목록 내 매치
  // colorFamily 매치 (20점) — 허용 목록 내 매치
  // styleNode 매치 (20점) — 정확 매치 20점, 인접 12점
  // fit/fabric 존재 여부 (10점) — null 아닌지만 체크
  
  return { total, breakdown, verdict }  // pass(≥70) / partial(≥50) / fail(<50)
}
```

- [ ] **Step 2: 실행 확인**

```bash
npx tsx scripts/eval-prompt.ts
```

Expected: 15개 케이스 결과 + 총점 요약 콘솔 출력

- [ ] **Step 3: 결과 JSON 저장**

`scripts/output/eval-prompt-round1-YYYYMMDD-HHmm.json`에 전체 결과 저장

---

### Task 3: Round 1 실행 → 분석 → 프롬프트 수정

- [ ] **Step 1: eval 실행**
- [ ] **Step 2: 결과 분석 — 공통 실패 패턴 파악**
- [ ] **Step 3: `prompt-search.ts` 수정**
- [ ] **Step 4: 수정 내용 브리핑**

---

### Task 4: Round 2 실행 → 비교

- [ ] **Step 1: 동일 케이스 재실행**
- [ ] **Step 2: Round 1 vs Round 2 점수 비교**
- [ ] **Step 3: 개선/퇴보 분석 → 추가 수정 or 완료**

---
