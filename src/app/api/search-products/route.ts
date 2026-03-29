import {NextRequest, NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"

const SERPAPI_KEY = process.env.SERPAPI_KEY

interface SerpApiProduct {
  position: number
  title: string
  source: string
  price: string
  extracted_price: number
  old_price?: string
  extracted_old_price?: number
  rating?: number
  reviews?: number
  thumbnail: string
  product_link: string
  link?: string
  extensions?: string[]
}

export async function POST(request: NextRequest) {
  if (!SERPAPI_KEY) {
    return NextResponse.json(
      { error: "SERPAPI_KEY not configured" },
      { status: 500 }
    )
  }

  try {
    const { queries, gender, _logId } = (await request.json()) as {
      queries: { id: string; category: string; searchQuery: string }[]
      gender?: string
      _logId?: string
    }
    const searchStart = Date.now()

    if (!queries?.length) {
      return NextResponse.json(
        { error: "No search queries provided" },
        { status: 400 }
      )
    }

    // Search all items in parallel — collect raw data for logging
    const searchDetails: {
      id: string
      query_sent: string
      original_query: string
      gender_appended: boolean
      raw_result_count: number
      filtered_count: number
      scored_results: object[]
      final_products: object[]
    }[] = []

    const results = await Promise.all(
      queries.map(async (item) => {
        // Ensure gender is in the query for better filtering
        let query = item.searchQuery
        const genderLabel = gender === "female" ? "women" : gender === "male" ? "men" : ""
        const genderAppended = !!(genderLabel && !query.toLowerCase().includes(genderLabel))
        if (genderAppended) {
          query = `${query} ${genderLabel}`
        }

        const params = new URLSearchParams({
          engine: "google_shopping",
          q: query,
          api_key: SERPAPI_KEY,
          num: "10",
          hl: "en",
        })

        const res = await fetch(
          `https://serpapi.com/search.json?${params.toString()}`
        )

        if (!res.ok) {
          console.error(
            `SerpApi error for "${item.searchQuery}":`,
            res.status
          )
          searchDetails.push({
            id: item.id,
            query_sent: query,
            original_query: item.searchQuery,
            gender_appended: genderAppended,
            raw_result_count: 0,
            filtered_count: 0,
            scored_results: [],
            final_products: [],
          })
          return { id: item.id, products: [] }
        }

        const data = await res.json()
        const rawProducts: SerpApiProduct[] = data.shopping_results ?? []

        // Filter and rank: prefer products with images, ratings, and reasonable prices
        const filtered = rawProducts.filter((p) => p.thumbnail && p.extracted_price > 0)
        const scored = filtered
          .map((p) => ({
            ...p,
            _score:
              (p.rating ? p.rating * 2 : 0) +
              (p.reviews ? Math.min(p.reviews / 100, 3) : 0) +
              (p.thumbnail ? 2 : 0) +
              (10 - p.position) * 0.5,
          }))
          .sort((a, b) => b._score - a._score)
          .slice(0, 4)

        const products = scored.map((p) => ({
          brand: p.source || "Unknown",
          price: p.price || "",
          platform: p.source || "",
          imageUrl: p.thumbnail || "",
          link: p.product_link || p.link || "#",
          title: p.title || "",
        }))

        searchDetails.push({
          id: item.id,
          query_sent: query,
          original_query: item.searchQuery,
          gender_appended: genderAppended,
          raw_result_count: rawProducts.length,
          filtered_count: filtered.length,
          scored_results: scored.map((p) => ({
            title: p.title,
            source: p.source,
            price: p.price,
            extracted_price: p.extracted_price,
            rating: p.rating,
            reviews: p.reviews,
            position: p.position,
            _score: p._score,
            thumbnail: p.thumbnail,
            link: p.product_link || p.link,
          })),
          final_products: products,
        })

        return { id: item.id, products }
      })
    )

    // Update Supabase: JSONB backup + normalized tables
    if (_logId) {
      // 1. JSONB backup on analyses (non-blocking)
      supabase
        .from("analyses")
        .update({
          search_queries: searchDetails.map((d) => ({
            id: d.id,
            original_query: d.original_query,
            query_sent: d.query_sent,
            gender_appended: d.gender_appended,
          })),
          search_results: searchDetails.map((d) => ({
            id: d.id,
            raw_result_count: d.raw_result_count,
            filtered_count: d.filtered_count,
            scored_results: d.scored_results,
            final_products: d.final_products,
          })),
          search_duration_ms: Date.now() - searchStart,
        })
        .eq("id", _logId)
        .then(({ error }) => {
          if (error) console.error("Failed to update search results:", error)
        })

      // 2. Update analysis_items with sent queries
      for (const detail of searchDetails) {
        supabase
          .from("analysis_items")
          .update({
            search_query_sent: detail.query_sent,
            gender_appended: detail.gender_appended,
          })
          .eq("analysis_id", _logId)
          .eq("item_id", detail.id)
          .then(({ error }) => {
            if (error) console.error("Failed to update item query:", error)
          })
      }

      // 3. Insert normalized search results
      const searchResultRows: {
        item_id?: string
        analysis_id: string
        serp_position: number
        title: string
        brand: string
        price: string
        extracted_price: number
        rating: number | null
        reviews: number | null
        thumbnail_url: string
        product_link: string
        platform: string
        relevance_score: number
        is_selected: boolean
      }[] = []

      for (const detail of searchDetails) {
        // Get the analysis_item ID for this item
        const { data: itemRow } = await supabase
          .from("analysis_items")
          .select("id")
          .eq("analysis_id", _logId)
          .eq("item_id", detail.id)
          .single()

        if (!itemRow) continue

        for (const scored of detail.scored_results as Array<{
          position: number; title: string; source: string; price: string;
          extracted_price: number; rating?: number; reviews?: number;
          thumbnail: string; link: string; _score: number
        }>) {
          const isSelected = detail.final_products.some(
            (fp: { link?: string; title?: string }) => fp.link === scored.link || fp.title === scored.title
          )
          searchResultRows.push({
            item_id: itemRow.id,
            analysis_id: _logId,
            serp_position: scored.position,
            title: scored.title,
            brand: scored.source,
            price: scored.price,
            extracted_price: scored.extracted_price,
            rating: scored.rating ?? null,
            reviews: scored.reviews ?? null,
            thumbnail_url: scored.thumbnail,
            product_link: scored.link,
            platform: scored.source,
            relevance_score: scored._score,
            is_selected: isSelected,
          })
        }
      }

      if (searchResultRows.length > 0) {
        supabase
          .from("item_search_results")
          .insert(searchResultRows)
          .then(({ error }) => {
            if (error) console.error("Failed to insert search results:", error)
          })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Product search error:", error)
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 }
    )
  }
}
