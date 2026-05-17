// @MX:WARN: [AUTO] v4 degraded fallback — wraps searchByEnums RAW output; scorer/ranker run as-is, NOT re-maintained here (SPEC-SEARCH-UNIFY-001 REQ-SU-004/007)
// @MX:REASON: This is a degraded safety net engaged ONLY on v5 total failure. It must NOT become a second scoring source — REQ-SU-007 forbids merging v4 scoring into the active path.
// @MX:SPEC: SPEC-SEARCH-UNIFY-001
import "server-only"
import {
  searchByEnums,
  sanitizeKeyword,
  CATEGORY_ALIASES,
} from "@/domains/search-v4"
import type {BrandDna, SearchQuery} from "@/domains/search-v4"
import {logger} from "@/lib/logger"
import type {
  RecommendRequest,
  RecommendResponse,
  SearchEngine,
  SearchProduct,
} from "../engine-port"

/**
 * SPEC-SEARCH-UNIFY-001 IMPROVE 3/6 — v4 thin degraded fallback adapter.
 *
 * Wraps the ALREADY-EXTRACTED `searchByEnums` (SPEC-ARCH-APP-001, NOT this
 * SPEC's work). Per REQ-SU-007 this adapter does NOT re-implement or maintain
 * scoring: it calls `searchByEnums` as-is (its scorer/ranker run internally,
 * frozen) and consumes the RAW `ScoredProduct[]` output. The adapter only
 * (a) builds the engine args from the port request the same way the live
 * `/api/search-products` caller does, and (b) normalizes the result element
 * into the route envelope's SearchProduct slot.
 *
 * This is a DEGRADED safety net — engaged ONLY when v5 totally fails (driven
 * by the circuit breaker, IMPROVE 4/5). Provenance is marked
 * `engine: "v4-degraded"` so the route can echo it; the client renders
 * identically (quality degradation is an internal metric only — spec
 * Acceptance Criteria "fallback 상태머신 정의").
 *
 * Arg construction mirrors src/app/api/search-products/route.ts:67-101
 * (the only live searchByEnums caller): genderFilter map, CATEGORY_ALIASES,
 * styleNode primary/secondary, sanitized itemKeywords, empty brandDnaMap
 * (brand boost 0 — old brand_nodes columns dropped, see that caller's note).
 */

const toSearchProduct = (p: {
  brand: string
  title: string
  price: string
  platform: string
  imageUrl: string
  link: string
}): SearchProduct => ({
  brand: p.brand,
  title: p.title,
  price: p.price,
  platform: p.platform,
  imageUrl: p.imageUrl,
  link: p.link,
})

export const v4FallbackAdapter: SearchEngine = {
  version: "v4-degraded",

  async search(req: RecommendRequest): Promise<RecommendResponse> {
    const t0 = Date.now()
    const genderFilter =
      req.gender === "female" ? "women" : req.gender === "male" ? "men" : null
    const primaryNode = req.styleNode?.primary
    const secondaryNode = req.styleNode?.secondary

    const item: SearchQuery = {
      id: req.item.id,
      category: req.item.category,
      subcategory: req.item.subcategory,
      fit: req.item.fit,
      fabric: req.item.fabric,
      colorFamily: req.item.colorFamily,
      searchQuery: req.item.searchQuery,
      searchQueryKo: req.item.searchQueryKo,
    }

    const dbCategories = CATEGORY_ALIASES[item.category] ?? null

    const itemKeywords: string[] = []
    if (item.searchQuery)
      itemKeywords.push(
        ...item.searchQuery
          .toLowerCase()
          .split(/\s+/)
          .map(sanitizeKeyword)
          .filter(Boolean),
      )
    if (item.searchQueryKo)
      itemKeywords.push(
        ...item.searchQueryKo
          .split(/\s+/)
          .map(sanitizeKeyword)
          .filter(Boolean),
      )

    // Old brand_nodes.style_node / sensitivity_tags dropped (062/067) ⇒
    // empty map, brand boost 0 (verbatim from the live search-products caller).
    const brandDnaMap = new Map<string, BrandDna>()
    const hasBrandFilter = req.brandFilter.length > 0

    try {
      const products = await searchByEnums(
        item,
        genderFilter,
        dbCategories,
        primaryNode,
        secondaryNode,
        req.moodTags,
        req.priceFilter,
        itemKeywords,
        brandDnaMap,
        hasBrandFilter ? req.brandFilter : null,
      )

      logger.warn(
        `[find/search][v4-degraded] ⚠️ degraded fallback served — ${Date.now() - t0}ms | raw RPC results=${products.length} | brandFilter=${hasBrandFilter}`,
      )

      // v4 has no strong/general split — it returns a single ranked list.
      // Map into the route's `general` slot (degraded: no brand-strong
      // partitioning). strongMatches stays [] (REQ-SU-007: no scoring
      // re-maintenance, no synthetic partitioning).
      const general =
        products.length > 0
          ? [{id: "general", products: products.map(toSearchProduct)}]
          : []

      return {
        strongMatches: [],
        general,
        engine: "v4-degraded",
        failed: false,
      }
    } catch (err) {
      logger.error(
        `[find/search][v4-degraded] ❌ degraded fallback ALSO failed — ${Date.now() - t0}ms | err=${(err as Error).message}`,
      )
      return {
        strongMatches: [],
        general: [],
        engine: "v4-degraded",
        failed: true,
      }
    }
  },
}
