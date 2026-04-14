import type {Metadata} from "next"
import Image from "next/image"
import {supabase} from "@/lib/supabase"
import {Header} from "@/components/layout/header"
import {Footer} from "@/components/layout/footer"
import {SectionMarker} from "@/components/ui/section-marker"

export const metadata: Metadata = {
  title: "PORTAL — Archive",
}

// Supabase 연결 실패 / 빌드 시점 fallback 용으로 서버 fetch
export const dynamic = "force-dynamic"

interface AnalysisRow {
  id: string
  created_at: string
  image_url: string | null
  prompt_text: string | null
  style_node: {primary?: string} | null
}

async function fetchRecent(): Promise<AnalysisRow[]> {
  try {
    const {data, error} = await supabase
      .from("analyses")
      .select("id, created_at, image_url, prompt_text, style_node")
      .order("created_at", {ascending: false})
      .limit(20)
    if (error) return []
    return (data ?? []) as AnalysisRow[]
  } catch {
    return []
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {month: "short", day: "numeric"})
}

export default async function ArchivePage() {
  const rows = await fetchRecent()

  return (
    <>
      <Header />
      <main className="flex-grow px-6 md:px-14 pt-28 pb-20 min-h-screen">
        <div className="max-w-[880px] mx-auto">
          <SectionMarker
            numeral="I."
            title="A look, archived"
            aside={`${rows.length} entries`}
          />

          {rows.length === 0 ? (
            <p className="text-[15px] text-ink-muted">Nothing archived yet.</p>
          ) : (
            <ul className="border-t border-ink">
              {rows.map((row, idx) => (
                <li
                  key={row.id}
                  className="grid grid-cols-[32px_56px_1fr_80px] items-center gap-4 py-4 border-b border-line"
                >
                  <span className="text-[12px] font-medium text-ink-quiet tabular-nums">
                    {String(idx + 1).padStart(3, "0")}
                  </span>
                  <div className="relative w-[56px] h-[72px] bg-line-mute overflow-hidden">
                    {row.image_url && (
                      <Image
                        src={row.image_url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover grayscale"
                        unoptimized
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink tracking-[-0.02em] truncate">
                      {row.prompt_text?.trim() || row.style_node?.primary || "Untitled look"}
                    </div>
                    <div className="text-[12px] font-medium text-ink-quiet tracking-[-0.01em] mt-0.5">
                      {row.style_node?.primary ?? "—"}
                    </div>
                  </div>
                  <span className="text-[12px] font-medium text-ink-quiet tabular-nums text-right tracking-[-0.01em]">
                    {formatDate(row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
