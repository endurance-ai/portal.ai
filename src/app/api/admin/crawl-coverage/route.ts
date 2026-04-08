import {NextResponse} from "next/server"
import {createSupabaseServer} from "@/lib/supabase-server"
import {supabase} from "@/lib/supabase"

export async function GET() {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: products, error } = await supabase
    .from("products")
    .select("platform, description, material, review_count")

  if (error) {
    return NextResponse.json({ error: "Failed to fetch coverage" }, { status: 500 })
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
