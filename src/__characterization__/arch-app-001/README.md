# SPEC-ARCH-APP-001 — PRESERVE phase characterization tests

These tests pin the **current observable behavior** of the ai-INDEPENDENT core
paths before the domain re-layering (DDD ANALYZE-PRESERVE-IMPROVE) moves any
source. They are a **regression net**, NOT correctness assertions.

Rules (per SPEC HARD gate "Characterization-tests-precede-refactor"):

- If current behavior looks like a bug, it is PINNED here (test the actual
  behavior). Quirks are annotated with `QUIRK:` comments. Do NOT fix in IMPROVE.
- A failure after a move means the move changed observable behavior — revert,
  do not edit the test, unless the contract change is a deliberate SPEC decision
  (then update the test in the same commit with a rationale).

Scope (this run):

| File | Pins | SPEC criterion |
|---|---|---|
| `v4-scoring.test.ts` | v4 engine pure scoring building blocks + additive WEIGHTS formula | Acceptance gate 2 / REQ-APP-004 byte-identical |
| `main-flow.test.ts` | IG URL parser + `toSearchProduct` shape mapping | Acceptance gate 1 (main-flow shape) |
| `admin-auth.test.ts` | `requireApprovedAdmin` + `requireInternalKey` authz | Acceptance gate 3 (admin authz) |

Explicitly DEFERRED (ai contract dependency, NOT pinned here):
`src/app/api/find/search/route.ts` v5 client / SEARCH-UNIFY port surface.
The `/recommend` request/response contract is owned by SPEC-ARCH-AI-001
(concurrent, not frozen). Only the *pure shape mapping* (`toSearchProduct`)
inside that route is characterized — the network/contract is not.
