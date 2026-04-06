"use client"

import {useCallback, useEffect, useRef, useState} from "react"
import {useRouter, useSearchParams} from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {Button} from "@/components/ui/button"
import {ChevronLeft, ChevronRight, Loader2, RotateCcw, Search} from "lucide-react"

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
  ai: ProductAI | null
}

const CATEGORIES = ["Outer", "Top", "Bottom", "Shoes", "Bag", "Dress", "Accessories"]
const SUBCATEGORIES: Record<string, string[]> = {
  Outer: ["overcoat", "trench-coat", "parka", "bomber", "blazer", "cardigan", "vest", "anorak", "leather-jacket", "denim-jacket", "fleece", "windbreaker", "down-jacket", "field-jacket", "chore-jacket", "overshirt", "hoodie"],
  Top: ["t-shirt", "shirt", "blouse", "polo", "sweater", "knit-top", "tank-top", "crop-top", "henley", "turtleneck", "sweatshirt"],
  Bottom: ["jeans", "trousers", "chinos", "shorts", "skirt", "joggers", "cargo-pants", "wide-pants", "leggings", "sweatpants"],
  Shoes: ["sneakers", "boots", "loafers", "derby", "oxford", "sandals", "mules", "heels", "flats", "slides", "chelsea-boots", "combat-boots"],
  Bag: ["tote", "crossbody", "backpack", "clutch", "shoulder-bag", "belt-bag", "messenger", "bucket-bag"],
  Dress: ["mini-dress", "midi-dress", "maxi-dress", "shirt-dress", "wrap-dress", "slip-dress", "knit-dress"],
  Accessories: ["hat", "cap", "scarf", "belt", "sunglasses", "watch", "necklace", "bracelet", "ring", "earrings", "tie", "gloves", "socks"],
}
const PLATFORMS = [
  "shopamomento",
  "adekuver",
  "etcseoul",
  "slowsteadyclub",
  "heights-store",
  "fr8ight",
  "8division",
  "sculpstore",
  "iamshop-online",
  "swallowlounge",
  "visualaid",
  "triplestore",
  "takeastreet",
  "chanceclothing",
  "havati",
  "beslow",
  "anotheroffice",
  "bastong",
  "roughside",
  "blankroom",
  "eastlogue",
  "sienneboutique",
  "mardimercredi",
]
const STYLE_NODES = [
  "A-1", "A-2", "A-3", "B", "B-2", "C", "D", "E",
  "F", "F-2", "F-3", "G", "H", "I", "K",
]
const COLOR_FAMILIES = [
  "BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN",
  "GREEN", "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM",
  "KHAKI", "MULTI",
]

const SELECT_CLASS =
  "h-8 text-xs border border-border rounded-md bg-background px-2 text-foreground focus:outline-none focus:border-foreground/40"

