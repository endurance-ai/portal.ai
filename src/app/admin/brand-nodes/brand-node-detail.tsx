"use client"

import {useEffect, useState} from "react"
import Link from "next/link"
import {Loader2} from "lucide-react"
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "@/components/ui/sheet"
import {cn} from "@/lib/utils"
import {fmtUsd} from "@/lib/currency-to-usd"

type NodeRef = {id: number; code: string; name_en: string}

type BrandAttributes = {
  vibe?: string[]
  palette?: string[]
  material?: string[]
  silhouette?: string[]
  detail?: string[]
  pattern?: string[]
  gender_lean?: string | null
  formality?: string | null
  price_tier?: string | null
  era_reference?: string | null
  subculture?: string | null
  confidence?: number
  reasoning?: string
}

type Detail = {
  brand: {
    id: number
    name: string
    attributes: BrandAttributes | null
    primary_style_node: NodeRef | null
    secondary_style_node: NodeRef | null
    confidence: number | null
    classify_model: string | null
    classified_at: string | null
    gender_scope: string[] | null
    source_platforms: string[] | null
    price_min_usd: number | null
    price_max_usd: number | null
  }
  stats: {product_count: number; in_stock_count: number}
  samples: Array<{
    id: string
    name: string | null
    image_url: string | null
    sale_price: number | null
    source_price: number | null
    source_currency: string | null
    category: string | null
    product_url: string | null
  }>
  similar: Array<{id: number; name: string; similarity: number}>
}

