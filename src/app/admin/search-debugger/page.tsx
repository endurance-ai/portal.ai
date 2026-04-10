"use client"

import {useCallback, useState} from "react"
import {SearchDebuggerResults} from "@/components/admin/search-debugger-results"
import {STYLE_NODE_IDS, STYLE_NODES, type StyleNodeId} from "@/lib/fashion-genome"
import {ChevronDown, Loader2, Play} from "lucide-react"
import {cn} from "@/lib/utils"

type DebugResult = {
  id: string
  products: {
    brand: string
    title: string
    price: string
    platform: string
    imageUrl: string
    link: string
    matchReasons?: { field: string; value: string }[]
    _scoring?: {
      subcategory: number
      subcategorySimilar: number
      nameMatch: number
      keywords: number
      fit: number
      fabric: number
      colorFamily: number
      colorAdjacent: number
      styleNode: number
      moodTags: number
      season: number
      pattern: number
      brandDna: number
      totalScore: number
    }
  }[]
}

type SearchMeta = {
  duration: number
  totalProducts: number
  itemCount: number
}

export default function SearchDebuggerPage() {
  const [query, setQuery] = useState("")
  const [gender, setGender] = useState<"male" | "female">("male")
  const [selectedNode, setSelectedNode] = useState<StyleNodeId | null>(null)
  const [nodeOpen, setNodeOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DebugResult[] | null>(null)
  const [meta, setMeta] = useState<SearchMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResults(null)

    const start = Date.now()

    try {
      // Step 1: analyze prompt to get search queries
      const formData = new FormData()
      formData.append("prompt", query)
      formData.append("gender", gender)

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      })

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({}))
        throw new Error(err.error || "Analyze failed")
      }

      const analysis = await analyzeRes.json()

      // Step 2: search products with analyzed queries
      const searchBody = {
        queries: analysis.items?.map((item: { id: string; category: string; subcategory?: string; fit?: string; fabric?: string; colorFamily?: string; searchQuery: string; searchQueryKo?: string; season?: string; pattern?: string }) => ({
          id: item.id,
          category: item.category,
          subcategory: item.subcategory,
          fit: item.fit,
          fabric: item.fabric,
          colorFamily: item.colorFamily,
          searchQuery: item.searchQuery,
          searchQueryKo: item.searchQueryKo,
          season: item.season,
          pattern: item.pattern,
        })) ?? [],
        gender: analysis.detectedGender || gender,
        styleNode: selectedNode
          ? { primary: selectedNode }
          : analysis.styleNode ?? undefined,
        moodTags: analysis.moodTags?.map((t: { label: string }) => t.label) ?? [],
        _logId: analysis._logId,
        _includeScoring: true,
      }

      const searchRes = await fetch("/api/search-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchBody),
      })

      if (!searchRes.ok) {
        throw new Error("Search failed")
      }

      const searchData = await searchRes.json()
      const duration = Date.now() - start
      const totalProducts = searchData.results?.reduce(
        (sum: number, r: DebugResult) => sum + r.products.length, 0
      ) ?? 0

      setResults(searchData.results)
      setMeta({
        duration,
        totalProducts,
        itemCount: searchData.results?.length ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [query, gender, selectedNode])

  return (
    <div className="max-w-[860px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">검색 디버거</h1>
        <p className="text-sm text-muted-foreground mt-1">
          쿼리를 입력하고 검색 결과의 스코어링을 항목별로 분석합니다
        </p>
      </div>

      {/* Input Panel */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label htmlFor="dbg-query" className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              검색 쿼리
            </label>
            <input
              id="dbg-query"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-muted-foreground/40 transition-colors"
              placeholder="미니멀 스타일의 블랙 울 코트"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleRun()}
            />
          </div>
          <div className="w-[100px]">
            <label htmlFor="dbg-gender" className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              성별
            </label>
            <select
              id="dbg-gender"
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground appearance-none focus:outline-none focus:border-muted-foreground/40 transition-colors"
              value={gender}
              onChange={(e) => setGender(e.target.value as "male" | "female")}
            >
              <option value="male">남성</option>
              <option value="female">여성</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleRun}
              disabled={loading || !query.trim()}
              aria-busy={loading}
              aria-label={loading ? "분석 중" : "실행"}
              className="flex items-center gap-1.5 bg-foreground text-background rounded-md px-4 py-2 text-sm font-semibold hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="size-3.5" aria-hidden="true" />
              )}
              실행
            </button>
          </div>
        </div>

        {/* Style Node Chips — collapsible */}
        <div>
          <button
            onClick={() => setNodeOpen(!nodeOpen)}
            aria-expanded={nodeOpen}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 hover:text-foreground transition-colors"
          >
            스타일 노드
            {selectedNode && (
              <span className="normal-case tracking-normal text-foreground">
                — {selectedNode} {STYLE_NODES[selectedNode].name}
              </span>
            )}
            <ChevronDown className={cn("size-3 transition-transform", nodeOpen && "rotate-180")} />
          </button>
          {nodeOpen && (
            <div className="flex flex-wrap gap-1.5">
              {STYLE_NODE_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setSelectedNode(selectedNode === id ? null : id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] border transition-colors",
                    selectedNode === id
                      ? "bg-muted border-muted-foreground/30 text-foreground"
                      : "bg-transparent border-border text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  {id} {STYLE_NODES[id].name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-6 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {results && meta && (
        <SearchDebuggerResults results={results} meta={meta} />
      )}
    </div>
  )
}
