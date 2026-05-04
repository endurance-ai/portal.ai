## SPEC-V6-EVAL-V2 Progress

- Started: 2026-05-04
- Methodology: DDD (per quality.yaml)
- Harness: minimal (4 task, well-scoped, plan-audit 2 iter PASS in plan phase)
- Mode: --solo
- Branch: feature/spec-v6-eval-v2
- Strategy: 2 blocks
  - Block A: V2-T-000 (precondition tsx) + V2-T-001 (backend judgmentRows) + V2-T-002 (frontend grade unblock) — 라벨링 unblock end-to-end
  - Block B: V2-T-003 (seed script) — 30 골든셋 데이터 시딩
- Phase 0.5/0.9/0.95/1.6/1.7/1.8 SKIPPED — minimal harness, scope frozen at plan phase
- Block A COMPLETE (T-000 + T-001 + T-002):
  - T-000: tsx 4.21.0 → devDependencies (1 LOC + lockfile)
  - T-001: run/route.ts judgmentRows 응답 (+13/-7 LOC) + 신규 테스트 1 (6/6 pass). 502 시 judgmentRows 키 omit (REQ-001 D3 contract).
  - T-002: eval-labeling-form.tsx unblock (+20/-30, graceful degrade 제거 + judgmentRows 매핑) + 신규 .test.tsx (~205 LOC, 4 tests)
  - @MX:NOTE × 1 신규 (run route judgmentRows 누적)
  - Full suite: 175 passed / 6 skipped / 0 failed (170 → 175). characterization 11/11 회귀 0.
- Awaiting Block B (T-003 seed script).