export function BrandNodeDetailDrawer({
  brandId,
  open,
  onOpenChange,
}: {
  brandId: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (brandId == null || !open) return
    setDetail(null)
    setLoading(true)
    setError(null)
    fetch(`/api/admin/brand-graph/detail?id=${brandId}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? "failed")
        return d as Detail
      })
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "error"))
      .finally(() => setLoading(false))
  }, [brandId, open])
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{detail?.brand.name ?? "로딩 중…"}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            {detail?.brand.primary_style_node && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
                {detail.brand.primary_style_node.code} · {detail.brand.primary_style_node.name_en}
              </span>
            )}
            {detail?.brand.secondary_style_node && (
              <span
                className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200"
                title="보조 노드"
              >
                {detail.brand.secondary_style_node.code} · {detail.brand.secondary_style_node.name_en}
              </span>
            )}
            {detail?.brand.confidence != null && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5",
                  detail.brand.confidence >= 0.85
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
                    : detail.brand.confidence >= 0.7
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                      : "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
                )}
              >
                신뢰도 {detail.brand.confidence.toFixed(2)}
              </span>
            )}
            {detail?.brand.classify_model && (
              <span className="text-muted-foreground/70">
                {detail.brand.classify_model}
                {detail.brand.classified_at && ` · ${new Date(detail.brand.classified_at).toLocaleDateString("ko-KR")}`}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            <span className="text-sm">상세 로딩 중…</span>
          </div>
        )}

        {error && (
          <div className="m-4 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {detail && (
          <div className="space-y-6 p-4">
            {/* 1. 통계 + 가격 (USD 통일) */}
            <section className="grid grid-cols-3 gap-2">
              <StatBox label="상품 수" value={detail.stats.product_count.toLocaleString()} />
              <StatBox label="재고 있음" value={detail.stats.in_stock_count.toLocaleString()} />
              <StatBox
                label="가격대 (USD)"
                value={fmtPriceBand(detail.brand.price_min_usd, detail.brand.price_max_usd)}
              />
            </section>

            {/* 2. 대표 상품 */}
            {detail.samples.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">대표 상품</h3>
                  <span className="text-[11px] text-muted-foreground">상위 {detail.samples.length}개</span>
                </div>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {detail.samples.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/admin/products/${s.id}`}
                        target="_blank"
                        rel="noopener"
                        className="block overflow-hidden rounded border bg-card transition hover:border-foreground/30"
                      >
                        {s.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.image_url}
                            alt={s.name ?? ""}
                            className="aspect-square w-full object-cover bg-muted"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid aspect-square w-full place-items-center bg-muted text-[10px] text-muted-foreground">
                            no image
                          </div>
                        )}
                        <div className="space-y-0.5 p-1.5">
                          <div className="line-clamp-1 text-[11px] font-medium">{s.name ?? "(이름 없음)"}</div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{s.category ?? "—"}</span>
                            {(s.sale_price ?? s.source_price) != null && (
                              <span
                                className="tabular-nums"
                                title={`${s.source_currency ?? "?"} ${s.source_price ?? s.sale_price}`}
                              >
                                {fmtUsd(s.source_price ?? s.sale_price, s.source_currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 3. 브랜드 메타 (attributes) */}
            {detail.brand.attributes && Object.keys(detail.brand.attributes).length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">브랜드 메타</h3>

                {/* 3-1. 배열 속성 (vibe / silhouette / palette / material / detail / pattern) */}
                <dl className="space-y-1.5 text-xs">
                  {(["vibe", "silhouette", "palette", "material", "detail", "pattern"] as const).map((key) => {
                    const values = detail.brand.attributes?.[key]
                    if (!values || values.length === 0) return null
                    return (
                      <div key={key} className="grid grid-cols-[80px_1fr] gap-2">
                        <dt className="text-muted-foreground">{META_KEY_KO[key]}</dt>
                        <dd className="flex flex-wrap gap-1">
                          {values.map((v) => (
                            <span key={v} className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px]">
                              {v}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )
                  })}
                </dl>

                {/* 3-2. 단일값 분류 (formality / price_tier / era_reference / subculture / gender_lean) */}
                {(() => {
                  const a = detail.brand.attributes
                  if (!a) return null
                  const rows: Array<[string, string]> = []
                  if (a.formality) rows.push(["포멀리티", a.formality])
                  if (a.price_tier) rows.push(["포지셔닝", a.price_tier])
                  if (a.era_reference) rows.push(["시대", a.era_reference])
                  if (a.subculture && a.subculture !== "none") rows.push(["서브컬처", a.subculture])
                  if (a.gender_lean) rows.push(["성별 추론", a.gender_lean])
                  if (rows.length === 0) return null
                  return (
                    <dl className="space-y-1.5 border-t pt-2 text-xs">
                      {rows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[80px_1fr] gap-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>
                            <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px]">{value}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )
                })()}

                {/* 3-3. 속성 추출 메타 (attributes.confidence + reasoning) */}
                {(detail.brand.attributes.confidence != null || detail.brand.attributes.reasoning) && (
                  <div className="space-y-1.5 border-t pt-2 text-[10px] text-muted-foreground">
                    {detail.brand.attributes.confidence != null && (
                      <div className="flex justify-between">
                        <span>속성 추출 신뢰도</span>
                        <span className="tabular-nums text-foreground">
                          {detail.brand.attributes.confidence.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {detail.brand.attributes.reasoning && (
                      <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground/80">
                        {detail.brand.attributes.reasoning}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* 4. 유사 브랜드 */}
            {detail.similar.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">유사 브랜드</h3>
                <ul className="space-y-1">
                  {detail.similar.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-xs">
                      <span>{s.name}</span>
                      <span className="text-muted-foreground tabular-nums">{s.similarity.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground/70">
                  ⚠️ 옛 텍스트 임베딩 기반 (정리 예정). 이미지 임베딩 기반으로 갱신 예정.
                </p>
              </section>
            )}

            {/* 5. 부가 정보 */}
            <section className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {detail.brand.gender_scope && detail.brand.gender_scope.length > 0 && (
                <Row label="성별" value={detail.brand.gender_scope.join(", ")} />
              )}
              {detail.brand.source_platforms && detail.brand.source_platforms.length > 0 && (
                <Row label="유통" value={detail.brand.source_platforms.join(", ")} />
              )}
              <Row
                label="가격대 (USD)"
                value={fmtPriceBand(detail.brand.price_min_usd, detail.brand.price_max_usd)}
              />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function StatBox({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

const META_KEY_KO: Record<"vibe" | "silhouette" | "palette" | "material" | "detail" | "pattern", string> = {
  vibe: "무드",
  silhouette: "실루엣",
  palette: "팔레트",
  material: "소재",
  detail: "디테일",
  pattern: "패턴",
}

function fmtPriceBand(min: number | null, max: number | null): string {
  if (min != null && max != null) return `$${Math.round(min)} ~ $${Math.round(max)}`
  if (min != null) return `≥ $${Math.round(min)}`
  if (max != null) return `≤ $${Math.round(max)}`
  return "—"
}
