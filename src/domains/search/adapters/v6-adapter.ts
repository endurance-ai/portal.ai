// @MX:ANCHOR: [AUTO] v6 active SearchEngine adapter — embedding-first engine,
//   the sole SearchEngine implementation behind the preserved port.
//   /api/find/search calls this via selectEngine(); strong + general both
//   route through search_products_v6 (SPEC-SEARCH-V6-001 §4/§13).
// @MX:REASON: [AUTO] SPEC-SEARCH-V6-001 §6/§10c [HARD] keeps the port interface
//   preserved with v6 as the sole engine — the route caller diff stays 0.
//   Drift here breaks the v6 retrieval contract (cosine-only ranking,
//   ratified §13 결정 1 degrade fallback, strong/general grouping).
// @MX:SPEC: SPEC-SEARCH-V6-001
import "server-only"
import {logger} from "@/lib/logger"
import type {RecommendRequest, RecommendResponse, SearchEngine, SearchProduct,} from "../engine-port"

// @MX:NOTE: [AUTO] supabase / style-nodes-db / query-embed are LAZILY imported
//   inside search() — NOT at module scope. registry.ts STATICALLY imports this
//   adapter, and @/lib/supabase THROWS at module-eval when DB_URL is unset.
//   Keeping the DB chain lazy keeps module-eval of the search stack
//   side-effect-free: the find-search-route regression net imports the route
//   without mocking @/lib/supabase, so a module-scope DB import would throw at
//   import time. Lazy import defers that to the first search() call.
// @MX:SPEC: SPEC-SEARCH-V6-001

/**
 * SPEC-SEARCH-V6-001 P1 — v6 embedding-first engine.
 *
 * Pipeline (SPEC §4 + ratified §13, re-论 금지):
 *   1. query_emb  = FashionSigLIP(image [+ text fused 0.7/0.3]) via Modal
 *      (query-embed.ts). image fail → failed:true (AC-012).
 *   2. FILTER 1   styleNode.primary (node CODE) → style_nodes.id →
 *                 brand_nodes.primary_style_node_id (EXACT, REQ-V6-010).
 *   3. FILTER 2   products WHERE brand_node_id ∈ filter1 brands
 *                 AND category match AND in_stock AND product_embeddings row.
 *   4. RANK       cosine(query_emb, product_embeddings.embedding) DESC,
 *                 created_at DESC (REQ-V6-012) — all in search_products_v6.
 *   5. FALLBACK   thin/0 node pool (or unmapped node) → category-only cosine
 *                 with degraded flag (ratified §13 결정 1, REQ-V6-034).
 *
 * Grouping mirrors v5-adapter VERBATIM in shape (engine-port.ts contract):
 *   - general call always runs (no brand narrowing).
 *   - strong call ONLY when req.brandFilter non-empty (narrows to those
 *     brand names). Strong-only failure → strongMatches:[], NOT failed
 *     (matches the v5 QUIRK regression: only the general path gates failed).
 *   - failed:true ⟺ the general path could not run (image embed failed or
 *     DB threw) → route maps to its 502 AI_SERVER_FAILED (verbatim).
 *
 * Degraded provenance WITHOUT a new RecommendResponse field (SPEC §6 frozen
 * shape): degraded general result → engine:"v6-degraded" (mirrors the
 * documented "v4-degraded" provenance precedent); else engine:"v6". The
 * route already echoes result.engine verbatim into its envelope.
 */

const RESULT_LIMIT = 30

interface V6Row {
  id: number
  brand: string
  name: string
  price: number | null
  image_url: string | null
  product_url: string | null
  platform: string | null
  subcategory: string | null
  distance: number
  degraded: boolean
}

// Frontend SearchProduct shape. Price quirk mirrors v5-adapter toSearchProduct
// VERBATIM (null → "", 0 → "₩0") to keep envelope translation consistent.
const toSearchProduct = (r: V6Row): SearchProduct => ({
  brand: r.brand,
  title: r.name,
  price: r.price != null ? `₩${r.price.toLocaleString("ko-KR")}` : "",
  platform: r.platform ?? "",
  imageUrl: r.image_url ?? "",
  link: r.product_url ?? "",
})

// Minimal structural type for the PostgREST client's rpc — avoids importing
// the supabase types at module scope (the import must stay lazy).
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{data: unknown; error: {message: string} | null}>
}

