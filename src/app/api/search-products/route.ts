import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"

const SERPAPI_KEY = process.env.SERPAPI_KEY

// ─── 타입 ─────────────────────────────────────────────────

type FormattedProduct = {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title: string
}

type ScoredProduct = FormattedProduct & { _nodeMatch: boolean }

type NodeBrandData = {
  primary: Set<string>
  secondary: Set<string>
  brandMeta: Map<string, { keywords: string[]; tags: string[] }>
  excludedBrands: Set<string>
  aiTags: string[]
}

// ─── 상수 ─────────────────────────────────────────────────

const TARGET_RESULTS = 5
const MAX_PER_BRAND = 2

const SCORE_WEIGHTS = {
  PRIMARY_NODE_BOOST: 0.3,
  SECONDARY_NODE_BOOST: 0.15,
  SENSITIVITY_BOOST_PER_TAG: 0.1,
  SENSITIVITY_BOOST_MAX_TAGS: 3,
} as const

const CATEGORY_MAP: Record<string, string[]> = {
  "Outer": ["Outer"],
  "Top": ["Top", "Shirts", "Knitwear"],
  "Bottom": ["Bottom"],
  "Shoes": ["Shoes"],
  "Footwear": ["Shoes"],
  "Bag": ["Bag"],
  "Accessory": ["Accessories"],
  "Accessories": ["Accessories"],
  "Dress": ["Dress"],
  "Socks": ["Accessories"],
}

// ─── POST Handler ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const queries = body.queries
    const gender = body.gender as string | undefined
    const styleNode = body.styleNode as { primary: string; secondary?: string } | undefined
    const sensitivityTags = body.sensitivityTags as string[] | undefined
    const _logId = body._logId as string | undefined

    const searchStart = Date.now()

    if (!Array.isArray(queries) || queries.length === 0) {
      return NextResponse.json({ error: "No search queries provided" }, { status: 400 })
    }

    const genderFilter =
      gender === "female" ? "women" :
      gender === "male" ? "men" : null

    const primaryNode = styleNode?.primary
    const secondaryNode = styleNode?.secondary

    logger.info(
      `🔍 상품 검색 시작 — ${queries.length}개 아이템 | 성별: ${genderFilter || "전체"} | 노드: ${primaryNode || "없음"}→${secondaryNode || "없음"}`
    )

    const nodeBrands = await getNodeBrands(primaryNode, secondaryNode, sensitivityTags)

    const results = await Promise.all(
      queries.map(async (item: { id: string; category: string; searchQuery: string }) => {
        logger.info(`   🔎 [${item.category}] "${item.searchQuery}"`)

        const keywords = item.searchQuery
          .toLowerCase()
          .replace(/\b(men|women|unisex)\b/g, "")
          .trim()
          .split(/\s+/)
          .filter((w: string) => w.length > 2)

        const dbCategories = CATEGORY_MAP[item.category] || null

        const products = await searchProducts(keywords, genderFilter, dbCategories, nodeBrands)
        if (products.length > 0) {
          const fromNode = products.filter((p) => p._nodeMatch).length
          logger.info(`      📌 DB: ${products.length}개 (노드 매칭 ${fromNode}개)`)
        }

        // Fallback: SerpApi
        if (products.length < TARGET_RESULTS && SERPAPI_KEY) {
          const needed = TARGET_RESULTS - products.length
          logger.info(`      🌐 DB 부족 (${products.length}/${TARGET_RESULTS}) → SerpApi fallback`)
          const serpProducts = await searchSerpApi(item.searchQuery, genderFilter, needed)
          const existingUrls = new Set(products.map((p) => p.link))
          const newOnes = serpProducts.filter((p) => !existingUrls.has(p.link))
            .map((p) => ({ ...p, _nodeMatch: false }))
          products.push(...newOnes)
          logger.info(`      🌐 SerpApi: +${newOnes.length}개`)
        }

        const finalProducts: FormattedProduct[] = products
          .slice(0, TARGET_RESULTS)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .map(({ _nodeMatch, ...rest }) => rest)

        logger.info(`   ✅ [${item.category}] 최종 ${finalProducts.length}개`)
        for (const p of finalProducts) {
          logger.info(`      💰 ${p.price} — ${p.platform} | ${p.brand} | ${p.title.slice(0, 50)}`)
        }

        return { id: item.id, products: finalProducts }
      })
    )

    const searchDuration = Date.now() - searchStart
    const totalProducts = results.reduce((sum, r) => sum + r.products.length, 0)
    logger.info(`🏁 상품 검색 완료 — ${totalProducts}개 | ${searchDuration}ms`)

    if (_logId) {
      const { error: updateError } = await supabase
        .from("analyses")
        .update({ search_duration_ms: searchDuration })
        .eq("id", _logId)
      if (updateError) logger.error({ error: updateError }, "❌ analyses 업데이트 실패")
    }

    return NextResponse.json({ results })
  } catch (error) {
    logger.error({ error }, "💥 상품 검색 중 예외 발생")
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 })
  }
}

