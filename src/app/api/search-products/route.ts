import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"
import {logger} from "@/lib/logger"

// ─── 타입 ─────────────────────────────────────────────────

type SearchQuery = {
  id: string
  category: string
  subcategory?: string
  fit?: string
  fabric?: string
  colorFamily?: string
  searchQuery: string
  searchQueryKo?: string
}

type SearchRequest = {
  queries: SearchQuery[]
  gender?: string
  styleNode?: { primary: string; secondary?: string }
  moodTags?: string[]
  _logId?: string
}

type ScoreBreakdown = {
  subcategory: number
  fit: number
  fabric: number
  colorFamily: number
  stylePrimary: number
  styleSecondary: number
  moodTags: number
  totalScore: number
}

type FormattedProduct = {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
  title: string
  _scoring?: ScoreBreakdown
}

// ─── 상수 ─────────────────────────────────────────────────

const TARGET_RESULTS = 5
const MAX_PER_BRAND = 2
const ACTIVE_VERSION = "v1"

const WEIGHTS = {
  subcategory: 0.25,
  colorFamily: 0.20,
  stylePrimary: 0.30,
  styleSecondary: 0.15,
  fit: 0.15,
  fabric: 0.15,
  moodTagEach: 0.05,
  moodTagMax: 3,
} as const

const CATEGORY_ALIASES: Record<string, string[]> = {
  "Outer": ["Outer"],
  "Top": ["Top"],
  "Bottom": ["Bottom"],
  "Shoes": ["Shoes"],
  "Footwear": ["Shoes"],
  "Bag": ["Bag"],
  "Accessory": ["Accessories"],
  "Accessories": ["Accessories"],
  "Dress": ["Dress"],
}

// ─── POST Handler ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown"
    const clientUa = request.headers.get("user-agent") || "unknown"
    supabase.from("api_access_logs").insert({
      ip: clientIp,
      user_agent: clientUa,
      endpoint: "/api/search-products",
      method: "POST",
    }).then()

    const body = (await request.json()) as SearchRequest
    const { queries, gender, styleNode, moodTags, _logId } = body

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
      `🔍 검색 v2 시작 — ${queries.length}개 아이템 | 성별: ${genderFilter || "전체"} | 노드: ${primaryNode || "없음"}→${secondaryNode || "없음"}`
    )

    const results = await Promise.all(
      queries.map(async (item) => {
        logger.info(`   🔎 [${item.category}] "${item.searchQuery}"`)

        const dbCategories = CATEGORY_ALIASES[item.category] ?? null

        const products = await searchByEnums(item, genderFilter, dbCategories, primaryNode, secondaryNode, moodTags)

        for (const p of products.slice(0, TARGET_RESULTS)) {
          const s = p._scoring
          logger.info(
            `      📊 ${p.brand} | ${p.title.slice(0, 40)} | ` +
            `total=${s?.totalScore.toFixed(2)} (sub=${s?.subcategory.toFixed(2)} col=${s?.colorFamily.toFixed(2)} ` +
            `node=${s?.stylePrimary.toFixed(2)}+${s?.styleSecondary.toFixed(2)} fit=${s?.fit.toFixed(2)} fab=${s?.fabric.toFixed(2)} mood=${s?.moodTags.toFixed(2)})`
          )
        }

        const finalProducts = products.slice(0, TARGET_RESULTS)

        logger.info(`   ✅ [${item.category}] 최종 ${finalProducts.length}개`)

        return {
          id: item.id,
          products: finalProducts,
        }
      })
    )

    // Quality logging (fire-and-forget)
    const qualityRows = results.map((r) => {
      const query = queries.find((q: SearchQuery) => q.id === r.id)
      const scores = r.products
        .map((p) => p._scoring?.totalScore ?? 0)
        .filter((s) => s > 0)

      return {
        analysis_id: _logId || null,
        item_id: r.id,
        query_category: query?.category,
        query_subcategory: query?.subcategory,
        query_fit: query?.fit,
        query_fabric: query?.fabric,
        query_color_family: query?.colorFamily,
        query_style_node: primaryNode,
        result_count: r.products.length,
        top_score: scores.length > 0 ? Math.max(...scores) : null,
        avg_score: scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null,
        score_breakdown: r.products.slice(0, 3).map((p) => p._scoring),
        is_empty: r.products.length === 0,
      }
    })

    if (qualityRows.length > 0) {
      supabase
        .from("search_quality_logs")
        .insert(qualityRows)
        .then(({ error }) => {
          if (error) logger.error({ error }, "search_quality_logs insert failed")
        })
    }

    const searchDuration = Date.now() - searchStart
    const totalProducts = results.reduce((sum, r) => sum + r.products.length, 0)
    logger.info(`🏁 검색 v2 완료 — ${totalProducts}개 | ${searchDuration}ms`)

    // DB에 검색 상세 로깅 (fire-and-forget)
    if (_logId) {
      supabase
        .from("analyses")
        .update({
          search_duration_ms: searchDuration,
          search_results: results.map((r) => ({
            id: r.id,
            products: r.products.map((p) => ({
              brand: p.brand,
              title: p.title,
              price: p.price,
              platform: p.platform,
              imageUrl: p.imageUrl,
              link: p.link,
              scoring: p._scoring,
            })),
          })),
        })
        .eq("id", _logId)
        .then(({ error }) => {
          if (error) logger.error({ error }, "❌ analyses 업데이트 실패")
        })
    }

    // 응답에서 _scoring 제거 (프론트에는 안 보냄, DB에만 저장)
    const cleanResults = results.map((r) => ({
      id: r.id,
      products: r.products.map(({ _scoring, ...rest }) => rest),
    }))

    return NextResponse.json({ results: cleanResults })
  } catch (error) {
    logger.error({ error }, "💥 검색 v2 중 예외 발생")
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 })
  }
}

