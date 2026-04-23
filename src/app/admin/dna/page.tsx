import Link from "next/link"
import {supabase} from "@/lib/supabase"
import {DnaStatusBadge} from "./_components/status-badge"

export const dynamic = "force-dynamic"

interface ScrapeRow {
  id: string
  handle: string
  full_name: string | null
  status: "success" | "partial" | "failed"
  used_proxy: boolean
  follower_count: number | null
  post_count: number | null
  profile_pic_r2_url: string | null
  is_private: boolean
  is_verified: boolean
  error_message: string | null
  created_at: string
}

async function fetchScrapes(): Promise<{rows: ScrapeRow[]; error: string | null}> {
  const {data, error} = await supabase
    .from("instagram_scrapes")
    .select(
      "id, handle, full_name, status, used_proxy, follower_count, post_count, profile_pic_r2_url, is_private, is_verified, error_message, created_at"
    )
    .order("created_at", {ascending: false})
    .limit(200)

  if (error) return {rows: [], error: error.message}
  return {rows: (data ?? []) as ScrapeRow[], error: null}
}

export default async function AdminDnaListPage() {
  const {rows, error} = await fetchScrapes()

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Style DNA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            /dna 플로우 인스타 스크랩 기록. 최신순 200건.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
          <span>Total · {rows.length}</span>
          <span>Success · {rows.filter((r) => r.status === "success").length}</span>
          <span>Failed · {rows.filter((r) => r.status === "failed").length}</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          DB read failed: {error}
          <div className="text-[11px] mt-1 text-muted-foreground">
            migration 025 적용 안 됐을 가능성 ·
            supabase/migrations/025_instagram_scrapes.sql
          </div>
        </div>
      )}

      {rows.length === 0 && !error && (
        <div className="border border-border bg-card px-6 py-16 text-center">
          <div className="text-sm text-muted-foreground">아직 스크랩 기록이 없습니다.</div>
          <div className="text-[11px] text-muted-foreground/70 mt-2">
            /dna 페이지에서 인스타 핸들을 입력해 첫 스크랩을 만들어보세요.
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
                <th className="text-left font-medium px-4 py-3 w-14"></th>
                <th className="text-left font-medium px-4 py-3">Handle</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Name</th>
                <th className="text-right font-medium px-4 py-3 hidden sm:table-cell">Followers</th>
                <th className="text-right font-medium px-4 py-3 hidden sm:table-cell">Posts</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Proxy</th>
                <th className="text-right font-medium px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link href={`/admin/dna/${row.id}`} className="block">
                      {row.profile_pic_r2_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.profile_pic_r2_url}
                          alt={row.handle}
                          className="w-8 h-8 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted" />
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/dna/${row.id}`}
                      className="text-foreground font-medium hover:underline"
                    >
                      @{row.handle}
                    </Link>
                    {row.is_verified && (
                      <span className="ml-2 text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
                        verified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell truncate max-w-[180px]">
                    {row.full_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell font-mono">
                    {fmtCount(row.follower_count)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell font-mono">
                    {fmtCount(row.post_count)}
                  </td>
                  <td className="px-4 py-3">
                    <DnaStatusBadge status={row.status} />
                    {row.status === "failed" && row.error_message && (
                      <div className="text-[10px] text-muted-foreground/70 mt-1 truncate max-w-[200px]">
                        {row.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground hidden md:table-cell">
                    {row.used_proxy ? "on" : "off"}
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                    {fmtRelative(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function fmtCount(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toISOString().slice(0, 10)
}