// ─── 노드 브랜드 목록 (병렬 조회) ────────────────────────

async function getNodeBrands(
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
  sensitivityTags?: string[]
): Promise<NodeBrandData> {
  const primary = new Set<string>()
  const secondary = new Set<string>()
  const brandMeta = new Map<string, { keywords: string[]; tags: string[] }>()
  const excludedBrands = new Set<string>()
  const aiTags = (sensitivityTags || []).map((t) => t.toLowerCase())

  const nodes = [primaryNode, secondaryNode].filter(Boolean) as string[]

  // 두 쿼리 병렬 실행
  const [excludedResult, nodesResult] = await Promise.all([
    supabase
      .from("brand_nodes")
      .select("brand_name_normalized")
      .eq("category_type", "제외"),
    nodes.length > 0
      ? supabase
          .from("brand_nodes")
          .select("brand_name, brand_name_normalized, style_node, brand_keywords, sensitivity_tags")
          .in("style_node", nodes)
          .neq("category_type", "제외")
      : Promise.resolve({ data: null, error: null }),
  ])

  if (excludedResult.error) {
    logger.error({ error: excludedResult.error }, "brand_nodes excluded query failed")
  }
  if (nodesResult.error) {
    logger.error({ error: nodesResult.error }, "brand_nodes node query failed")
  }

  if (excludedResult.data) {
    for (const b of excludedResult.data) {
      if (b.brand_name_normalized) excludedBrands.add(b.brand_name_normalized.toLowerCase())
    }
  }

  if (nodesResult.data) {
    for (const b of nodesResult.data) {
      const name = (b.brand_name_normalized || b.brand_name).toLowerCase()
      if (b.style_node === primaryNode) primary.add(name)
      if (b.style_node === secondaryNode) secondary.add(name)

      brandMeta.set(name, {
        keywords: b.brand_keywords || [],
        tags: b.sensitivity_tags || [],
      })
    }
  }

  return { primary, secondary, brandMeta, excludedBrands, aiTags }
}

// ─── DB 검색 + 스코어링 ──────────────────────────────────

