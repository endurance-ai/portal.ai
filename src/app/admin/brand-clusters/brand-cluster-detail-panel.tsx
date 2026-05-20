"use client"

import {ExternalLink, X} from "lucide-react"

export type BrandDetail = {
  brand: {
    id: number
    name: string
    primary_style_node_id: number | null
    secondary_style_node_id: number | null
    style_node_confidence: number | null
    attributes: Record<string, unknown> | null
    gender_scope: string[] | null
    source_platforms: string[] | null
    price_min_usd: number | null
    price_max_usd: number | null
  }
  cluster: {id: number | null; computed_at: string | null}
  stats: {sku_count: number; rep_count: number}
  rep_images: Array<{
    product_id: string | number
    name: string | null
    image_url: string
    product_url: string | null
    color: string | null
    category: string | null
  }>
  prices: {
    min: number | null
    median: number | null
    max: number | null
    count: number
    currency: string | null
  }
  categories: Array<{label: string; count: number}>
  similar: Array<{
    brand_id: number
    brand_name: string
    primary_style_node_id: number | null
    similarity: number
  }>
  nodes_by_id: Record<number, {code: string; name_en: string}>
}

const ATTR_ORDER = [
  "vibe", "palette", "material", "silhouette", "detail", "pattern",
  "gender_lean", "formality", "price_tier", "era_reference", "subculture",
]

function fmtPrice(n: number | null, cur: string | null): string {
  if (n == null) return "—"
  const sym = cur === "USD" ? "$" : cur === "KRW" ? "₩" : (cur ? cur + " " : "")
  return `${sym}${n.toLocaleString(undefined, {maximumFractionDigits: 0})}`
}

function NodeBadge({
  nid, nodes,
}: {
  nid: number | null
  nodes: Record<number, {code: string; name_en: string}>
}) {
  if (nid == null) return <span className="text-muted-foreground">—</span>
  const n = nodes[nid]
  if (!n) return <span className="text-muted-foreground">#{nid}</span>
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
      <span className="font-mono text-muted-foreground">{n.code}</span>
      <span className="text-foreground">{n.name_en}</span>
    </span>
  )
}