/**
 * One v6 retrieval call (general OR strong). Returns null on DB failure so
 * the caller can apply the v5-parity failed-gate (general null ⇒ failed).
 */
async function runV6(
  db: RpcClient,
  embeddingLiteral: string,
  styleNodeId: number | null,
  category: string,
  subcategory: string | undefined,
  brandNames: string[] | null,
  label: string,
): Promise<V6Row[] | null> {
  const {data, error} = await db.rpc("search_products_v6", {
    query_embedding: embeddingLiteral,
    p_style_node_id: styleNodeId,
    p_category: category,
    p_subcategory: subcategory ?? null,
    p_brand_names: brandNames,
    p_limit: RESULT_LIMIT,
  })
  if (error) {
    logger.warn(
      `[v6][${label}] search_products_v6 RPC failed — ${error.message}`,
    )
    return null
  }
  return (data ?? []) as V6Row[]
}

export const v6Adapter: SearchEngine = {
  version: "v6",

  async search(req: RecommendRequest): Promise<RecommendResponse> {
    // ── 1) query embedding (image mandatory, text optional fuse) ────
    let embeddingLiteral: string
    try {
      const {buildQueryEmbedding, toVectorLiteral} = await import(
        "../query-embed"
      )
      const {embedding, fused} = await buildQueryEmbedding(
        req.imageUrl,
        req.item.searchQuery,
      )
      embeddingLiteral = toVectorLiteral(embedding)
      logger.info(
        `[v6] query embedding ready — dim=${embedding.length} fused=${fused}`,
      )
    } catch (err) {
      logger.error(
        `[v6] query embedding failed → failed:true | ${(err as Error).message}`,
      )
      return {strongMatches: [], general: [], engine: "v6", failed: true}
    }

    // ── 2) FILTER 1 anchor: node CODE → style_nodes.id (EXACT) ──────
    // Unmapped / absent code → null → search_products_v6 takes the
    // degraded category-only path (REQ-V6-034 / ratified §13 결정 1).
    let styleNodeId: number | null = null
    const primaryCode = req.styleNode?.primary
    if (primaryCode) {
      try {
        const {getStyleNodeByCode} = await import("@/lib/style-nodes-db")
        const node = await getStyleNodeByCode(primaryCode)
        styleNodeId = node?.id ?? null
      } catch (err) {
        logger.warn(
          `[v6] style node lookup failed (code=${primaryCode}) → degraded path | ${(err as Error).message}`,
        )
      }
    }

    const brandNames =
      req.brandFilter.length > 0 ? req.brandFilter : null

    // Resolve the PostgREST client ONCE (single lazy import — module-eval
    // stays import-side-effect-free; concurrent dynamic imports avoided).
    const {supabase} = await import("@/lib/supabase")
    const db = supabase as unknown as RpcClient

    // ── 3) strong (brandFilter) + general in parallel ──────────────
    const [strongRows, generalRows] = await Promise.all([
      brandNames
        ? runV6(
            db,
            embeddingLiteral,
            styleNodeId,
            req.item.category,
            req.item.subcategory,
            brandNames,
            "strong",
          )
        : Promise.resolve(null),
      runV6(
        db,
        embeddingLiteral,
        styleNodeId,
        req.item.category,
        req.item.subcategory,
        null,
        "general",
      ),
    ])

    // general null ⇒ DB failed entirely → failed:true (v5-parity gate).
    if (generalRows === null) {
      return {strongMatches: [], general: [], engine: "v6", failed: true}
    }

    // Provenance: degraded iff EITHER ran path degraded (general or strong).
    // SPEC §13 결정 1: degraded ⟺ any gate relaxed — don't mask a strong-only
    // degrade behind a non-degraded general result.
    const degraded =
      (generalRows.length > 0 && generalRows[0].degraded) ||
      (strongRows !== null && strongRows.length > 0 && strongRows[0].degraded)
    const engine = degraded ? "v6-degraded" : "v6"

    return {
      strongMatches:
        strongRows && strongRows.length > 0
          ? [{id: "strong", products: strongRows.map(toSearchProduct)}]
          : [],
      general:
        generalRows.length > 0
          ? [{id: "general", products: generalRows.map(toSearchProduct)}]
          : [],
      engine,
      failed: false,
    }
  },
}
