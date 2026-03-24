import { NextRequest, NextResponse } from "next/server"

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
    const { queries, gender } = (await request.json()) as {
      queries: { id: string; category: string; searchQuery: string }[]
      gender?: string
    }

    if (!queries?.length) {
      return NextResponse.json(
        { error: "No search queries provided" },
        { status: 400 }
      )
    }

    // Search all items in parallel
    const results = await Promise.all(
      queries.map(async (item) => {
        // Ensure gender is in the query for better filtering
        let query = item.searchQuery
        const genderLabel = gender === "female" ? "women" : gender === "male" ? "men" : ""
        if (genderLabel && !query.toLowerCase().includes(genderLabel)) {
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
          return { id: item.id, products: [] }
        }

        const data = await res.json()
        const rawProducts: SerpApiProduct[] = data.shopping_results ?? []

        // Filter and rank: prefer products with images, ratings, and reasonable prices
        const scored = rawProducts
          .filter((p) => p.thumbnail && p.extracted_price > 0)
          .map((p) => ({
            ...p,
            _score:
              (p.rating ? p.rating * 2 : 0) +
              (p.reviews ? Math.min(p.reviews / 100, 3) : 0) +
              (p.thumbnail ? 2 : 0) +
              (10 - p.position) * 0.5, // relevance boost for higher position
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

        return { id: item.id, products }
      })
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Product search error:", error)
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 }
    )
  }
}
