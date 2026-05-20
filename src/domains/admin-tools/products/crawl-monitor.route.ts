import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"

export const dynamic = "force-dynamic"

// /admin/crawl 페이지용 — 플랫폼별 크롤 현황 집계.
// migration 078 admin_crawl_platform_stats() RPC 한 방.

export type PlatformStatsRow = {
  platform: string
  sku_count: number
  in_stock_count: number
  last_crawled_at: string | null
  stale_count: number
  unembedded_count: number
  unbranded_count: number
  fill_description: number
  fill_color: number
  fill_tags: number
  fill_images: number
}

export async function GET() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {data, error} = await supabase.rpc("admin_crawl_platform_stats")
  if (error) {
    return NextResponse.json({error: error.message}, {status: 500})
  }

  return NextResponse.json({
    platforms: (data ?? []) as PlatformStatsRow[],
    generated_at: new Date().toISOString(),
  })
}
