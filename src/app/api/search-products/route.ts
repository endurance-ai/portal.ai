import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"

const SERPAPI_KEY = process.env.SERPAPI_KEY

type FormattedProduct = {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title: string
}

export async function POST(request: NextRequest) {
  try {
    const {
      queries,
      gender,
      styleNode,
      _logId,
    } = (await request.json()) as {
      queries: { id: string; category: string; searchQuery: string }[]
      gender?: string
      styleNode?: { primary: string; secondary?: string }
      sensitivityTags?: string[]
      _logId?: string
    }

    const searchStart = Date.now()

    if (!queries?.length) {
      logger.warn("⚠️ 검색 쿼리 없음")
      return NextResponse.json({ error: "No search queries provided" }, { status: 400 })
    }

    const VALID_GENDERS = new Set(["men", "women"])
    const genderRaw = gender === "female" ? "women" : gender === "male" ? "men" : null
    const genderFilter = genderRaw && VALID_GENDERS.has(genderRaw) ? genderRaw : null
    const primaryNode = styleNode?.primary
    const secondaryNode = styleNode?.secondary

    logger.info(
      `🔍 상품 검색 시작 — ${queries.length}개 아이템 | 성별: ${genderFilter || "전체"} | 노드: ${primaryNode || "없음"}→${secondaryNode || "없음"}`
    )

    // 노드 브랜드 목록은 아이템과 무관하므로 한 번만 조회
    const nodeBoostBrands = await getNodeBrands(primaryNode, secondaryNode)

    const categoryMap: Record<string, string[]> = {
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

    const results = await Promise.all(
      queries.map(async (item) => {
        logger.info(`   🔎 [${item.category}] "${item.searchQuery}"`)

        const keywords = item.searchQuery
          .toLowerCase()
          .replace(/\b(men|women|unisex)\b/g, "")
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 2)

        const dbCategories = categoryMap[item.category] || null

        // ── 자체 DB: 카테고리 + 성별 기반 검색, 노드는 스코어 부스트 ──
        const products = await searchProducts(keywords, genderFilter, dbCategories, nodeBoostBrands)
        if (products.length > 0) {
          const fromNode = products.filter((p) => p._nodeMatch).length
          logger.info(`      📌 DB: ${products.length}개 (노드 매칭 ${fromNode}개)`)
        }

        // ── Fallback: SerpApi (DB에서 4개 못 채웠을 때) ──

        if (products.length < 5 && SERPAPI_KEY) {
          const needed = 5 - products.length
          logger.info(`      🌐 DB 부족 (${products.length}/4) → SerpApi fallback`)
          const serpProducts = await searchSerpApi(item.searchQuery, genderFilter, needed)
          const existingUrls = new Set(products.map((p) => p.link))
          const newOnes = serpProducts.filter((p) => !existingUrls.has(p.link))
            .map((p) => ({ ...p, _nodeMatch: false }))
          products.push(...newOnes)
          logger.info(`      🌐 SerpApi: +${newOnes.length}개`)
        }

        const finalProducts: FormattedProduct[] = products.slice(0, 5).map(({ _nodeMatch, ...rest }) => rest)

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

// ─── 노드 브랜드 목록 가져오기 (스코어 부스트용) ────────

async function getNodeBrands(
  primaryNode: string | undefined,
  secondaryNode: string | undefined
): Promise<{ primary: Set<string>; secondary: Set<string> }> {
  const primary = new Set<string>()
  const secondary = new Set<string>()

  const nodes = [primaryNode, secondaryNode].filter(Boolean) as string[]
  if (nodes.length === 0) return { primary, secondary }

  const { data } = await supabase
    .from("brand_nodes")
    .select("brand_name, style_node")
    .in("style_node", nodes)

  if (data) {
    for (const b of data) {
      const name = b.brand_name.toLowerCase()
      if (b.style_node === primaryNode) primary.add(name)
      if (b.style_node === secondaryNode) secondary.add(name)
    }
  }

  return { primary, secondary }
}

// ─── 메인 검색: 카테고리 + 성별 기반, 노드는 스코어 부스트 ──

type ScoredProduct = FormattedProduct & { _nodeMatch: boolean }

async function searchProducts(
  keywords: string[],
  genderFilter: string | null,
  categories: string[] | null,
  nodeBoostBrands: { primary: Set<string>; secondary: Set<string> }
): Promise<ScoredProduct[]> {
  // 카테고리 + 성별 + 재고로 넓게 가져오기
  // gender 필터: men이면 ["men"] 또는 ["unisex"] 포함, women이면 ["women"] 또는 ["unisex"] 포함
  let query = supabase
    .from("products")
    .select("brand, name, price, image_url, product_url, platform, category, style_node")
    .eq("in_stock", true)
    .like("image_url", "http%") // 정상 이미지 URL만
    .limit(80)

  if (categories) {
    query = query.in("category", categories)
  }

  if (genderFilter) {
    query = query.or(`gender.cs.{"${genderFilter}"},gender.cs.{"unisex"}`)
  }

  const { data: products } = await query
  if (!products?.length) return []

  // 스코어링: 키워드 매칭 + 노드 부스트
  const scored = products.map((p) => {
    const text = `${p.brand} ${p.name}`.toLowerCase()
    const brandLower = (p.brand || "").toLowerCase()

    // 키워드 매칭 (0~1)
    const matchCount = keywords.filter((kw) => text.includes(kw)).length
    const keywordScore = matchCount / Math.max(keywords.length, 1)

    // 노드 부스트
    let nodeBoost = 0
    let nodeMatch = false
    if (nodeBoostBrands.primary.has(brandLower)) {
      nodeBoost = 0.3 // primary 노드 브랜드면 +0.3
      nodeMatch = true
    } else if (nodeBoostBrands.secondary.has(brandLower)) {
      nodeBoost = 0.15 // secondary 노드 브랜드면 +0.15
      nodeMatch = true
    }

    const totalScore = keywordScore + nodeBoost

    return { ...p, _score: totalScore, _nodeMatch: nodeMatch }
  })

  const filtered = scored.filter((p) => p._score > 0)
  filtered.sort((a, b) => b._score - a._score || (a.price || 0) - (b.price || 0))

  // 브랜드 다양성: 같은 브랜드 최대 2개, 총 5개
  const result: typeof filtered = []
  const brandCount: Record<string, number> = {}
  const MAX_PER_BRAND = 2
  const MAX_RESULTS = 5

  for (const p of filtered) {
    if (result.length >= MAX_RESULTS) break
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
    num: String(Math.min(limit * 2, 10)), // 여유있게 가져와서 필터
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
      position: number; title: string; source: string; price: string;
      extracted_price: number; rating?: number; reviews?: number;
      thumbnail: string; product_link: string; link?: string
    }[] = data.shopping_results ?? []

    const filtered = raw
      .filter((p) => p.thumbnail && p.extracted_price > 0)
      .map((p) => ({
        ...p,
        _score:
          (p.rating ? p.rating * 2 : 0) +
          (p.reviews ? Math.min(p.reviews / 100, 3) : 0) +
          (p.thumbnail ? 2 : 0) +
          (10 - p.position) * 0.5,
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

