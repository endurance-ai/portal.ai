// Thin re-export shim — real pg Pool moved to src/repositories/clients/pg-pool.ts
// (SPEC-ARCH-APP-001 REQ-APP-002). Keeps all `@/lib/db` import sites working
// unchanged during domain modularization rollout.
export * from "@/repositories/clients/pg-pool"
