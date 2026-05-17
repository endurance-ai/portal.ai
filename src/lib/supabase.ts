// Thin re-export shim — real client moved to src/repositories/clients/postgrest.ts
// (SPEC-ARCH-APP-001 REQ-APP-002). Keeps all `@/lib/supabase` import sites working
// unchanged during domain modularization rollout.
import "server-only" // defense-in-depth: keep per-hop guard on the shim (P2-001)
export * from "@/repositories/clients/postgrest"
