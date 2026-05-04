# SPEC-V6-EVAL-V2 Plan Audit — Iter 1

Audited: 2026-05-04
Auditor: plan-auditor (fresh context per M1)

## Verdict: FAIL

## Defects Found

### Blocker
- **D1**: 4 SPEC files frontmatter missing 3 of 8 required fields (author, priority, issue_number). plan.md uses non-standard `spec_id` instead of `id`.

### Major
- **D2**: REQ-V6-EVAL-V2-002 contains compound trigger (mount-time mapping + click-time PATCH). Should split into 002a + 002b.
- **D3**: acceptance.md Scenario 1.2 has forking contract "judgmentRows 필드가 포함되지 않으며 (또는 빈 배열도 허용)" — non-binary testable.
- **D4**: REQ-003 onConflict target hedging ("또는 동등 부모 SPEC unique 제약 기준") — must read parent migration 033 and state exact column.

### Minor
- **D5**: acceptance.md Scenario 2.1 weasel word "border-turquoise 클래스 등".
- **D6**: DoD disjunction "실제 staging 환경 또는 통합 테스트 1회 실행".
- **D7**: stdout 4-line ordering inconsistency between Scenario 3.1 and 3.2.
- **D8**: package.json "선택" flag creates count ambiguity.
- **D9**: tsx devDependency assumption unverified.

## Verdict Rationale

FAIL — 1 blocker (frontmatter missing fields) is decisive. 3 major defects (compound REQ, forking contract, onConflict ambiguity) prevent reliable downstream Run-phase execution. 5 minor defects are mechanical fixes.
