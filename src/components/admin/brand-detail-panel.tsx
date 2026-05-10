"use client"

import {useEffect, useState} from "react"
import {ExternalLink, X} from "lucide-react"

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
  stats: {sku_count: number; in_stock_count: number}
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
  prices: {min: number | null; median: number | null; max: number | null; count: number}
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

const CLUSTER_COLORS: Record<string, string> = {
  minimalist: "#94a3b8",
  contemporary: "#60a5fa",
  classic: "#a78bfa",
  vintage: "#f97316",
  chic: "#ec4899",
  casual: "#34d399",
  luxury: "#fbbf24",
  avantgarde: "#a855f7",
  feminine: "#f472b6",
  streetwear: "#ef4444",
  other: "#6b7280",
  unknown: "#6b7280",
  empty: "#374151",
}

const CLUSTER_LABEL: Record<string, string> = {
  minimalist: "MINIMALIST",
  contemporary: "CONTEMPORARY",
  classic: "CLASSIC",
  vintage: "VINTAGE",
  chic: "CHIC",
  casual: "CASUAL",
  luxury: "LUXURY",
  avantgarde: "AVANT-GARDE",
  feminine: "FEMININE",
  streetwear: "STREETWEAR",
  other: "OTHER",
  unknown: "UNCATEGORIZED",
  empty: "메타 없음",
}

function fmtPrice(n: number | null, currency: string | null = "USD"): string {
  if (n == null) return "-"
  const cur = currency ?? "USD"
  return `${cur === "USD" ? "$" : cur + " "}${n.toLocaleString(undefined, {maximumFractionDigits: 0})}`
}

