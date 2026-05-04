"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react"

// SPEC-V6-EVAL T-014 — eval-golden-queries (REQ-V6-EVAL-001)
// Self-contained CRUD list. Fetches /api/admin/eval/golden-queries on mount.

interface GoldenQuery {
  id: string
  instagram_url: string | null
  query_signature: string | null
  intent_note: string
  created_by: string
  algorithm_version: string
  created_at: string
}

type AlgVersion = "v4" | "v6"

interface FormState {
  id: string | null // null → create mode
  instagramUrl: string
  querySignature: string
  intentNote: string
  createdBy: string
  algorithmVersion: AlgVersion
}

const EMPTY_FORM: FormState = {
  id: null,
  instagramUrl: "",
  querySignature: "",
  intentNote: "",
  createdBy: "",
  algorithmVersion: "v4",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "short", day: "numeric" })
}

export function EvalGoldenQueries() {
  const [items, setItems] = useState<GoldenQuery[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null) // null → dialog closed

  async function fetchItems() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/eval/golden-queries?page=1&pageSize=50")
      if (res.ok) {
        const json = await res.json()
        setItems(json.items || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  function openCreate() {
    setForm(EMPTY_FORM)
  }

  function openEdit(row: GoldenQuery) {
    setForm({
      id: row.id,
      instagramUrl: row.instagram_url ?? "",
      querySignature: row.query_signature ?? "",
      intentNote: row.intent_note,
      createdBy: row.created_by,
      algorithmVersion: (row.algorithm_version as AlgVersion) || "v4",
    })
  }

  async function handleSubmit() {
    if (!form) return
    if (!form.instagramUrl.trim() && !form.querySignature.trim()) {
      toast.error("instagram_url 또는 query_signature 중 한 가지는 필수입니다")
      return
    }
    if (!form.intentNote.trim() || !form.createdBy.trim()) {
      toast.error("intent_note, created_by 모두 필수입니다")
      return
    }
    setSubmitting(true)
    try {
      const isEdit = form.id !== null
      const url = isEdit
        ? `/api/admin/eval/golden-queries?id=${encodeURIComponent(form.id!)}`
        : "/api/admin/eval/golden-queries"
      const method = isEdit ? "PATCH" : "POST"
      const body = isEdit
        ? {
            intentNote: form.intentNote,
            querySignature: form.querySignature || null,
          }
        : {
            instagramUrl: form.instagramUrl || null,
            querySignature: form.querySignature || null,
            intentNote: form.intentNote,
            createdBy: form.createdBy,
            algorithmVersion: form.algorithmVersion,
          }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success(isEdit ? "수정되었습니다" : "추가되었습니다")
        setForm(null)
        await fetchItems()
      } else if (res.status === 409) {
        toast.error("중복된 식별자입니다 (instagram_url + query_signature)")
      } else {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error || "저장에 실패했습니다")
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/eval/golden-queries?id=${encodeURIComponent(deleteId)}`, {
        method: "DELETE",
      })
      if (res.ok || res.status === 204) {
        toast.success("삭제되었습니다")
        setItems(prev => prev.filter(i => i.id !== deleteId))
        setDeleteId(null)
      } else {
        toast.error("삭제에 실패했습니다")
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="text-turquoise font-semibold">{items.length}</span>개 골든셋 쿼리
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5 mr-1" />
          추가
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">아직 골든셋 쿼리가 없습니다</p>
          <p className="text-xs text-muted-foreground/60 mt-1">우측 상단 &quot;추가&quot; 버튼으로 시작하세요</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instagram URL</TableHead>
                <TableHead>Query Signature</TableHead>
                <TableHead>Intent Note</TableHead>
                <TableHead>Algorithm</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[200px] truncate text-xs font-mono">
                    {row.instagram_url || <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-xs">
                    {row.query_signature || <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs">{row.intent_note}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{row.algorithm_version}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.created_by}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{formatDate(row.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => openEdit(row)}
                        aria-label="편집"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(row.id)}
                        aria-label="삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "골든셋 쿼리 편집" : "골든셋 쿼리 추가"}</DialogTitle>
            <DialogDescription>
              instagram_url 또는 query_signature 중 최소 한 가지는 필요합니다.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Instagram URL</label>
                <Input
                  type="url"
                  placeholder="https://instagram.com/p/..."
                  value={form.instagramUrl}
                  onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
                  disabled={form.id !== null}
                />
                {form.id !== null && (
                  <p className="text-[10px] text-muted-foreground/60">편집 모드에서는 URL을 변경할 수 없습니다</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Query Signature</label>
                <Input
                  placeholder="예: minimalist beige knit"
                  value={form.querySignature}
                  onChange={(e) => setForm({ ...form, querySignature: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Intent Note *</label>
                <Textarea
                  rows={2}
                  placeholder="라벨링 가이드: 어떤 결과를 우수로 볼 것인가?"
                  value={form.intentNote}
                  onChange={(e) => setForm({ ...form, intentNote: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Created By *</label>
                  <Input
                    placeholder="admin@team"
                    value={form.createdBy}
                    onChange={(e) => setForm({ ...form, createdBy: e.target.value })}
                    disabled={form.id !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Algorithm</label>
                  <select
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                    value={form.algorithmVersion}
                    onChange={(e) => setForm({ ...form, algorithmVersion: e.target.value as AlgVersion })}
                    disabled={form.id !== null}
                  >
                    <option value="v4">v4</option>
                    <option value="v6">v6</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={submitting}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              {form?.id ? "저장" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>골든셋 쿼리 삭제</DialogTitle>
            <DialogDescription>
              연결된 judgment/run 데이터에는 영향이 없으나, 새로운 라벨링 트리거가 차단됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={submitting}>
              취소
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={submitting}>
              {submitting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