async function searchProducts(
  keywords: string[],
  genderFilter: string | null,
  categories: string[] | null,
  nodeBrands: NodeBrandData
): Promise<ScoredProduct[]> {
  let query = supabase
    .from("products")
    .select("brand, name, price, image_url, product_url, platform, category, style_node, description, color, material, subcategory")
    .eq("in_stock", true)
    .like("image_url", "http%")
    .not("image_url", "like", "%/icon_%")
    .not("image_url", "like", "%/logo_%")
    .not("image_url", "like", "%/badge_%")
    .limit(100)

  if (categories) {
    query = query.in("category", categories)
  }

  if (genderFilter) {
    query = query.or(`gender.cs.{"${genderFilter}"},gender.cs.{"unisex"}`)
  }

  const { data: products } = await query
  if (!products?.length) return []

  const scored = products
    .filter((p) => {
      const brandLower = (p.brand || "").toLowerCase()
      return !nodeBrands.excludedBrands.has(brandLower)
    })
    .map((p) => {
      const text = `${p.brand} ${p.name} ${p.description || ""} ${p.color || ""} ${p.material || ""}`.toLowerCase()
      const brandLower = (p.brand || "").toLowerCase()

      // 1) 키워드 매칭 (0~1)
      const matchCount = keywords.filter((kw) => text.includes(kw)).length
      const keywordScore = matchCount / Math.max(keywords.length, 1)

      // 2) 노드 부스트
      let nodeBoost = 0
      let nodeMatch = false
      if (nodeBrands.primary.has(brandLower)) {
        nodeBoost = SCORE_WEIGHTS.PRIMARY_NODE_BOOST
        nodeMatch = true
      } else if (nodeBrands.secondary.has(brandLower)) {
        nodeBoost = SCORE_WEIGHTS.SECONDARY_NODE_BOOST
        nodeMatch = true
      }

      // 3) 감도 부스트 — AI sensitivityTags ↔ 브랜드 sensitivity_tags + brand_keywords
      let sensBoost = 0
      const meta = nodeBrands.brandMeta.get(brandLower)
      if (meta && nodeBrands.aiTags.length > 0) {
        const brandAllKw = [...meta.tags, ...meta.keywords].map((k) => k.toLowerCase())
        const overlap = nodeBrands.aiTags.filter((t) => brandAllKw.includes(t)).length
        if (overlap > 0) {
          sensBoost = SCORE_WEIGHTS.SENSITIVITY_BOOST_PER_TAG *
            Math.min(overlap, SCORE_WEIGHTS.SENSITIVITY_BOOST_MAX_TAGS)
        }
      }

      return { ...p, _score: keywordScore + nodeBoost + sensBoost, _nodeMatch: nodeMatch }
    })

  const filtered = scored.filter((p) => p._score > 0)
  filtered.sort((a, b) => b._score - a._score || (a.price || 0) - (b.price || 0))

  // 브랜드 다양성
  const result: typeof filtered = []
  const brandCount: Record<string, number> = {}

  for (const p of filtered) {
    if (result.length >= TARGET_RESULTS) break
    const brand = (p.brand || "unknown").toLowerCase()
    const count = brandCount[brand] || 0
    if (count >= MAX_PER_BRAND) continue
    brandCount[brand] = count + 1
    result.push(p)
  }

  return result.map((p) => ({
    brand: p.brand,
    price: p.price ? `₩${p.price.toLocaleString()}` : "",
    platform: p.platform,
    imageUrl: p.image_url || "",
    link: p.product_url,
    title: `${p.brand} ${p.name}`,
    _nodeMatch: p._nodeMatch,
  }))
}

// ─── SerpApi Fallback ──────────────────────────────────

async function searchSerpApi(
  searchQuery: string,
  genderFilter: string | null,
  limit: number
): Promise<FormattedProduct[]> {
  if (!SERPAPI_KEY) return []

  let query = searchQuery
  const genderLabel = genderFilter === "women" ? "women" : genderFilter === "men" ? "men" : ""
  if (genderLabel && !query.toLowerCase().includes(genderLabel)) {
    query = `${query} ${genderLabel}`
  }

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    api_key: SERPAPI_KEY,
    num: String(Math.min(limit * 2, 10)),
    hl: "en",
  })

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`)
    if (!res.ok) {
      logger.error(`      ❌ SerpApi HTTP ${res.status}`)
      return []
    }

    const data = await res.json()
    const raw: {
      position?: number; title?: string; source?: string; price?: string;
      extracted_price?: number; rating?: number; reviews?: number;
      thumbnail?: string; product_link?: string; link?: string
    }[] = data.shopping_results ?? []

    const filtered = raw
      .filter((p) => p.thumbnail && (p.extracted_price ?? 0) > 0)
      .map((p) => ({
        ...p,
        _score:
          (p.rating ? p.rating * 2 : 0) +
          (p.reviews ? Math.min(p.reviews / 100, 3) : 0) +
          (p.thumbnail ? 2 : 0) +
          (10 - (p.position ?? 10)) * 0.5,
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)

    return filtered.map((p) => ({
      brand: p.source || "Unknown",
      price: p.price || "",
      platform: p.source || "",
      imageUrl: p.thumbnail || "",
      link: p.product_link || p.link || "#",
      title: p.title || "",
    }))
  } catch (err) {
    logger.error({ err }, "      ❌ SerpApi 요청 실패")
    return []
  }
}
