import Link from "next/link"
import {notFound} from "next/navigation"
import {supabase} from "@/lib/supabase"
import {DnaStatusBadge} from "../_components/status-badge"

export const dynamic = "force-dynamic"

interface Scrape {
  id: string
  handle: string
  source: string
  status: "success" | "partial" | "failed"
  used_proxy: boolean
  full_name: string | null
  biography: string | null
  profile_pic_r2_url: string | null
  profile_pic_original_url: string | null
  follower_count: number | null
  following_count: number | null
  post_count: number | null
  is_private: boolean
  is_verified: boolean
  external_url: string | null
  category: string | null
  raw_data: unknown
  error_message: string | null
  created_at: string
}

interface ScrapeImage {
  id: string
  order_index: number
  shortcode: string | null
  r2_url: string
  original_url: string | null
  caption: string | null
  like_count: number | null
  comment_count: number | null
  taken_at: string | null
  is_video: boolean
  width: number | null
  height: number | null
}

async function fetchScrape(id: string): Promise<{scrape: Scrape | null; images: ScrapeImage[]}> {
  const [scrapeRes, imagesRes] = await Promise.all([
    supabase.from("instagram_scrapes").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("instagram_scrape_images")
      .select("*")
      .eq("scrape_id", id)
      .order("order_index", {ascending: true}),
  ])

  return {
    scrape: (scrapeRes.data as Scrape | null) ?? null,
    images: (imagesRes.data as ScrapeImage[] | null) ?? [],
  }
}

export default async function AdminDnaDetailPage({
  params,
}: {
  params: Promise<{scrapeId: string}>
}) {
  const {scrapeId} = await params
  const {scrape, images} = await fetchScrape(scrapeId)

  if (!scrape) notFound()

  return (
    <div className="p-8 max-w-7xl">
      <Link
        href="/admin/dna"
        className="text-[11px] tracking-[0.12em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to list
      </Link>

      <header className="mt-4 mb-8 flex items-start gap-6 border-b border-border pb-6">
        {scrape.profile_pic_r2_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scrape.profile_pic_r2_url}
            alt={scrape.handle}
            className="w-24 h-24 rounded-full object-cover border border-border shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-muted shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">@{scrape.handle}</h1>
            <DnaStatusBadge status={scrape.status} />
            {scrape.is_verified && (
              <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
                Verified
              </span>
            )}
            {scrape.is_private && (
              <span className="text-[10px] tracking-[0.12em] uppercase text-amber-400">
                Private
              </span>
            )}
          </div>
          {scrape.full_name && (
            <div className="text-sm text-muted-foreground mt-1">{scrape.full_name}</div>
          )}
          {scrape.category && (
            <div className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground/70 mt-1">
              {scrape.category}
            </div>
          )}
          <div className="flex gap-6 mt-4 text-sm">
            <Stat label="Followers" value={fmtCount(scrape.follower_count)} />
            <Stat label="Following" value={fmtCount(scrape.following_count)} />
            <Stat label="Posts" value={fmtCount(scrape.post_count)} />
            <Stat label="Pulled" value={images.length.toString()} />
            <Stat label="Proxy" value={scrape.used_proxy ? "on" : "off"} />
          </div>
          {scrape.biography && (
            <p className="mt-4 text-sm text-foreground/80 whitespace-pre-wrap max-w-2xl">
              {scrape.biography}
            </p>
          )}
          {scrape.external_url && (
            <a
              href={scrape.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              {scrape.external_url}
            </a>
          )}
          <div className="mt-4 flex gap-4 text-[11px] text-muted-foreground/70">
            <span>Scraped · {new Date(scrape.created_at).toLocaleString("ko-KR")}</span>
            <span>Source · {scrape.source}</span>
            <a
              href={`https://instagram.com/${scrape.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline"
            >
              Open on Instagram ↗
            </a>
          </div>
        </div>
      </header>

      {scrape.status === "failed" && scrape.error_message && (
        <div className="mb-8 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {scrape.error_message}
        </div>
      )}

      {images.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Pulled posts · {images.length}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img) => (
              <article
                key={img.id}
                className="border border-border bg-card overflow-hidden flex flex-col"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.r2_url}
                  alt={img.caption?.slice(0, 60) || `post ${img.order_index}`}
                  className="w-full aspect-square object-cover"
                />
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-mono">#{String(img.order_index).padStart(2, "0")}</span>
                    <span className="flex gap-3">
                      {img.like_count != null && <span>♥ {fmtCount(img.like_count)}</span>}
                      {img.comment_count != null && <span>💬 {fmtCount(img.comment_count)}</span>}
                      {img.is_video && (
                        <span className="text-amber-400 uppercase tracking-wider">video</span>
                      )}
                    </span>
                  </div>
                  {img.caption && (
                    <p className="text-[12px] text-foreground/80 line-clamp-4 whitespace-pre-wrap">
                      {img.caption}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground/70">
                    {img.taken_at && (
                      <span>{new Date(img.taken_at).toISOString().slice(0, 10)}</span>
                    )}
                    {img.shortcode && (
                      <a
                        href={`https://instagram.com/p/${img.shortcode}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground underline"
                      >
                        open ↗
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <details className="border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-[11px] tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground">
            Raw IG response (raw_data)
          </summary>
          <pre className="px-4 py-4 text-[11px] leading-relaxed text-muted-foreground overflow-x-auto max-h-[600px]">
            {JSON.stringify(scrape.raw_data, null, 2)}
          </pre>
        </details>
      </section>
    </div>
  )
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground">{label}</div>
      <div className="text-foreground font-medium font-mono">{value}</div>
    </div>
  )
}

function fmtCount(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
