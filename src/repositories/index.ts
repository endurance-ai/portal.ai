// @MX:ANCHOR: [AUTO] single data-access layer barrel (SPEC-ARCH-APP-001 REQ-APP-002)
// @MX:REASON: 44 import sites consolidate through this layer; per-entity repositories land when handlers are thinned (later step).
// @MX:SPEC: SPEC-ARCH-APP-001
export {supabase} from "@/repositories/clients/postgrest"
export {pool} from "@/repositories/clients/pg-pool"
