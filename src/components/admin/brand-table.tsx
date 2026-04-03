"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BrandFilters } from "@/components/admin/brand-filters"
import { BrandEditPanel } from "@/components/admin/brand-edit-panel"
import { Download, Loader2, ChevronLeft, ChevronRight } from "lucide-react"

interface Brand {
  id: string
  brand_name: string
  brand_name_normalized: string
  style_node: string
  category_type: string
  price_band: string
  gender_scope: string[]
  sensitivity_tags: string[]
  attributes: Record<string, string[]> | null
  [key: string]: unknown
}

export function BrandTable() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)

  // Filters
  const [node, setNode] = useState("ALL")
  const [category, setCategory] = useState("")
  const [gender, setGender] = useState("")
  const [search, setSearch] = useState("")

  // Edit panel
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [search])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [node, category, gender, debouncedSearch])

  const fetchBrands = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (node !== "ALL") params.set("node", node)
      if (category && category !== "_all") params.set("category", category)
      if (gender && gender !== "_all") params.set("gender", gender)
      if (debouncedSearch) params.set("q", debouncedSearch)
      params.set("page", String(page))

      const res = await fetch(`/api/admin/brands?${params}`)
      if (res.ok) {
        const data = await res.json()
        setBrands(data.brands || [])
        setTotal(data.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [node, category, gender, debouncedSearch, page])

  useEffect(() => {
    fetchBrands()
  }, [fetchBrands])

  const handleRowClick = (brand: Brand) => {
    setSelectedBrand(brand)
    setEditOpen(true)
  }

  const handleSaved = (updated: Brand) => {
    setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
  }

  const handleCategoryChange = (v: string) => setCategory(v === "_all" ? "" : v)
  const handleGenderChange = (v: string) => setGender(v === "_all" ? "" : v)

  const attrBadges = (attrs: Record<string, string[]> | null) => {
    if (!attrs) return null
    const all = Object.values(attrs).flat()
    const shown = all.slice(0, 3)
    const rest = all.length - shown.length
    return (
      <>
        {shown.map((a) => (
          <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
        ))}
        {rest > 0 && (
          <span className="text-xs text-muted-foreground">+{rest}</span>
        )}
      </>
    )
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Brand Genome DB</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} brands
          </p>
        </div>
        <a
          href="/api/admin/brands/export"
          download
          className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2.5 h-7 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download className="mr-1.5 size-4" />
          Export
        </a>
      </div>

      {/* Filters */}
      <BrandFilters
        node={node}
        category={category}
        gender={gender}
        search={search}
        onNodeChange={setNode}
        onCategoryChange={handleCategoryChange}
        onGenderChange={handleGenderChange}
        onSearchChange={setSearch}
      />

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Node</TableHead>
              <TableHead className="hidden md:table-cell">Attributes</TableHead>
              <TableHead className="hidden sm:table-cell">Gender</TableHead>
              <TableHead className="hidden sm:table-cell">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : brands.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No brands found
                </TableCell>
              </TableRow>
            ) : (
              brands.map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(b)}
                >
                  <TableCell className="font-medium">{b.brand_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{b.style_node}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {attrBadges(b.attributes)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {(b.gender_scope || []).join(", ")}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {b.price_band || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Panel */}
      <BrandEditPanel
        brand={selectedBrand}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={handleSaved}
      />
    </div>
  )
}
