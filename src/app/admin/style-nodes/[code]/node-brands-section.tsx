"use client"

import {useCallback, useEffect, useState} from "react"
import Link from "next/link"
import {ExternalLink, Loader2} from "lucide-react"
import {cn} from "@/lib/utils"

type Role = "primary" | "secondary" | "both"

type Representative = {product_id: string; image_url: string}

type Brand = {
  id: number
  brand_name: string
  primary_style_node_id: number | null
  secondary_style_node_id: number | null
  style_node_confidence: number | null
  style_node_assigned_at: string | null
  style_node_assigned_model: string | null
  representatives: Representative[]
}

type Resp = {
  node: {id: number; code: string; name_en: string; name_ko: string}
  role: Role
  total: number
  brands: Brand[]
}

export function NodeBrandsSection({code}: {code: string}) {
  const [role, setRole] = useState<Role>("both")
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/style-nodes/${code}/brands?role=${role}&limit=300`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "failed")
      setData(json as Resp)
    } catch (e) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setLoading(false)
    }
  }, [code, role])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-3 border-t pt-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">분류된 브랜드</h2>
          <p className="text-xs text-muted-foreground">
            primary_style_node_id 또는 secondary_style_node_id 가 이 노드인 brand. 대표이미지로 분류 정합성 검수.
          </p>
        </div>
        <div className="flex gap-1 rounded border bg-muted/30 p-0.5 text-xs">
          {(["both", "primary", "secondary"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "rounded px-2 py-1 transition",
                role === r ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r === "both" ? "전체" : r === "primary" ? "primary" : "secondary"}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          <span className="text-sm">로딩 중…</span>
        </div>
      )}

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="text-xs text-muted-foreground">
            총 <span className="font-medium text-foreground">{data.total}</span> brand
            {role !== "both" && ` (${role} 만)`}
          </div>

          {data.brands.length === 0 ? (
            <div className="rounded border border-dashed border-muted-foreground/30 p-8 text-center text-sm text-muted-foreground">
              분류된 brand 없음
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.brands.map((b) => (
                <BrandCard key={b.id} brand={b} nodeId={data.node.id} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function BrandThumb({url, productId}: {url: string; productId: string}) {
  const [failed, setFailed] = useState(false)
  const [bust, setBust] = useState(0)

  if (failed) {
    return (
      <div className="relative aspect-square w-full">
        <Link
          href={`/admin/products/${productId}`}
          target="_blank"
          rel="noopener"
          className="grid h-full w-full place-items-center rounded border border-dashed border-muted-foreground/30 bg-muted/30 text-[10px] text-muted-foreground hover:bg-muted/60"
          title="상품 페이지로 이동"
        >
          go
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setFailed(false)
            setBust((n) => n + 1)
          }}
          className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded bg-background/80 text-[9px] text-muted-foreground hover:bg-background"
          title="다시 시도"
        >
          ↻
        </button>
      </div>
    )
  }

  return (
    <Link
      href={`/admin/products/${productId}`}
      target="_blank"
      rel="noopener"
      className="group relative block"
      title="상품 페이지로 이동"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bust ? `${url}${url.includes("?") ? "&" : "?"}_r=${bust}` : url}
        alt=""
        className="aspect-square w-full rounded object-cover bg-muted transition group-hover:opacity-80"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </Link>
  )
}

function BrandCard({brand: b, nodeId}: {brand: Brand; nodeId: number}) {
  const isPrimary = b.primary_style_node_id === nodeId
  const isSecondary = b.secondary_style_node_id === nodeId
  const conf = b.style_node_confidence != null ? Number(b.style_node_confidence) : null
  const reps = b.representatives.slice(0, 5)

  return (
    <li className="rounded border bg-card p-3 space-y-2">
      <header className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/brand-nodes?q=${encodeURIComponent(b.brand_name)}`}
          target="_blank"
          rel="noopener"
          className="group min-w-0 flex-1"
          title="브랜드 노드에서 보기"
        >
          <div className="truncate text-sm font-semibold group-hover:underline">
            {b.brand_name}
            <ExternalLink className="ml-1 inline size-3 text-muted-foreground/60" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
            {isPrimary && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
                primary
              </span>
            )}
            {isSecondary && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200">
                secondary
              </span>
            )}
            {conf != null && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5",
                  conf >= 0.85
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
                    : conf >= 0.7
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                      : "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
                )}
              >
                conf {conf.toFixed(2)}
              </span>
            )}
          </div>
        </Link>
      </header>

      {reps.length === 0 ? (
        <div className="grid h-20 place-items-center rounded border border-dashed border-muted-foreground/30 text-[11px] text-muted-foreground">
          대표 상품 없음
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-1">
          {reps.map((r, i) => (
            <BrandThumb key={`${b.id}-${i}-${r.product_id}`} url={r.image_url} productId={r.product_id} />
          ))}
        </div>
      )}

      {b.style_node_assigned_model && (
        <div className="text-[10px] text-muted-foreground/70">
          {b.style_node_assigned_model}
          {b.style_node_assigned_at && ` · ${new Date(b.style_node_assigned_at).toLocaleDateString("ko-KR")}`}
        </div>
      )}
    </li>
  )
}
