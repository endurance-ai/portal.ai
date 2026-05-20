import type {Metadata} from "next"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {CrawlMonitor} from "@/components/admin/crawl-monitor"
import type {PlatformStatsRow} from "@/domains/admin-tools/products/crawl-monitor.route"

export const metadata: Metadata = {title: "크롤 모니터 · kiko.ai Admin"}
export const dynamic = "force-dynamic"

export default async function CrawlMonitorPage() {
  await requireApprovedAdmin()

  const {data, error} = await supabase.rpc("admin_crawl_platform_stats")
  const rows = error ? [] : ((data ?? []) as PlatformStatsRow[])

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">크롤 모니터</h1>
        <p className="text-sm text-muted-foreground">
          플랫폼별 SKU / 마지막 크롤 / stale·임베딩·브랜드 매칭 / 필드 채움률.
          {" "}
          <span className="text-muted-foreground/70">crawler 본체는 외부 리포 (endurance-ai/crawler) · 트리거는 Phase 2 예정</span>
        </p>
      </header>

      {error ? (
        <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          집계 실패: {error.message}
        </div>
      ) : (
        <CrawlMonitor rows={rows} />
      )}
    </div>
  )
}
