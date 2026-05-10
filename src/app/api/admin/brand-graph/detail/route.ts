import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const revalidate = 30

interface BrandDetail {
  brand: {
    id: string
    name: string
    cluster: string
    sensitivity_tags: string[] | null
    brand_keywords: string[] | null
    attributes: Record<string, string[]> | null
    style_node: string | null
    gender_scope: string[] | null
    price_band: string | null
    category_type: string | null
    source_platforms: string[] | null
    aliases: string[] | null
  }
  stats: {
    sku_count: number
    in_stock_count: number
  }
  samples: Array<{
    id: string
    name: string | null
    image_url: string | null
    price: number | null
    sale_price: number | null
    source_currency: string | null
    category: string | null
    color: string | null
    product_url: string | null
  }>
  prices: {
    min: number | null
    median: number | null
    max: number | null
    count: number
  }
  categories: Array<{label: string; count: number; percent: number}>
  genders: Array<{label: string; count: number; percent: number}>
  similar: Array<{
    id: string
    name: string
    similarity: number
    cluster: string
    skuCount: number
  }>
}

function clusterFromSensitivity(tags: string[] | null): string {
  if (!tags || tags.length === 0) return "unknown"
  const first = tags[0]
  if (first.startsWith("minimalist") || first.includes("미니멀")) return "minimalist"
  if (first.startsWith("contemporary") || first.includes("컨템포러리")) return "contemporary"
  if (first.startsWith("classic")) return "classic"
  if (first.startsWith("vintage")) return "vintage"
  if (first.startsWith("chic")) return "chic"
  if (first.startsWith("casual")) return "casual"
  if (first.startsWith("luxury") || first.includes("럭셔리") || first.includes("하이엔드")) return "luxury"
  if (first.startsWith("avantgarde")) return "avantgarde"
  if (first.startsWith("feminine")) return "feminine"
  if (first.startsWith("streetwear")) return "streetwear"
  return "other"
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function GET(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({error: "missing id"}, {status: 400})

  // 1. brand_nodes — 기본 정보
  const {data: brand, error: bErr} = await supabase
    .from("brand_nodes")
    .select("*")
    .eq("id", id)
    .single()
  if (bErr || !brand) {
    return NextResponse.json({error: bErr?.message ?? "not found"}, {status: 404})
  }

  // 2. products — sample + 가격/카테고리/성별 집계용
  const {data: products} = await supabase
    .from("products")
    .select("id, name, image_url, original_price, sale_price, source_currency, category, subcategory, color, product_url, gender, in_stock, created_at")
    .eq("brand", brand.brand_name)
    .limit(2000)  // 집계용 — 충분히 큰 표본

  const all = products ?? []
  const skuCount = all.length
  const inStockCount = all.filter((p) => p.in_stock).length

  // 3. 다양한 카테고리에서 1개씩 sample 5개
  const byCat = new Map<string, typeof all>()
  for (const p of all) {
    const k = p.category ?? "_"
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k)!.push(p)
  }
  const samples = []
  for (const [, list] of byCat) {
    if (samples.length >= 5) break
    // 각 카테고리에서 image_url 있는 첫 row
    const pick = list.find((p) => p.image_url) ?? list[0]
    if (pick) samples.push(pick)
  }
  // 부족하면 image 있는 다른 row 로 채움
  if (samples.length < 5) {
    for (const p of all) {
      if (samples.length >= 5) break
      if (samples.find((s) => s.id === p.id)) continue
      if (!p.image_url) continue
      samples.push(p)
    }
  }

  // 4. 가격 분포
  const prices = all
    .map((p) => p.sale_price ?? p.original_price)
    .filter((v): v is number => typeof v === "number" && v > 0)
  const priceStats = {
    min: prices.length ? Math.min(...prices) : null,
    median: median(prices),
    max: prices.length ? Math.max(...prices) : null,
    count: prices.length,
  }

  // 5. 카테고리 분포 — top 5 (정규화). category 도 array 일 수 있어 방어적 처리.
  const catCounts = new Map<string, number>()
  for (const p of all) {
    const raw = p.category as unknown
    const label = (() => {
      if (raw == null) return "(미분류)"
      if (Array.isArray(raw)) return raw.length ? String(raw[0]).trim().toUpperCase() : "(미분류)"
      return String(raw).trim().toUpperCase() || "(미분류)"
    })()
    catCounts.set(label, (catCounts.get(label) ?? 0) + 1)
  }
  const categories = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      count,
      percent: Math.round((count / Math.max(1, skuCount)) * 1000) / 10,
    }))

  // 6. 성별 분포 — 정규화 후 top-4 + 기타. gender 는 string 또는 string[] 일 수 있음.
  const normalizeOne = (raw: unknown): string => {
    if (raw == null) return "UNKNOWN"
    const s = String(raw).trim().toUpperCase()
    if (!s) return "UNKNOWN"
    if (s === "MEN" || s === "MALE" || s === "M") return "MEN"
    if (s === "WOMEN" || s === "WOMAN" || s === "FEMALE" || s === "F" || s === "여성") return "WOMEN"
    if (s === "KIDS" || s === "KID" || s === "CHILDREN" || s === "CHILD") return "KIDS"
    if (s === "UNISEX" || s === "UNI" || s === "U") return "UNISEX"
    return s
  }
  const genderCounts = new Map<string, number>()
  for (const p of all) {
    const raw = p.gender as unknown
    if (Array.isArray(raw)) {
      // text[] — 각 원소 카운트 (1상품이 MEN+WOMEN 둘 다일 수 있음)
      if (raw.length === 0) {
        genderCounts.set("UNKNOWN", (genderCounts.get("UNKNOWN") ?? 0) + 1)
      } else {
        for (const v of raw) {
          const g = normalizeOne(v)
          genderCounts.set(g, (genderCounts.get(g) ?? 0) + 1)
        }
      }
    } else {
      const g = normalizeOne(raw)
      genderCounts.set(g, (genderCounts.get(g) ?? 0) + 1)
    }
  }
  const sortedGenders = Array.from(genderCounts.entries()).sort((a, b) => b[1] - a[1])
  const TOP = 4
  const top = sortedGenders.slice(0, TOP)
  const restCount = sortedGenders.slice(TOP).reduce((sum, [, c]) => sum + c, 0)
  const genders = top.map(([label, count]) => ({
    label,
    count,
    percent: Math.round((count / Math.max(1, skuCount)) * 1000) / 10,
  }))
  if (restCount > 0) {
    genders.push({
      label: "기타",
      count: restCount,
      percent: Math.round((restCount / Math.max(1, skuCount)) * 1000) / 10,
    })
  }

  // 7. 유사 브랜드 top-5 + 메타 join
  const {data: simEdges} = await supabase
    .from("brand_similar")
    .select("similar_brand_id, similarity")
    .eq("brand_id", id)
    .order("rank")
    .limit(5)

  const similar: BrandDetail["similar"] = []
  if (simEdges && simEdges.length > 0) {
    const ids = simEdges.map((e) => e.similar_brand_id)
    const {data: simBrands} = await supabase
      .from("brand_nodes")
      .select("id, brand_name, sensitivity_tags")
      .in("id", ids)
    const {data: skuData} = await supabase
      .from("brand_sku_counts")
      .select("brand, sku_count")
      .in("brand", (simBrands ?? []).map((b) => b.brand_name))
    const skuMap = new Map<string, number>()
    for (const r of skuData ?? []) skuMap.set(r.brand, r.sku_count)
    const brandMap = new Map((simBrands ?? []).map((b) => [b.id, b]))
    for (const e of simEdges) {
      const b = brandMap.get(e.similar_brand_id)
      if (!b) continue
      similar.push({
        id: b.id,
        name: b.brand_name,
        similarity: Number(e.similarity),
        cluster: clusterFromSensitivity(b.sensitivity_tags),
        skuCount: skuMap.get(b.brand_name) ?? 0,
      })
    }
  }

  const result: BrandDetail = {
    brand: {
      id: brand.id,
      name: brand.brand_name,
      cluster: clusterFromSensitivity(brand.sensitivity_tags),
      sensitivity_tags: brand.sensitivity_tags,
      brand_keywords: brand.brand_keywords,
      attributes: brand.attributes,
      style_node: brand.style_node,
      gender_scope: brand.gender_scope,
      price_band: brand.price_band,
      category_type: brand.category_type,
      source_platforms: brand.source_platforms,
      aliases: brand.aliases,
    },
    stats: {sku_count: skuCount, in_stock_count: inStockCount},
    samples: samples.map((p) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url,
      price: p.original_price,
      sale_price: p.sale_price,
      source_currency: p.source_currency,
      category: p.category,
      color: p.color,
      product_url: p.product_url,
    })),
    prices: priceStats,
    categories,
    genders,
    similar,
  }

  return NextResponse.json(result)
}
