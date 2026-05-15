// Thin re-export shim — real client moved to src/repositories/clients/postgrest.ts
// (SPEC-ARCH-APP-001 REQ-APP-002). Keeps all `@/lib/supabase` import sites working
// unchanged during domain modularization rollout.
export * from "@/repositories/clients/postgrest"
