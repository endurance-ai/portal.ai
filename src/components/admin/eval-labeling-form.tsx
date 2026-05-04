"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, PlayCircle, Calculator } from "lucide-react"
import { cn } from "@/lib/utils"

// SPEC-V6-EVAL T-014 — eval-labeling-form (REQ-V6-EVAL-002, REQ-V6-EVAL-003)
// 1. POST /api/admin/eval/run on mount → top-10 product list + judgment placeholders
// 2. PATCH /api/admin/eval/judgments/{id} on grade change
// 3. POST /api/admin/eval/compute when all 10 graded

type AlgorithmVersion = "v4" | "v6"

interface RunProduct {
  brand: string
  title: string
  link: string
  imageUrl: string
  price: string
  platform: string
}

// SPEC-V6-EVAL-V2 REQ-001/002a: run 응답에 포함된 judgmentRows entry shape
interface JudgmentRowEntry {
  id: string
  productId: string
  productKey: string
}

interface ProductWithJudgment {
  product: RunProduct
  judgmentId: string | null
  productId: string | null
  grade: number | null
}

const GRADE_LABELS: Record<number, { label: string; cls: string }> = {
  0: { label: "irrelevant", cls: "bg-muted text-muted-foreground" },
  1: { label: "poor", cls: "bg-red-500/10 text-red-400 border-red-400/30" },
  2: { label: "good", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
  3: { label: "excellent", cls: "bg-turquoise/10 text-turquoise border-turquoise/30" },
}

interface Props {
  goldenQueryId: string
  algorithmVersion: AlgorithmVersion
}

export function EvalLabelingForm({ goldenQueryId, algorithmVersion }: Props) {
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [computing, setComputing] = useState(false)
  const [products, setProducts] = useState<ProductWithJudgment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [computeResult, setComputeResult] = useState<{ ndcgAt10: number; precisionAt5: number } | null>(null)

  async function executeRun() {
    setRunning(true)
    setError(null)
    setComputeResult(null)
    try {
      const res = await fetch("/api/admin/eval/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goldenQueryId, algorithmVersion }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "검색 실행 실패")
        toast.error(json.error || "검색 실행 실패")
        setProducts([])
        return
      }
      const ranked: RunProduct[] = json.rankedProducts || []
      // SPEC-V6-EVAL-V2 REQ-002a: run 응답의 judgmentRows 를 productKey(=link) 로 indexed Map 으로 변환 후 주입
      const judgmentRows: JudgmentRowEntry[] = json.judgmentRows || []
      const byProductKey = new Map<string, JudgmentRowEntry>()
      for (const r of judgmentRows) byProductKey.set(r.productKey, r)
      setProducts(
        ranked.map((p) => {
          const j = byProductKey.get(p.link)
          return {
            product: p,
            judgmentId: j?.id ?? null,
            productId: j?.productId ?? null,
            grade: null,
          }
        }),
      )
      toast.success(`${ranked.length}개 상품 로드 완료`)
    } catch (e) {
      setError((e as Error).message)
      toast.error("검색 실행 중 예외 발생")
    } finally {
      setRunning(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    executeRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goldenQueryId, algorithmVersion])

  async function setGrade(idx: number, grade: number) {
    const row = products[idx]
    if (!row.judgmentId) {
      // SPEC-V6-EVAL-V2 REQ-002a: judgmentRows 빈 배열인 경우 안내 표시 (버튼 자체는 disabled 이지만 방어 차원)
      return
    }
    // Optimistic update
    setProducts((prev) => prev.map((r, i) => (i === idx ? { ...r, grade } : r)))
    try {
      const res = await fetch(`/api/admin/eval/judgments/${encodeURIComponent(row.judgmentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relevanceGrade: grade }),
      })
      if (!res.ok) {
        toast.error("등급 저장 실패")
        // revert
        setProducts((prev) => prev.map((r, i) => (i === idx ? { ...r, grade: row.grade } : r)))
      }
    } catch {
      toast.error("등급 저장 예외")
    }
  }

  async function compute() {
    const productOrder = products.map((r) => r.productId).filter((id): id is string => !!id)
    if (productOrder.length === 0) {
      toast.error("계산할 상품이 없습니다")
      return
    }
    setComputing(true)
    try {
      const res = await fetch("/api/admin/eval/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          algorithmVersion,
          rankedResults: [{ goldenQueryId, productOrder }],
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "계산 실패")
        return
      }
      setComputeResult({ ndcgAt10: json.ndcgAt10, precisionAt5: json.precisionAt5 })
      toast.success("계산 완료 — Runs 탭에서 확인하세요")
    } finally {
      setComputing(false)
    }
  }

  const allGraded = products.length > 0 && products.every((p) => p.grade !== null)

  if (loading && running) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="size-6 animate-spin text-turquoise" />
        <p className="text-sm text-muted-foreground">검색 실행 중...</p>
        <p className="text-xs text-muted-foreground/60">/api/search-products 호출 + judgment placeholder 생성</p>
      </div>
    )
  }

  if (error && products.length === 0) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={executeRun}>
          <PlayCircle className="size-3.5 mr-1" />
          다시 시도
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            라벨링 진행: <span className="text-turquoise">{products.filter(p => p.grade !== null).length}</span>
            <span className="text-muted-foreground"> / {products.length}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            algorithm: <Badge variant="outline" className="text-[10px] ml-1">{algorithmVersion}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={executeRun} disabled={running}>
            {running ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <PlayCircle className="size-3.5 mr-1" />}
            재실행
          </Button>
          <Button size="sm" onClick={compute} disabled={!allGraded || computing}>
            {computing ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Calculator className="size-3.5 mr-1" />}
            Compute Run
          </Button>
        </div>
      </div>

      {/* SPEC-V6-EVAL-V2 REQ-002a: judgmentRows 빈 배열 (모든 upsert 실패 등) 시 라벨링 불가 안내 */}
      {products.length > 0 && products.every((p) => !p.judgmentId) && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-center">
          <p className="text-sm text-yellow-500">라벨링 가능한 상품이 없습니다</p>
        </div>
      )}

      {computeResult && (
        <div className="rounded-lg border border-turquoise/30 bg-turquoise/5 p-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">NDCG@10</p>
            <p className="text-2xl font-bold tabular-nums text-turquoise">{computeResult.ndcgAt10.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Precision@5</p>
            <p className="text-2xl font-bold tabular-nums text-turquoise">{computeResult.precisionAt5.toFixed(4)}</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {products.map((row, idx) => (
          <div
            key={row.product.link}
            className={cn(
              "rounded-lg border bg-card p-3 space-y-3 transition-colors",
              row.grade === null
                ? "border-border"
                : "border-turquoise/30",
            )}
          >
            <div className="flex gap-3">
              <div className="relative size-20 shrink-0 rounded-md overflow-hidden border border-border bg-muted">
                {row.product.imageUrl ? (
                  <Image src={row.product.imageUrl} alt="" fill sizes="80px" className="object-cover" unoptimized />
                ) : (
                  <div className="size-full flex items-center justify-center text-[10px] text-muted-foreground">N/A</div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">#{idx + 1} · {row.product.brand}</p>
                <p className="text-xs font-medium line-clamp-2">{row.product.title}</p>
                <p className="text-xs text-turquoise tabular-nums">{row.product.price}</p>
              </div>
            </div>

            {/* Grade picker */}
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((g) => {
                const meta = GRADE_LABELS[g]
                const active = row.grade === g
                return (
                  <button
                    key={g}
                    onClick={() => setGrade(idx, g)}
                    disabled={!row.judgmentId}
                    data-active={active}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                      active
                        ? meta.cls + " border"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                      !row.judgmentId && "opacity-40 cursor-not-allowed",
                    )}
                    aria-label={`${g} ${meta.label}`}
                  >
                    {g} <span className="opacity-70">{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">검색 결과가 없습니다</p>
        </div>
      )}
    </div>
  )
}
