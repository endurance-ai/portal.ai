// @MX:NOTE: [AUTO] v4 3-path candidate fetch (PAI / name-text / direct) + merge — extracted verbatim from search-products/route.ts lines ~392-581 (SPEC-ARCH-APP-001 REQ-APP-004)
// @MX:REASON: Uses the consolidated DB client via the @/lib/supabase shim → @/repositories/clients/postgrest; no second client introduced.
// @MX:SPEC: SPEC-ARCH-APP-001
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"
import {SIMILAR_SUBCATEGORIES} from "@/shared/enums/subcategory-similar"
import {ACTIVE_VERSION, MIN_VALID_PRICE, SUBCATEGORY_NAME_KEYWORDS} from "./constants"
import type {SearchQuery} from "./types"
import type {MergedRow} from "./scorer"

/** PostgREST 필터 인젝션 방지 — 쉼표, 마침표, 괄호, 와일드카드 제거 */
export function sanitizeKeyword(kw: string): string {
  return kw.replace(/[^a-zA-Z0-9가-힯ㄱ-ㅣ\s\-]/g, "").trim()
}

/**
 * Fetch + merge candidate rows for one query item across the 3 PostgREST
 * paths (AI analysis, product-name text, products direct). Verbatim port of
 * the route.ts `searchByEnums` query/merge section (returns the merged rows
 * pre-scoring; scoring/ranking handled by scorer + ranker).
 */