export function BrandDetailPanel({
  brandId,
  onClose,
  onSelectSimilar,
}: {
  brandId: string | null
  onClose: () => void
  onSelectSimilar: (id: string) => void
}) {
  const [detail, setDetail] = useState<BrandDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!brandId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    fetch(`/api/admin/brand-graph/detail?id=${brandId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: BrandDetail) => {
        if (cancelled) return
        setDetail(d)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [brandId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const isOpen = brandId !== null

  return (
    <div
      className={`absolute top-0 right-0 h-full w-[380px] bg-popover/95 backdrop-blur border-l border-border transition-transform duration-300 ease-out z-20 overflow-y-auto ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      style={{boxShadow: isOpen ? "-8px 0 40px rgba(0,0,0,0.4)" : "none"}}
    >
      {/* 닫기 */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors z-10"
        aria-label="닫기"
      >
        <X className="size-4" />
      </button>

      {loading && (
        <div className="p-6 space-y-4">
          <div className="h-6 w-2/3 bg-secondary/50 animate-pulse rounded" />
          <div className="h-4 w-1/2 bg-secondary/50 animate-pulse rounded" />
          <div className="grid grid-cols-3 gap-2 mt-6">
            {Array.from({length: 5}).map((_, i) => (
              <div key={i} className="aspect-square bg-secondary/50 animate-pulse rounded-md" />
            ))}
          </div>
        </div>
      )}

      {error && <div className="p-6 text-sm text-red-400">에러: {error}</div>}

      {detail && (
        <div className="p-5 pb-12 space-y-5">
          {/* 헤더 */}
          <div>
            <div className="flex items-center gap-2 text-xs mb-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{backgroundColor: CLUSTER_COLORS[detail.brand.cluster] ?? "#6b7280"}}
              />
              <span className="text-muted-foreground tracking-wider">
                {CLUSTER_LABEL[detail.brand.cluster] ?? detail.brand.cluster}
              </span>
              {detail.brand.style_node && (
                <span className="text-muted-foreground/60">· {detail.brand.style_node}</span>
              )}
            </div>
            <h2 className="text-lg font-bold leading-tight">{detail.brand.name}</h2>
            {detail.brand.aliases && detail.brand.aliases.length > 0 && (
              <div className="text-xs text-muted-foreground/70 mt-1">
                aka: {detail.brand.aliases.join(", ")}
              </div>
            )}
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="SKU" value={detail.stats.sku_count.toLocaleString()} />
            <Stat label="재고 있음" value={detail.stats.in_stock_count.toLocaleString()} />
            <Stat
              label="가격대"
              value={
                detail.prices.median != null
                  ? fmtPrice(detail.prices.median, detail.samples[0]?.source_currency)
                  : "-"
              }
              hint="median"
            />
          </div>

          {/* 이미지 샘플 */}
          {detail.samples.length > 0 && (
            <Section title="상품 샘플">
              <div className="grid grid-cols-3 gap-2">
                {detail.samples.slice(0, 5).map((s) => (
                  <a
                    key={s.id}
                    href={s.product_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square rounded-md overflow-hidden bg-secondary/50 group relative"
                  >
                    {s.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.image_url}
                        alt={s.name ?? ""}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]">
                        no image
                      </div>
                    )}
                    {s.category && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                        <div className="text-[9px] text-white/90 truncate">{s.category}</div>
                      </div>
                    )}
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="size-3 text-white/80" />
                    </div>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* 메타 */}
          <Section title="브랜드 메타">
            {detail.brand.sensitivity_tags && detail.brand.sensitivity_tags.length > 0 && (
              <MetaRow
                label="sensitivity"
                values={detail.brand.sensitivity_tags}
                color="#94a3b8"
              />
            )}
            {detail.brand.brand_keywords && detail.brand.brand_keywords.length > 0 && (
              <MetaRow label="keywords" values={detail.brand.brand_keywords} color="#fbbf24" />
            )}
            {detail.brand.attributes?.vibe && (
              <MetaRow label="vibe" values={detail.brand.attributes.vibe} color="#a855f7" />
            )}
            {detail.brand.attributes?.palette && (
              <MetaRow label="palette" values={detail.brand.attributes.palette} color="#60a5fa" />
            )}
            {detail.brand.attributes?.material && (
              <MetaRow label="material" values={detail.brand.attributes.material} color="#34d399" />
            )}
            {detail.brand.attributes?.silhouette && (
              <MetaRow
                label="silhouette"
                values={detail.brand.attributes.silhouette}
                color="#ec4899"
              />
            )}
            {!detail.brand.sensitivity_tags?.length &&
              !detail.brand.brand_keywords?.length &&
              !detail.brand.attributes && (
                <div className="text-xs text-amber-400/70">
                  ⚠️ 메타가 비어있음 — 자율 루프 처리 대기
                </div>
              )}
          </Section>

          {/* 가격 분포 */}
          {detail.prices.count > 0 && (
            <Section title="가격 분포">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Stat
                  label="min"
                  value={fmtPrice(detail.prices.min, detail.samples[0]?.source_currency)}
                  small
                />
                <Stat
                  label="median"
                  value={fmtPrice(detail.prices.median, detail.samples[0]?.source_currency)}
                  small
                />
                <Stat
                  label="max"
                  value={fmtPrice(detail.prices.max, detail.samples[0]?.source_currency)}
                  small
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-1">
                {detail.prices.count} SKU 가격 기준
              </div>
            </Section>
          )}

          {/* 카테고리 분포 */}
          {detail.categories.length > 0 && (
            <Section title="카테고리 분포">
              <div className="space-y-1.5">
                {detail.categories.map((c, i) => (
                  <div key={`${c.label}-${i}`} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 truncate">{c.label}</div>
                    <div className="flex-shrink-0 w-24 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400/70"
                        style={{width: `${Math.min(100, c.percent)}%`}}
                      />
                    </div>
                    <div className="text-muted-foreground w-12 text-right">
                      {c.percent}%
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 성별 분포 */}
          {detail.genders.length > 0 && (
            <Section title="성별 분포">
              <div className="flex h-2 rounded-full overflow-hidden bg-secondary/50">
                {detail.genders.map((g, i) => (
                  <div
                    key={`${g.label}-${i}`}
                    style={{
                      width: `${g.percent}%`,
                      backgroundColor: ["#60a5fa", "#f472b6", "#fbbf24", "#94a3b8", "#6b7280"][i] ?? "#6b7280",
                    }}
                    title={`${g.label} ${g.percent}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
                {detail.genders.map((g, i) => (
                  <span key={`${g.label}-${i}`} className="flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          ["#60a5fa", "#f472b6", "#fbbf24", "#94a3b8", "#6b7280"][i] ?? "#6b7280",
                      }}
                    />
                    {g.label} {g.percent}%
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* source 플랫폼 */}
          {detail.brand.source_platforms && detail.brand.source_platforms.length > 0 && (
            <Section title="유통 플랫폼">
              <div className="flex flex-wrap gap-1.5">
                {detail.brand.source_platforms.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] px-2 py-0.5 rounded bg-secondary text-muted-foreground"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* 유사 브랜드 top-5 */}
          {detail.similar.length > 0 && (
            <Section title="유사 브랜드 top 5">
              <div className="space-y-1">
                {detail.similar.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelectSimilar(s.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/60 transition-colors text-left group"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{backgroundColor: CLUSTER_COLORS[s.cluster] ?? "#6b7280"}}
                    />
                    <div className="flex-1 truncate text-sm group-hover:text-amber-400">
                      {s.name}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {s.similarity.toFixed(3)}
                    </div>
                    {s.skuCount > 0 && (
                      <div className="text-[10px] text-muted-foreground/60 w-12 text-right">
                        SKU {s.skuCount}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  small,
}: {
  label: string
  value: string
  hint?: string
  small?: boolean
}) {
  return (
    <div className="bg-secondary/40 rounded-md px-3 py-2">
      <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">{label}</div>
      <div className={`font-semibold mt-0.5 ${small ? "text-sm" : "text-base"}`}>{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground/50">{hint}</div>}
    </div>
  )
}

function MetaRow({label, values, color}: {label: string; values: string[]; color: string}) {
  return (
    <div className="flex items-start gap-2 text-xs mb-1.5">
      <div className="w-20 text-muted-foreground flex-shrink-0">{label}</div>
      <div className="flex-1 flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{backgroundColor: `${color}22`, color}}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}
