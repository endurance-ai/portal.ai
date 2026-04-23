"use client"

import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import {useRouter, useSearchParams} from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, X} from "lucide-react"
import {Button} from "@/components/ui/button"
import {CrawlCoverage} from "@/components/admin/crawl-coverage"
import type {FilterOptionsResponse} from "@/app/api/admin/products/filter-options/route"

type ProductAI = {
  category: string | null
  subcategory: string | null
  fit: string | null
  fabric: string | null
  colorFamily: string | null
  styleNode: string | null
  moodTags: string[] | null
  confidence: number | null
}

type Product = {
  id: string
  brand: string
  name: string
  price: number | null
  imageUrl: string | null
  platform: string
  category: string | null
  inStock: boolean
  hasDescription: boolean
  hasMaterial: boolean
  reviewCount: number
  ai: ProductAI | null
}

const SELECT_CLASS =
  "h-8 text-xs border border-border rounded-md bg-background px-2 text-foreground focus:outline-none focus:border-foreground/40 min-w-[110px]"

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function OptionList({
  options,
  includeSelected,
}: {
  options: {value: string; count: number}[]
  includeSelected?: string
}) {
  const seen = new Set<string>()
  const list: {value: string; count: number | null}[] = []
  for (const o of options) {
    if (seen.has(o.value)) continue
    seen.add(o.value)
    list.push(o)
  }
  if (includeSelected && !seen.has(includeSelected)) {
    list.unshift({value: includeSelected, count: null})
  }
  return (
    <>
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {o.value}
          {o.count != null ? ` · ${fmtCount(o.count)}` : ""}
        </option>
      ))}
    </>
  )
}

function ProductCard({p}: {p: Product}) {
  const [imgError, setImgError] = useState(false)
  const aiTags = p.ai
    ? [
        p.ai.category,
        p.ai.subcategory,
        p.ai.styleNode,
        p.ai.colorFamily,
        p.ai.fit,
        p.ai.fabric,
      ].filter(Boolean)
    : []

  return (
    <Link href={`/admin/products/${p.id}`} className="group block">
      <article className="border border-border rounded-md overflow-hidden hover:border-foreground/40 transition-colors bg-card">
        {/* Image */}
        <div className="aspect-[3/4] relative bg-muted">
          {p.imageUrl && !imgError ? (
            <Image
              src={p.imageUrl}
              alt={p.name}
              fill
              sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover"
              unoptimized
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">No Image</span>
            </div>
          )}

          {/* Badges on image */}
          <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
            {!p.inStock && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/80 border border-red-700/50 text-red-300 font-medium">
                품절
              </span>
            )}
          </div>

          {/* Hover/focus overlay — full details (focus-within for keyboard users) */}
          <div className="absolute inset-0 bg-background/95 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity p-2.5 overflow-y-auto text-[10.5px] flex flex-col gap-1.5">
            <div>
              <p className="text-muted-foreground">{p.brand}</p>
              <p className="text-foreground leading-tight">{p.name}</p>
              <p className="text-foreground font-bold tabular-nums mt-1">
                {p.price != null ? `₩${p.price.toLocaleString()}` : "—"}
              </p>
              <p className="text-muted-foreground/70 text-[9.5px] mt-0.5">{p.platform}</p>
            </div>

            {(p.hasDescription || p.hasMaterial || p.reviewCount > 0) && (
              <div className="flex flex-wrap gap-1">
                {p.hasDescription && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    설명
                  </span>
                )}
                {p.hasMaterial && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400">
                    소재
                  </span>
                )}
                {p.reviewCount > 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                    리뷰 {p.reviewCount}
                  </span>
                )}
              </div>
            )}

            {aiTags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {aiTags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-1 py-0.5 rounded bg-turquoise/10 border border-turquoise/20 text-turquoise"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[9px] text-orange-400/70">NO AI</span>
            )}
          </div>
        </div>

        {/* Compact caption */}
        <div className="px-2 py-1.5 space-y-0.5">
          <p className="text-[10px] text-muted-foreground truncate">{p.brand}</p>
          <p className="text-[11px] text-foreground truncate leading-tight">{p.name}</p>
          <p className="text-[12px] font-bold tabular-nums">
            {p.price != null ? `₩${p.price.toLocaleString()}` : "—"}
          </p>
        </div>
      </article>
    </Link>
  )
}

interface FilterState {
  search: string
  category: string
  subcategory: string
  platform: string
  styleNode: string
  colorFamily: string
  fit: string
  fabric: string
  aiStatus: string
  stockStatus: string
  detailStatus: string
  reviewStatus: string
  sort: string
}

const DEFAULTS: FilterState = {
  search: "",
  category: "",
  subcategory: "",
  platform: "",
  styleNode: "",
  colorFamily: "",
  fit: "",
  fabric: "",
  aiStatus: "all",
  stockStatus: "all",
  detailStatus: "all",
  reviewStatus: "all",
  sort: "newest",
}

