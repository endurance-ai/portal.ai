"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Star, Trash2, ExternalLink } from "lucide-react"
import Image from "next/image"

interface GoldenSetItem {
  id: string
  analysis_id: string
  image_url: string | null
  expected_node_primary: string | null
  expected_node_secondary: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expected_items: any[] | null
  test_type: string | null
  notes: string | null
  added_by: string | null
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "short", day: "numeric" })
}

export function EvalGoldenSet() {
  const [items, setItems] = useState<GoldenSetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch("/api/admin/eval/golden-set")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setItems(data.goldenSet || []) })
      .finally(() => setLoading(false))
  }, [])

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch("/api/admin/eval/golden-set", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== deleteId))
        toast.success("골든셋에서 제거되었습니다")
        setDeleteId(null)
      } else {
        toast.error("삭제에 실패했습니다")
      }
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <Star className="size-8 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">아직 골든셋이 없습니다</p>
        <p className="text-xs text-muted-foreground/60 mt-1">품질 평가에서 &quot;Golden Set에 추가&quot;를 체크하면 여기에 표시됩니다</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="text-turquoise font-semibold">{items.length}</span>개 항목
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const itemCount = Array.isArray(item.expected_items) ? item.expected_items.length : 0

            return (
              <div
                key={item.id}
                className="group rounded-lg border border-border bg-card p-4 space-y-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/20 hover:border-turquoise/30"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="size-3.5 text-turquoise fill-turquoise" />
                    <span className="text-xs text-muted-foreground font-mono">{formatDate(item.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={`/admin/eval/${item.analysis_id}`}
                      className="flex size-6 items-center justify-center rounded-md hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(item.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>

                {/* Image + Nodes */}
                <div className="flex gap-3">
                  {item.image_url ? (
                    <div className="relative size-16 shrink-0 rounded-md overflow-hidden border border-border bg-muted">
                      <Image src={item.image_url} alt="" fill sizes="64px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="size-16 shrink-0 rounded-md border border-border bg-muted flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">N/A</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex gap-1 flex-wrap">
                      {item.expected_node_primary && (
                        <Badge className="bg-turquoise/10 text-turquoise border-turquoise/30 text-xs">
                          {item.expected_node_primary}
                        </Badge>
                      )}
                      {item.expected_node_secondary && (
                        <Badge variant="outline" className="text-xs">
                          {item.expected_node_secondary}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{itemCount} 아이템</span>
                    {item.test_type && (
                      <Badge variant="secondary" className="text-[10px] w-fit">{item.test_type}</Badge>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {item.notes && (
                  <p className="text-xs text-muted-foreground truncate">{item.notes}</p>
                )}

                {/* Footer */}
                <p className="text-[11px] text-muted-foreground/60">{item.added_by}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>골든셋에서 제거</DialogTitle>
            <DialogDescription>이 항목을 골든셋에서 제거할까요?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>취소</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              제거
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