export function BrandClusterDetailPanel({
  brandId,
  detail,
  loading,
  error,
  onClose,
  onSelectBrand,
}: {
  brandId: number | null
  detail: BrandDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
  onSelectBrand: (id: number) => void
}) {
  if (brandId == null) return null

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-card text-foreground shadow-2xl border-l border-border overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">brand_id={brandId}</div>
          <div className="truncate text-base font-semibold">
            {detail?.brand.name ?? (loading ? "로딩 중…" : "—")}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="m-4 rounded border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          load failed: {error}
        </div>
      )}

      {detail && (
        <div className="p-4 space-y-5">
          {/* ─── 핵심 메타 ─── */}
          <section className="space-y-1.5 text-sm">
            <Row label="primary node">
              <NodeBadge nid={detail.brand.primary_style_node_id} nodes={detail.nodes_by_id} />
              {detail.brand.style_node_confidence != null && (
                <span className="ml-2 text-xs text-muted-foreground">
                  conf {detail.brand.style_node_confidence.toFixed(2)}
                </span>
              )}
            </Row>
            <Row label="secondary node">
              <NodeBadge nid={detail.brand.secondary_style_node_id} nodes={detail.nodes_by_id} />
            </Row>
            <Row label="cluster">
              {detail.cluster.id == null ? (
                <span className="text-muted-foreground">—</span>
              ) : detail.cluster.id === -1 ? (
                <span className="text-muted-foreground">noise</span>
              ) : (
                <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
                  #{detail.cluster.id}
                </span>
              )}
            </Row>
            <Row label="gender">
              {detail.brand.gender_scope?.length
                ? detail.brand.gender_scope.join(", ")
                : <span className="text-muted-foreground">—</span>}
            </Row>
            <Row label="price (USD)">
              {detail.brand.price_min_usd == null && detail.brand.price_max_usd == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span>
                  ${(detail.brand.price_min_usd ?? 0).toFixed(0)} – ${(detail.brand.price_max_usd ?? 0).toFixed(0)}
                </span>
              )}
            </Row>
            <Row label="platforms">
              <span className="text-xs text-muted-foreground">
                {detail.brand.source_platforms?.join(", ") || "—"}
              </span>
            </Row>
            <Row label="stats">
              <span className="text-xs">
                SKU {detail.stats.sku_count.toLocaleString()} · 대표 {detail.stats.rep_count}
              </span>
            </Row>
            {detail.prices.count > 0 && (
              <Row label="price (raw)">
                <span className="text-xs">
                  {fmtPrice(detail.prices.min, detail.prices.currency)} ·{" "}
                  med {fmtPrice(detail.prices.median, detail.prices.currency)} ·{" "}
                  {fmtPrice(detail.prices.max, detail.prices.currency)}
                </span>
              </Row>
            )}
          </section>

          {/* ─── 대표 이미지 grid ─── */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              대표상품 {detail.rep_images.length}장
            </div>
            {detail.rep_images.length === 0 ? (
              <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                대표상품 이미지 없음
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {detail.rep_images.map((img) => (
                  <a
                    key={String(img.product_id)}
                    href={img.product_url ?? "#"}
                    target="_blank"
                    rel="noopener"
                    className="group relative block aspect-square overflow-hidden rounded border border-border bg-muted"
                    title={img.name ?? ""}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.image_url}
                      alt={img.name ?? ""}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                    {img.product_url && (
                      <ExternalLink className="absolute right-1 top-1 h-3 w-3 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                    )}
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* ─── attributes ─── */}
          <section>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">attributes</div>
            {!detail.brand.attributes || Object.keys(detail.brand.attributes).length === 0 ? (
              <div className="text-xs text-muted-foreground">없음</div>
            ) : (
              <dl className="space-y-1 text-xs">
                {ATTR_ORDER.map((k) => {
                  const v = detail.brand.attributes?.[k]
                  if (v == null || (Array.isArray(v) && v.length === 0)) return null
                  return (
                    <div key={k} className="grid grid-cols-[90px_1fr] gap-2">
                      <dt className="font-mono text-muted-foreground">{k}</dt>
                      <dd className="flex flex-wrap gap-1">
                        {Array.isArray(v) ? (
                          v.map((x, i) => (
                            <span key={i} className="rounded border border-border bg-muted/40 px-1.5 py-0.5">
                              {String(x)}
                            </span>
                          ))
                        ) : (
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5">{String(v)}</span>
                        )}
                      </dd>
                    </div>
                  )
                })}
                {typeof detail.brand.attributes.reasoning === "string" && (
                  <div className="mt-2 rounded border border-border bg-muted/30 p-2 text-muted-foreground italic">
                    “{detail.brand.attributes.reasoning as string}”
                  </div>
                )}
              </dl>
            )}
          </section>

          {/* ─── 카테고리 ─── */}
          {detail.categories.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">categories</div>
              <ul className="space-y-0.5 text-xs">
                {detail.categories.map((c) => (
                  <li key={c.label} className="flex justify-between">
                    <span>{c.label}</span>
                    <span className="tabular-nums text-muted-foreground">{c.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ─── 유사 brand ─── */}
          {detail.similar.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                similar brands (cosine top-{detail.similar.length})
              </div>
              <ul className="space-y-1 text-xs">
                {detail.similar.map((s) => (
                  <li key={s.brand_id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectBrand(s.brand_id)}
                      className="truncate text-left text-foreground hover:underline"
                    >
                      {s.brand_name}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <NodeBadge nid={s.primary_style_node_id} nodes={detail.nodes_by_id} />
                      <span className="tabular-nums text-muted-foreground">
                        {(s.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {loading && !detail && (
        <div className="p-6 text-center text-sm text-muted-foreground">로딩 중…</div>
      )}
    </div>
  )
}

function Row({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-1 text-sm">{children}</div>
    </div>
  )
}