export async function fetchCandidates(
  item: SearchQuery,
  genderFilter: string | null,
  dbCategories: string[] | null,
  priceFilter: { minPrice?: number; maxPrice?: number } | undefined,
  brandFilter: string[] | null,
): Promise<MergedRow[]> {
  // ─── 경로 1: AI analysis 기반 검색 ───
  // subcategory + 유사 subcategory를 DB 단계에서 필터 (limit 200 내 누락 방지)
  const targetSubcategories: string[] = []
  if (item.subcategory) {
    targetSubcategories.push(item.subcategory)
    const similars = SIMILAR_SUBCATEGORIES[item.subcategory] ?? []
    targetSubcategories.push(...similars)
  }

  const hasPriceFilter = priceFilter && (priceFilter.minPrice !== undefined || priceFilter.maxPrice !== undefined)

  let query = supabase
    .from("product_ai_analysis")
    .select(`
      category, subcategory, fit, fabric, color_family, style_node, mood_tags,
      keywords_ko, keywords_en, season, pattern,
      products!inner (
        id, brand, name, price, image_url, product_url, platform, gender, in_stock,
        description, material, review_count
      )
    `)
    .eq("version", ACTIVE_VERSION)
    .eq("products.in_stock", true)
    .limit(200)

  // 가격 필터: priceFilter가 있으면 null price 제외 + 엄격 범위 적용
  if (hasPriceFilter) {
    query = query.not("products.price", "is", null)
    const effectiveMin = Math.max(priceFilter.minPrice ?? MIN_VALID_PRICE, MIN_VALID_PRICE)
    query = query.gte("products.price", effectiveMin)
    if (priceFilter.maxPrice !== undefined) {
      query = query.lte("products.price", priceFilter.maxPrice)
    }
  } else {
    query = query.or(`price.is.null,price.gte.${MIN_VALID_PRICE}`, { referencedTable: "products" })
  }

  if (dbCategories && dbCategories.length > 0) {
    query = query.in("category", dbCategories)
  }

  if (targetSubcategories.length > 0) {
    query = query.in("subcategory", targetSubcategories)
  }

  if (brandFilter && brandFilter.length > 0) {
    query = query.in("products.brand", brandFilter)
  }

  const { data, error } = await query

  if (error) {
    logger.error({ error }, `❌ PAI 쿼리 실패 [${item.category}]`)
    return []
  }

  // ─── 경로 2: 상품명 텍스트 검색 (AI 오분류 보정) ───
  const nameKeywords = item.subcategory ? (SUBCATEGORY_NAME_KEYWORDS[item.subcategory] ?? []) : []
  let nameData: typeof data = []

  if (nameKeywords.length > 0) {
    const nameFilters = nameKeywords.map((kw) => `products.name.ilike.%${kw}%`).join(",")
    let nameQuery = supabase
      .from("product_ai_analysis")
      .select(`
        category, subcategory, fit, fabric, color_family, style_node, mood_tags,
        keywords_ko, keywords_en, season, pattern,
        products!inner (
          id, brand, name, price, image_url, product_url, platform, gender, in_stock,
          description, material, review_count
        )
      `)
      .eq("version", ACTIVE_VERSION)
      .eq("products.in_stock", true)
      .or(nameFilters, { referencedTable: "products" })
      .limit(50)

    // 가격 필터: priceFilter가 있으면 null price 제외 + 엄격 범위 적용
    if (hasPriceFilter) {
      nameQuery = nameQuery.not("products.price", "is", null)
      const effectiveMin = Math.max(priceFilter!.minPrice ?? MIN_VALID_PRICE, MIN_VALID_PRICE)
      nameQuery = nameQuery.gte("products.price", effectiveMin)
      if (priceFilter!.maxPrice !== undefined) {
        nameQuery = nameQuery.lte("products.price", priceFilter!.maxPrice)
      }
    } else {
      nameQuery = nameQuery.or(`price.is.null,price.gte.${MIN_VALID_PRICE}`, { referencedTable: "products" })
    }

    if (dbCategories && dbCategories.length > 0) {
      nameQuery = nameQuery.in("category", dbCategories)
    }

    if (brandFilter && brandFilter.length > 0) {
      nameQuery = nameQuery.in("products.brand", brandFilter)
    }

    const { data: nd, error: ne } = await nameQuery
    if (!ne && nd) {
      nameData = nd
      logger.info(`   📝 상품명 검색: ${nd.length}개 (키워드: ${nameKeywords.join(", ")})`)
    }
  }

  // ─── 경로 3: products 직접 검색 (AI 분석 없는 상품 포함) ───
  type DirectProduct = {
    id: string; brand: string; name: string; price: number | null;
    image_url: string | null; product_url: string; platform: string;
    gender: string | null; in_stock: boolean;
    description: string | null; material: string | null;
    review_count: number | null;
  }
  let directProducts: DirectProduct[] = []

  const directKeywords = [
    ...(item.searchQueryKo ? [item.searchQueryKo] : []),
    ...(item.searchQuery ? [item.searchQuery] : []),
    ...(item.subcategory ? (SUBCATEGORY_NAME_KEYWORDS[item.subcategory] ?? []) : []),
  ].filter(Boolean).slice(0, 5).map(sanitizeKeyword).filter(Boolean)

  if (directKeywords.length > 0) {
    // name, description, material 모두에서 키워드 검색
    const directFilters = directKeywords.flatMap((kw) => [
      `name.ilike.%${kw}%`,
      `description.ilike.%${kw}%`,
      `material.ilike.%${kw}%`,
    ]).join(",")
    let directQuery = supabase
      .from("products")
      .select("id, brand, name, price, image_url, product_url, platform, gender, in_stock, description, material, review_count")
      .eq("in_stock", true)
      .or(directFilters)
      .limit(100)

    if (hasPriceFilter) {
      directQuery = directQuery.not("price", "is", null)
      const effectiveMin = Math.max(priceFilter!.minPrice ?? MIN_VALID_PRICE, MIN_VALID_PRICE)
      directQuery = directQuery.gte("price", effectiveMin)
      if (priceFilter!.maxPrice !== undefined) {
        directQuery = directQuery.lte("price", priceFilter!.maxPrice)
      }
    } else {
      directQuery = directQuery.or(`price.is.null,price.gte.${MIN_VALID_PRICE}`)
    }

    if (genderFilter) {
      directQuery = directQuery.contains("gender", [genderFilter])
    }

    if (brandFilter && brandFilter.length > 0) {
      directQuery = directQuery.in("brand", brandFilter)
    }

    const { data: dp, error: de } = await directQuery
    if (!de && dp) {
      directProducts = dp as DirectProduct[]
      logger.info(`   🔍 직접 검색: ${dp.length}개 (키워드: ${directKeywords.join(", ")})`)
    }
  }

  // ─── 병합: AI 결과 + 상품명 결과 + 직접 검색 (중복 제거) ───
  const seenIds = new Set<string>()
  const merged = [...(data || [])]
  for (const row of merged) {
    const p = Array.isArray(row.products) ? row.products[0] : row.products
    if (p) seenIds.add((p as { id: string }).id)
  }
  for (const row of nameData) {
    const p = Array.isArray(row.products) ? row.products[0] : row.products
    if (p && !seenIds.has((p as { id: string }).id)) {
      seenIds.add((p as { id: string }).id)
      merged.push(row)
    }
  }
  // 직접 검색 결과 — AI 분석 없이 빈 row로 병합
  for (const dp of directProducts) {
    if (!seenIds.has(dp.id)) {
      seenIds.add(dp.id)
      merged.push({
        category: null as unknown as string,
        subcategory: null as unknown as string,
        fit: null, fabric: null, color_family: null, style_node: null,
        mood_tags: null, keywords_ko: null, keywords_en: null,
        season: null, pattern: null,
        products: dp as unknown,
      } as typeof merged[0])
    }
  }

  return merged as unknown as MergedRow[]
}
