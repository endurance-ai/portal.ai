"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"

interface Analysis {
  id: string
  created_at: string
  image_filename: string | null
  style_node_primary: string | null
  style_node_confidence: number | null
  detected_gender: string | null
  items: unknown[] | null
  analysis_duration_ms: number | null
  search_duration_ms: number | null
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function formatDuration(ms: number | null) {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function AnalysisTable() {
  const router = useRouter()
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics?tab=analyses&page=${page}`)
      if (res.ok) {
        const data = await res.json()
        setAnalyses(data.analyses || [])
        setTotal(data.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalPages = Math.ceil(total / 30)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Analysis Logs</h2>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} total analyses
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Node</TableHead>
              <TableHead className="hidden sm:table-cell">Items</TableHead>
              <TableHead className="hidden sm:table-cell">Gender</TableHead>
              <TableHead className="hidden md:table-cell">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : analyses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No analyses found
                </TableCell>
              </TableRow>
            ) : (
              analyses.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/admin/eval/${a.id}`)}
                >
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatTime(a.created_at)}
                  </TableCell>
                  <TableCell>
                    {a.style_node_primary ? (
                      <Badge variant="outline">
                        {a.style_node_primary}
                        {a.style_node_confidence != null && (
                          <span className="ml-1 text-muted-foreground">
                            {Math.round(a.style_node_confidence * 100)}%
                          </span>
                        )}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {Array.isArray(a.items) ? a.items.length : 0}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {a.detected_gender || "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground whitespace-nowrap">
                    {formatDuration(a.analysis_duration_ms)}
                    {a.search_duration_ms != null && (
                      <span className="text-xs"> + {formatDuration(a.search_duration_ms)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  )
}
