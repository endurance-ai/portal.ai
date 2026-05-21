"use client"

import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import Link from "next/link"
import {ChevronLeft, ChevronRight, Loader2, Search as SearchIcon} from "lucide-react"
import {cn} from "@/lib/utils"
import {BrandNodeDetailDrawer} from "./brand-node-detail"

type StyleNode = {id: number; code: string; name_en: string; is_active: boolean}
type Representative = {product_id: string; image_url: string}
type Brand = {
  id: number
  brand_name: string
  primary: {id: number; code: string; name_en: string} | null
  secondary: {id: number; code: string; name_en: string} | null
  confidence: number | null
  assigned_at: string | null
  model: string | null
  representatives: Representative[]
}
type Resp = {brands: Brand[]; total: number; page: number; limit: number; has_more: boolean}

type Status = "all" | "classified" | "unclassified" | "low_conf"
type WikiFilter = "all" | "with" | "without"

export default function BrandNodesPage() {
  const [nodes, setNodes] = useState<StyleNode[]>([])
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // filters
  const initialQ =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("q") ?? ""
      : ""
  const [nodeId, setNodeId] = useState<string>("")
  const [status, setStatus] = useState<Status>("all")
  const [wikiFilter, setWikiFilter] = useState<WikiFilter>("all")
  const [search, setSearch] = useState(initialQ)
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ)
  const [page, setPage] = useState(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // load style nodes (한 번)
  useEffect(() => {
    fetch("/api/admin/style-nodes")
      .then((r) => r.json())
      .then((d) => setNodes((d.nodes ?? []).filter((n: StyleNode) => n.is_active)))
      .catch(() => {})
  }, [])

  // debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [search])

  // reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [nodeId, status, wikiFilter, debouncedSearch])

  // load brands
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (nodeId) params.set("nodeId", nodeId)
      params.set("status", status)
      if (wikiFilter !== "all") params.set("wiki", wikiFilter)
      if (debouncedSearch) params.set("q", debouncedSearch)
      params.set("page", String(page))
      params.set("limit", "24")
      const res = await fetch(`/api/admin/brand-nodes?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "failed")
      setData(json as Resp)
    } catch (e) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setLoading(false)
    }
  }, [nodeId, status, wikiFilter, debouncedSearch, page])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = useMemo(() => (data ? Math.ceil(data.total / data.limit) : 0), [data])

  // detail drawer
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">브랜드 노드</h1>
        <p className="text-sm text-muted-foreground">
          전체 brand 의 style_node 분류 상태 + 대표상품 검수. brand_nodes 와 products.is_brand_representative 동기화.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-2 rounded-lg border bg-background/95 p-3 backdrop-blur space-y-3">
        {/* status tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(["all", "classified", "low_conf", "unclassified"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-1 transition",
                status === s
                  ? "bg-foreground text-background border-foreground"
                  : "border-muted-foreground/20 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {s === "all" ? "전체" : s === "classified" ? "분류됨" : s === "low_conf" ? "낮은 신뢰도" : "미분류"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="brand 검색..."
              className="w-full rounded border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:border-foreground/40"
            />
          </div>
          <select
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            className="rounded border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40"
          >
            <option value="">전체 노드</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.code} · {n.name_en}
              </option>
            ))}
          </select>
          <select
            value={wikiFilter}
            onChange={(e) => setWikiFilter(e.target.value as WikiFilter)}
            className="rounded border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40"
            title="위키 정보 유무 필터"
          >
            <option value="all">Wiki 전체</option>
            <option value="with">Wiki 있음</option>
            <option value="without">Wiki 없음</option>
          </select>
          {data && (
            <div className="ml-auto text-xs text-muted-foreground tabular-nums">
              total <span className="font-medium text-foreground">{data.total.toLocaleString()}</span>
              {totalPages > 1 && (
                <>
                  {" · "}
                  page <span className="font-medium text-foreground">{page + 1}</span> / {totalPages}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          <span className="text-sm">로딩 중…</span>
        </div>
      )}

      {data && data.brands.length === 0 && !loading && (
        <div className="rounded border border-dashed border-muted-foreground/30 p-10 text-center text-sm text-muted-foreground">
          조건에 맞는 brand 없음
        </div>
      )}

      {data && data.brands.length > 0 && (
        <ul
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
            loading && "opacity-60 transition",
          )}
        >
          {data.brands.map((b) => (
            <BrandCard key={b.id} brand={b} onClick={() => setSelectedBrand(b)} />
          ))}
        </ul>
      )}

      <BrandNodeDetailDrawer
        brandId={selectedBrand?.id ?? null}
        open={selectedBrand !== null}
        onOpenChange={(v) => {
          if (!v) setSelectedBrand(null)
        }}
      />

      {data && totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-4 text-sm">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" />
            이전
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={!data.has_more || loading}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            다음
            <ChevronRight className="size-3.5" />
          </button>
        </nav>
      )}
    </div>
  )
}

function BrandCard({brand: b, onClick}: {brand: Brand; onClick: () => void}) {
  const reps = b.representatives.slice(0, 5)
  const conf = b.confidence

  return (
    <li className="rounded-lg border bg-card p-3 space-y-2 transition hover:border-foreground/30">
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
        title="브랜드 상세 보기"
      >
        <div className="truncate text-sm font-semibold hover:underline">{b.brand_name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
          {b.primary ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">
              {b.primary.code} · {b.primary.name_en}
            </span>
          ) : (
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200">
              미분류
            </span>
          )}
          {b.secondary && (
            <span
              className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200"
              title="보조 노드 (secondary)"
            >
              {b.secondary.code} · {b.secondary.name_en}
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
              {conf.toFixed(2)}
            </span>
          )}
        </div>
      </button>

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

      {b.model && (
        <div className="text-[10px] text-muted-foreground/70">
          {b.model}
          {b.assigned_at && ` · ${new Date(b.assigned_at).toLocaleDateString("ko-KR")}`}
        </div>
      )}
    </li>
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