const CHIP_LABELS: Record<string, string> = {
  search: "검색",
  category: "카테고리",
  subcategory: "서브",
  platform: "플랫폼",
  styleNode: "노드",
  colorFamily: "컬러",
  fit: "핏",
  fabric: "패브릭",
  aiStatus: "AI",
  stockStatus: "재고",
  detailStatus: "상세",
  reviewStatus: "리뷰",
  sort: "정렬",
}

const STATUS_LABELS: Record<string, string> = {
  analyzed: "분석완료",
  unanalyzed: "미분석",
  in_stock: "판매중",
  out_of_stock: "품절",
  with_desc: "있음",
  no_desc: "없음",
  with_reviews: "있음",
  no_reviews: "없음",
  price_desc: "가격↓",
  price_asc: "가격↑",
  brand_asc: "브랜드 A-Z",
}

export default function ProductsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") || "0") || 0)
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState<FilterState>(() => ({
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    subcategory: searchParams.get("subcategory") || "",
    platform: searchParams.get("platform") || "",
    styleNode: searchParams.get("styleNode") || "",
    colorFamily: searchParams.get("colorFamily") || "",
    fit: searchParams.get("fit") || "",
    fabric: searchParams.get("fabric") || "",
    aiStatus: searchParams.get("aiStatus") || "all",
    stockStatus: searchParams.get("stockStatus") || "all",
    detailStatus: searchParams.get("detailStatus") || "all",
    reviewStatus: searchParams.get("reviewStatus") || "all",
    sort: searchParams.get("sort") || "newest",
  }))

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  const [options, setOptions] = useState<FilterOptionsResponse | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  const update = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({...prev, ...patch}))
    setPage(0)
  }, [])

  // Load filter options on mount
  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const res = await fetch("/api/admin/products/filter-options")
        if (!res.ok) {
          const err = await res.json().catch(() => ({error: "failed"}))
          if (!cancelled) setOptionsError(err.error || "필터 옵션 로드 실패")
          return
        }
        const data = (await res.json()) as FilterOptionsResponse
        if (!cancelled) setOptions(data)
      } catch (e) {
        if (!cancelled) setOptionsError((e as Error).message)
      }
    }
    loadOptions()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search)
      setPage(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters.search])

  // Reset subcategory when category changes
  useEffect(() => {
    setFilters((prev) => (prev.subcategory ? {...prev, subcategory: ""} : prev))
  }, [filters.category])

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams()
    const state: Record<string, string> = {
      ...filters,
      search: debouncedSearch,
      page: String(page),
    }
    for (const [k, v] of Object.entries(state)) {
      if (v && v !== "all" && v !== "newest" && v !== "0") params.set(k, v)
    }
    const qs = params.toString()
    router.replace(`/admin/products${qs ? `?${qs}` : ""}`, {scroll: false})
  }, [router, filters, debouncedSearch, page])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        search: debouncedSearch,
        category: filters.category,
        subcategory: filters.subcategory,
        platform: filters.platform,
        styleNode: filters.styleNode,
        colorFamily: filters.colorFamily,
        fit: filters.fit,
        fabric: filters.fabric,
        aiStatus: filters.aiStatus,
        stockStatus: filters.stockStatus,
        detailStatus: filters.detailStatus,
        reviewStatus: filters.reviewStatus,
        sort: filters.sort,
      })
      const res = await fetch(`/api/admin/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products ?? [])
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, filters])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const resetFilters = () => {
    setFilters(DEFAULTS)
    setDebouncedSearch("")
    setPage(0)
  }

  const activeChips = useMemo(() => {
    const chips: {key: keyof FilterState; label: string; onClear: () => void}[] = []
    const pushIfValue = (
      key: keyof FilterState,
      clearValue: string = "",
      toLabel?: (v: string) => string
    ) => {
      const val = filters[key]
      if (!val || val === clearValue) return
      const label = `${CHIP_LABELS[key]}: ${toLabel ? toLabel(val) : val}`
      chips.push({key, label, onClear: () => update({[key]: clearValue} as Partial<FilterState>)})
    }
    if (debouncedSearch) {
      chips.push({
        key: "search",
        label: `${CHIP_LABELS.search}: ${debouncedSearch}`,
        onClear: () => update({search: ""}),
      })
    }
    pushIfValue("category")
    pushIfValue("subcategory")
    pushIfValue("platform")
    pushIfValue("styleNode")
    pushIfValue("colorFamily")
    pushIfValue("fit")
    pushIfValue("fabric")
    pushIfValue("aiStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    pushIfValue("stockStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    pushIfValue("detailStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    pushIfValue("reviewStatus", "all", (v) => STATUS_LABELS[v] ?? v)
    if (filters.sort !== "newest") {
      chips.push({
        key: "sort",
        label: `${CHIP_LABELS.sort}: ${STATUS_LABELS[filters.sort] ?? filters.sort}`,
        onClear: () => update({sort: "newest"}),
      })
    }
    return chips
  }, [filters, debouncedSearch, update])

  const subcategoryOptions =
    filters.category && options?.subcategories[filters.category]
      ? options.subcategories[filters.category]
      : []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">상품 DB</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString()}개 상품
        </span>
      </div>

      {/* Crawl Coverage */}
      <CrawlCoverage />

      {/* Filter bar */}
      <div className="space-y-2.5 border border-border bg-card rounded-md p-3">
        {optionsError && (
          <div className="text-[11px] text-amber-400/80">
            필터 옵션 로드 실패: {optionsError} · migration 026 확인 필요
          </div>
        )}

        {/* Row 1: Search + Sort + Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              placeholder="브랜드/이름/플랫폼 검색..."
              value={filters.search}
              onChange={(e) => setFilters((p) => ({...p, search: e.target.value}))}
              className="h-8 w-full text-xs border border-border rounded-md bg-background pl-8 pr-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
            />
          </div>
          <select
            value={filters.sort}
            onChange={(e) => update({sort: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="newest">최신순</option>
            <option value="price_desc">가격↓</option>
            <option value="price_asc">가격↑</option>
            <option value="brand_asc">브랜드 A-Z</option>
          </select>
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <button
            onClick={resetFilters}
            disabled={activeChips.length === 0}
            className="h-8 text-xs px-3 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5 ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="size-3" />
            초기화
          </button>
        </div>

        {/* Row 2: Product attrs */}
        <FilterRow label="상품">
          <select
            value={filters.category}
            onChange={(e) => update({category: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">카테고리</option>
            {options && (
              <OptionList options={options.categories} includeSelected={filters.category} />
            )}
          </select>
          <select
            value={filters.subcategory}
            onChange={(e) => update({subcategory: e.target.value})}
            disabled={!filters.category}
            className={`${SELECT_CLASS} disabled:opacity-40`}
          >
            <option value="">서브카테고리</option>
            <OptionList options={subcategoryOptions} includeSelected={filters.subcategory} />
          </select>
          <select
            value={filters.platform}
            onChange={(e) => update({platform: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">플랫폼</option>
            {options && (
              <OptionList options={options.platforms} includeSelected={filters.platform} />
            )}
          </select>
        </FilterRow>

        {/* Row 3: AI attrs */}
        <FilterRow label="AI 속성">
          <select
            value={filters.styleNode}
            onChange={(e) => update({styleNode: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">노드</option>
            {options && (
              <OptionList options={options.styleNodes} includeSelected={filters.styleNode} />
            )}
          </select>
          <select
            value={filters.colorFamily}
            onChange={(e) => update({colorFamily: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">컬러</option>
            {options && (
              <OptionList options={options.colorFamilies} includeSelected={filters.colorFamily} />
            )}
          </select>
          <select
            value={filters.fit}
            onChange={(e) => update({fit: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">핏</option>
            {options && <OptionList options={options.fits} includeSelected={filters.fit} />}
          </select>
          <select
            value={filters.fabric}
            onChange={(e) => update({fabric: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="">패브릭</option>
            {options && <OptionList options={options.fabrics} includeSelected={filters.fabric} />}
          </select>
        </FilterRow>

        {/* Row 4: Status flags */}
        <FilterRow label="상태">
          <select
            value={filters.aiStatus}
            onChange={(e) => update({aiStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">AI상태</option>
            <option value="analyzed">분석완료</option>
            <option value="unanalyzed">미분석</option>
          </select>
          <select
            value={filters.stockStatus}
            onChange={(e) => update({stockStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">재고</option>
            <option value="in_stock">판매중</option>
            <option value="out_of_stock">품절</option>
          </select>
          <select
            value={filters.detailStatus}
            onChange={(e) => update({detailStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">상세설명</option>
            <option value="with_desc">있음</option>
            <option value="no_desc">없음</option>
          </select>
          <select
            value={filters.reviewStatus}
            onChange={(e) => update({reviewStatus: e.target.value})}
            className={SELECT_CLASS}
          >
            <option value="all">리뷰</option>
            <option value="with_reviews">있음</option>
            <option value="no_reviews">없음</option>
          </select>
        </FilterRow>

        {/* Active chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onClear}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-foreground/5 border border-foreground/15 text-foreground hover:bg-foreground/10 transition-colors"
              >
                {chip.label}
                <X className="size-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading && products.length === 0 ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex justify-center py-20">
          <p className="text-sm text-muted-foreground">상품이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page + 1} / {totalPages} 페이지 · 총 {total.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function FilterRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground w-[60px] shrink-0">
        {label}
      </span>
      {children}
    </div>
  )
}