// ─── PAI 기반 enum 매칭 검색 ──────────────────────────────

async function searchByEnums(
  item: SearchQuery,
  genderFilter: string | null,
  dbCategories: string[] | null,
  primaryNode: string | undefined,
  secondaryNode: string | undefined,
  moodTags: string[] | undefined,
): Promise<(FormattedProduct & { _rawPrice: number })[]> {
  let query = supabase
    .from("product_ai_analysis")
    .select(`
      category, subcategory, fit, fabric, color_family, style_node, mood_tags,
      products!inner (
        id, brand, name, price, image_url, product_url, platform, gender, in_stock
      )
    `)
    .eq("version", ACTIVE_VERSION)
    .eq("products.in_stock", true)
    .limit(200)

  if (dbCategories && dbCategories.length > 0) {
    query = query.in("category", dbCategories)
  }

  if (genderFilter) {
    query = query.or(`gender.eq.${genderFilter},gender.eq.unisex`, { referencedTable: "products" })
  }

  const { data, error } = await query

  if (error) {
    logger.error({ error }, `❌ PAI 쿼리 실패 [${item.category}]`)
    return []
  }

  if (!data?.length) return []

  type RawProduct = {
    id: string; brand: string; name: string; price: number | null;
    image_url: string | null; product_url: string; platform: string;
    gender: string | null; in_stock: boolean
  }

  const scored = data
    .map((row) => {
      // Supabase returns inner join as array; take first element
      const productRaw = row.products
      const p: RawProduct = (Array.isArray(productRaw) ? productRaw[0] : productRaw) as unknown as RawProduct
      if (!p) return null

      // 스코어 계산
      const subcategoryScore = item.subcategory && row.subcategory === item.subcategory ? WEIGHTS.subcategory : 0
      const fitScore = item.fit && row.fit === item.fit ? WEIGHTS.fit : 0
      const fabricScore = item.fabric && row.fabric === item.fabric ? WEIGHTS.fabric : 0
      const colorFamilyScore = item.colorFamily && row.color_family === item.colorFamily ? WEIGHTS.colorFamily : 0
      const stylePrimaryScore = primaryNode && row.style_node === primaryNode ? WEIGHTS.stylePrimary : 0
      const styleSecondaryScore = secondaryNode && row.style_node === secondaryNode ? WEIGHTS.styleSecondary : 0

      const rowMoodTags = Array.isArray(row.mood_tags) ? (row.mood_tags as string[]) : []
      const requestMoodTags = moodTags ?? []
      const overlapCount = rowMoodTags.filter((t) => requestMoodTags.includes(t)).length
      const moodScore = Math.min(overlapCount, WEIGHTS.moodTagMax) * WEIGHTS.moodTagEach

      const totalScore =
        subcategoryScore + fitScore + fabricScore + colorFamilyScore +
        stylePrimaryScore + styleSecondaryScore + moodScore

      const scoring: ScoreBreakdown = {
        subcategory: subcategoryScore,
        fit: fitScore,
        fabric: fabricScore,
        colorFamily: colorFamilyScore,
        stylePrimary: stylePrimaryScore,
        styleSecondary: styleSecondaryScore,
        moodTags: moodScore,
        totalScore,
      }

      return {
        _score: totalScore,
        _rawPrice: p.price ?? 0,
        _scoring: scoring,
        brand: p.brand,
        price: p.price ? `₩${p.price.toLocaleString()}` : "",
        platform: p.platform,
        imageUrl: p.image_url || "",
        link: p.product_url,
        title: `${p.brand} ${p.name}`,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && p._score > 0)

  scored.sort((a, b) => b._score - a._score || a._rawPrice - b._rawPrice)

  // 브랜드 다양성: 브랜드당 최대 MAX_PER_BRAND
  const result: typeof scored = []
  const brandCount: Record<string, number> = {}

  for (const p of scored) {
    if (result.length >= TARGET_RESULTS) break
    const brand = (p.brand || "unknown").toLowerCase()
    const count = brandCount[brand] ?? 0
    if (count >= MAX_PER_BRAND) continue
    brandCount[brand] = count + 1
    result.push(p)
  }

  return result
}
