import {NextResponse} from "next/server"
import {supabase} from "@/lib/supabase"

export async function GET() {
  // Per-platform coverage: count of products with description/material/reviews
  const { data, error } = await supabase.rpc("get_crawl_coverage")

  if (error) {
    // Fallback: raw query via from()
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("platform, description, material, review_count")

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 })
    }

    const map: Record<string, {
      total: number
      withDescription: number
      withMaterial: number
      withReviews: number
    }> = {}

    for (const p of products || []) {
      const pl = p.platform || "unknown"
      if (!map[pl]) map[pl] = { total: 0, withDescription: 0, withMaterial: 0, withReviews: 0 }
      map[pl].total++
      if (p.description) map[pl].withDescription++
      if (p.material) map[pl].withMaterial++
      if (p.review_count && p.review_count > 0) map[pl].withReviews++
    }

    const platforms = Object.entries(map)
      .map(([platform, stats]) => ({ platform, ...stats }))
      .sort((a, b) => b.total - a.total)

    const totals = platforms.reduce(
      (acc, p) => ({
        total: acc.total + p.total,
        withDescription: acc.withDescription + p.withDescription,
        withMaterial: acc.withMaterial + p.withMaterial,
        withReviews: acc.withReviews + p.withReviews,
      }),
      { total: 0, withDescription: 0, withMaterial: 0, withReviews: 0 }
    )

    return NextResponse.json({ platforms, totals })
  }

  return NextResponse.json(data)
}