function ProductCard({ p }: { p: Product }) {
  const [imgError, setImgError] = useState(false)

  return (
    <Link href={`/admin/products/${p.id}`}>
      <div className="border border-border rounded-lg overflow-hidden hover:border-foreground/30 transition-colors cursor-pointer">
        {/* Image */}
        <div className="aspect-[3/4] relative bg-muted">
          {p.imageUrl && !imgError ? (
            <Image
              src={p.imageUrl}
              alt={p.name}
              fill
              className="object-cover"
              unoptimized
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">No Image</span>
            </div>
          )}
          {!p.inStock && (
            <div className="absolute top-2 left-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/80 border border-red-700/50 text-red-300 font-medium">
                품절
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          <p className="text-xs text-muted-foreground">{p.brand}</p>
          <p className="text-sm truncate">{p.name}</p>
          <p className="text-sm font-bold tabular-nums">
            {p.price != null ? `₩${p.price.toLocaleString()}` : "—"}
          </p>

          {/* AI section */}
          {p.ai ? (
            <div className="border-t border-border pt-2 mt-2">
              <p className="text-[10px] text-muted-foreground mb-1">AI ANALYSIS</p>
              <div className="flex flex-wrap gap-1">
                {[
                  p.ai.category,
                  p.ai.subcategory,
                  p.ai.styleNode,
                  p.ai.colorFamily,
                  p.ai.fit,
                  p.ai.fabric,
                ]
                  .filter(Boolean)
                  .map((tag, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-turquoise/10 border border-turquoise/20 text-turquoise"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <div className="border-t border-dashed border-orange-400/30 pt-2 mt-2">
              <p className="text-[10px] text-orange-400/70">NO AI DATA</p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function ProductsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read initial state from URL
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [aiAnalyzed, setAiAnalyzed] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") || "0") || 0)
  const [loading, setLoading] = useState(true)

  // Filters — init from URL
  const [search, setSearch] = useState(() => searchParams.get("search") || "")
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") || "")
  const [category, setCategory] = useState(() => searchParams.get("category") || "")
  const [subcategory, setSubcategory] = useState(() => searchParams.get("subcategory") || "")
  const [platform, setPlatform] = useState(() => searchParams.get("platform") || "")
  const [styleNode, setStyleNode] = useState(() => searchParams.get("styleNode") || "")
  const [colorFamily, setColorFamily] = useState(() => searchParams.get("colorFamily") || "")
  const [aiStatus, setAiStatus] = useState(() => searchParams.get("aiStatus") || "all")
  const [stockStatus, setStockStatus] = useState(() => searchParams.get("stockStatus") || "all")
  const [sort, setSort] = useState(() => searchParams.get("sort") || "newest")

  // Sync filters to URL
  const syncUrl = useCallback((overrides: Record<string, string> = {}) => {
    const state: Record<string, string> = {
      page: String(page), search: debouncedSearch, category, subcategory, platform,
      styleNode, colorFamily, aiStatus, stockStatus, sort, ...overrides,
    }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(state)) {
      if (v && v !== "all" && v !== "newest" && v !== "0") params.set(k, v)
    }
    const qs = params.toString()
    router.replace(`/admin/products${qs ? `?${qs}` : ""}`, { scroll: false })
  }, [router, page, debouncedSearch, category, subcategory, platform, styleNode, colorFamily, aiStatus, stockStatus, sort])

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Reset subcategory when category changes
  useEffect(() => {
    setSubcategory("")
  }, [category])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [category, subcategory, platform, styleNode, colorFamily, aiStatus, stockStatus, sort])

  // Reset all filters
  const resetFilters = () => {
    setSearch("")
    setDebouncedSearch("")
    setCategory("")
    setSubcategory("")
    setPlatform("")
    setStyleNode("")
    setColorFamily("")
    setAiStatus("all")
    setStockStatus("all")
    setSort("newest")
    setPage(0)
    router.replace("/admin/products", { scroll: false })
  }

  const hasActiveFilters = search || category || subcategory || platform || styleNode || colorFamily
    || aiStatus !== "all" || stockStatus !== "all" || sort !== "newest"

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        search: debouncedSearch,
        category,
        subcategory,
        platform,
        styleNode,
        colorFamily,
        aiStatus,
        stockStatus,
        sort,
      })
      const res = await fetch(`/api/admin/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products ?? [])
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 0)
        if (data.aiAnalyzed != null) setAiAnalyzed(data.aiAnalyzed)
      }
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, category, subcategory, platform, styleNode, colorFamily, aiStatus, stockStatus, sort])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Sync URL after fetch
  useEffect(() => {
    syncUrl()
  }, [page, debouncedSearch, category, subcategory, platform, styleNode, colorFamily, aiStatus, stockStatus, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">상품 DB</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString()}개 상품
        </span>
      </div>

      {/* AI Coverage Bar */}
      {total > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">AI 분석 완료</span>
            <span className="text-sm font-mono font-semibold">
              {aiAnalyzed.toLocaleString()} / {total.toLocaleString()} ({total > 0 ? ((aiAnalyzed / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-turquoise transition-all duration-500"
              style={{ width: `${total > 0 ? (aiAnalyzed / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            placeholder="검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs border border-border rounded-md bg-background pl-8 pr-3 w-48 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
          />
        </div>

        {/* Category */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">카테고리</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Subcategory — only show when category is selected */}
        {category && SUBCATEGORIES[category] && (
          <select
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">서브카테고리</option>
            {SUBCATEGORIES[category].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Platform */}
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">플랫폼</option>
          {PLATFORMS.map((pl) => (
            <option key={pl} value={pl}>{pl}</option>
          ))}
        </select>

        {/* Style Node */}
        <select
          value={styleNode}
          onChange={(e) => setStyleNode(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">노드</option>
          {STYLE_NODES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        {/* Color Family */}
        <select
          value={colorFamily}
          onChange={(e) => setColorFamily(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">컬러</option>
          {COLOR_FAMILIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* AI Status */}
        <select
          value={aiStatus}
          onChange={(e) => setAiStatus(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="all">AI상태</option>
          <option value="analyzed">분석완료</option>
          <option value="unanalyzed">미분석</option>
        </select>

        {/* Stock Status */}
        <select
          value={stockStatus}
          onChange={(e) => setStockStatus(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="all">재고</option>
          <option value="in_stock">판매중</option>
          <option value="out_of_stock">품절</option>
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="newest">최신순</option>
          <option value="price_desc">가격↓</option>
          <option value="price_asc">가격↑</option>
          <option value="brand_asc">브랜드 A-Z</option>
        </select>

        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="h-8 text-xs px-3 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5 ml-auto"
          >
            <RotateCcw className="size-3" />
            초기화
          </button>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            {page + 1} / {totalPages} 페이지
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
