"use client"

import {useState} from "react"
import Link from "next/link"
import {toast} from "sonner"
import {Badge} from "@/components/ui/badge"
import {Button} from "@/components/ui/button"
import {Checkbox} from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {AlertCircle, CheckCircle, Clock, Loader2, Package, Pin, Trash2, XCircle,} from "lucide-react"
import {cn} from "@/lib/utils"
import {NODE_COLOR_CLASSES, STYLE_NODE_CONFIG} from "@/lib/style-nodes"

interface ReviewSummary {
  verdict: string
  comment: string | null
  reviewer_email: string
  created_at: string
}

interface QueueItem {
  id: string
  created_at: string
  image_filename: string | null
  prompt_text: string | null
  style_node_primary: string | null
  style_node_confidence: number | null
  detected_gender: string | null
  items: unknown[] | null
  verdict: "pass" | "fail" | "partial" | null
  review_comment: string | null
  reviews?: ReviewSummary[]
  is_pinned?: boolean
}

const VERDICT_CONFIG = {
  pass:    { icon: CheckCircle,  label: "Pass",    textCls: "text-turquoise",  bgCls: "bg-turquoise/15",  borderCls: "border-l-turquoise/80" },
  fail:    { icon: XCircle,      label: "Fail",    textCls: "text-red-400",    bgCls: "bg-red-500/10",    borderCls: "border-l-red-500/60" },
  partial: { icon: AlertCircle,  label: "Partial", textCls: "text-yellow-400", bgCls: "bg-yellow-500/10", borderCls: "border-l-yellow-500/60" },
}

const PENDING_CONFIG = {
  icon: Clock,
  label: "대기",
  textCls: "text-muted-foreground",
  bgCls: "bg-muted/30",
  borderCls: "border-l-border",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric", year: "2-digit" })
}

function shortEmail(email: string) {
  return email.split("@")[0]
}

const VERDICT_ICON: Record<string, typeof CheckCircle> = {
  pass: CheckCircle,
  fail: XCircle,
  partial: AlertCircle,
}

const VERDICT_TEXT_CLS: Record<string, string> = {
  pass: "text-turquoise",
  fail: "text-red-400",
  partial: "text-yellow-400",
}

export function EvalQueue({ queue, filter, onRefresh }: { queue: QueueItem[]; filter: string; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const allSelected = queue.length > 0 && selected.size === queue.length

  function toggleItem(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(queue.map(i => i.id)))
  }

  async function deleteIds(ids: string[]) {
    setDeleting(true)
    try {
      const res = await fetch("/api/admin/eval", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.deleted}개 분석이 삭제되었습니다`)
        setSelected(new Set())
        setBulkDeleteOpen(false)
        setSingleDeleteId(null)
        onRefresh()
      } else {
        toast.error("삭제에 실패했습니다")
      }
    } finally {
      setDeleting(false)
    }
  }

  async function togglePin(e: React.MouseEvent, id: string, current: boolean) {
    e.preventDefault()
    e.stopPropagation()
    const next = !current
    try {
      const res = await fetch("/api/admin/eval", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: id, is_pinned: next }),
      })
      if (res.ok) {
        toast.success(next ? "고정되었습니다" : "고정 해제되었습니다")
        onRefresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(`고정 실패: ${data.error || res.statusText}`)
      }
    } catch (err) {
      toast.error("고정 요청에 실패했습니다")
      console.error("togglePin error:", err)
    }
  }

  if (queue.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        항목이 없습니다
      </div>
    )
  }

  const singleDeleteItem = singleDeleteId ? queue.find(i => i.id === singleDeleteId) : null

  // Separate pinned items (visible in all filters)
  const pinnedItems = queue.filter(i => i.is_pinned)
  const normalItems = queue.filter(i => !i.is_pinned)

  return (
    <>
      {/* Bulk action bar */}
      <div className={cn(
        "flex items-center gap-3 rounded-lg border border-border px-4 py-2.5 transition-all",
        selected.size > 0 ? "bg-muted/50" : "bg-transparent"
      )}>
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleAll}
          aria-label="전체 선택"
        />
        <span className="text-xs text-muted-foreground flex-1">
          {selected.size > 0 ? (
            <span className="text-foreground font-medium">{selected.size}개 선택됨</span>
          ) : (
            "전체 선택"
          )}
        </span>
        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="size-3.5 mr-1" />
            {selected.size}개 삭제
          </Button>
        )}
      </div>

      {/* Pinned section */}
      {pinnedItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-turquoise">
            <Pin className="size-3" />
            <span className="font-medium">고정됨 {pinnedItems.length}개</span>
          </div>
          <div className="space-y-2">
            {pinnedItems.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                isSelected={selected.has(item.id)}
                isPinned
                showPin
                onToggle={() => toggleItem(item.id)}
                onDelete={() => setSingleDeleteId(item.id)}
                onTogglePin={(e) => togglePin(e, item.id, true)}
              />
            ))}
          </div>
          {normalItems.length > 0 && <div className="border-t border-border" />}
        </div>
      )}

      {/* Normal list */}
      <div className="space-y-2">
        {normalItems.map((item) => (
          <QueueCard
            key={item.id}
            item={item}
            isSelected={selected.has(item.id)}
            isPinned={false}
            showPin
            onToggle={() => toggleItem(item.id)}
            onDelete={() => setSingleDeleteId(item.id)}
            onTogglePin={(e) => togglePin(e, item.id, false)}
          />
        ))}
      </div>

      {/* Bulk delete dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>분석 {selected.size}개 삭제</DialogTitle>
            <DialogDescription>
              선택한 {selected.size}개 분석과 연결된 리뷰, 아이템 데이터가 모두 삭제됩니다.
              이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={deleting}>
              취소
            </Button>
            <Button variant="destructive" onClick={() => deleteIds([...selected])} disabled={deleting}>
              {deleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              {selected.size}개 삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single item delete dialog */}
      <Dialog open={!!singleDeleteId} onOpenChange={(o) => !o && setSingleDeleteId(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>분석 삭제</DialogTitle>
            <DialogDescription>
              {singleDeleteItem?.prompt_text
                ? `"${singleDeleteItem.prompt_text.slice(0, 50)}" 분석을 삭제합니다.`
                : "이 분석을 삭제합니다."}
              {" "}연결된 리뷰와 아이템 데이터도 함께 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleDeleteId(null)} disabled={deleting}>
              취소
            </Button>
            <Button variant="destructive" onClick={() => deleteIds([singleDeleteId!])} disabled={deleting}>
              {deleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Individual queue card */
function QueueCard({ item, isSelected, isPinned, showPin, onToggle, onDelete, onTogglePin }: {
  item: QueueItem
  isSelected: boolean
  isPinned: boolean
  showPin: boolean
  onToggle: () => void
  onDelete: () => void
  onTogglePin: (e: React.MouseEvent) => void
}) {
  const statusCfg = item.verdict ? VERDICT_CONFIG[item.verdict] : PENDING_CONFIG
  const StatusIcon = statusCfg.icon
  const itemCount = Array.isArray(item.items) ? item.items.length : 0

  const nodeCfg = item.style_node_primary ? STYLE_NODE_CONFIG[item.style_node_primary] : null
  const nodeColors = nodeCfg ? NODE_COLOR_CLASSES[nodeCfg.color] : null

  const reviews = item.reviews || []

  return (
    <div
      className={cn(
        "group rounded-lg border border-border border-l-2 transition-colors",
        statusCfg.borderCls,
        isPinned && "border-turquoise/30 bg-turquoise/[0.03]",
        isSelected && "bg-muted/40"
      )}
    >
      <div className="flex items-center gap-2">
        {/* Checkbox */}
        <div className="px-4 py-4 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            aria-label="선택"
          />
        </div>

        {/* Card content — clickable link */}
        <Link
          href={`/admin/eval/${item.id}`}
          className="flex flex-1 min-w-0 items-center gap-3 py-3 pr-2 hover:opacity-90"
        >
          <div className="flex flex-1 min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{formatDate(item.created_at)}</span>
              {item.style_node_primary && (
                <Badge variant="secondary" className="text-xs gap-1.5 py-0">
                  {nodeColors && <span className={cn("size-1.5 rounded-full shrink-0", nodeColors.dot)} />}
                  {item.style_node_primary}
                  {item.style_node_confidence != null && (
                    <span className="opacity-50">{Math.round(item.style_node_confidence * 100)}%</span>
                  )}
                </Badge>
              )}
              {item.detected_gender && (
                <Badge variant="outline" className="text-xs py-0">{item.detected_gender}</Badge>
              )}
              {isPinned && <Pin className="size-3 text-turquoise" />}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Package className="size-3" />
                {itemCount}
              </span>
              {item.prompt_text && (
                <span className="truncate text-primary/50">
                  &quot;{item.prompt_text.length > 40 ? item.prompt_text.slice(0, 40) + "…" : item.prompt_text}&quot;
                </span>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className={cn("flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", statusCfg.bgCls, statusCfg.textCls)}>
            <StatusIcon className="size-3.5" />
            {statusCfg.label}
          </div>
        </Link>

        {/* Pin + Delete actions */}
        <div className="pr-2 shrink-0 flex items-center gap-0.5">
          {showPin && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-7 text-muted-foreground transition-opacity", isPinned ? "text-turquoise opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100")}
              onClick={onTogglePin}
            >
              <Pin className="size-3.5" />
            </Button>
          )}
          <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Feedback stack */}
      {reviews.length > 0 && (
        <div className="px-4 pb-3 pt-0 ml-12 border-t border-border/50 mt-0">
          <div className="space-y-1.5 pt-2">
            {reviews.slice(0, 3).map((r) => {
              const VIcon = VERDICT_ICON[r.verdict] || Clock
              const vtextCls = VERDICT_TEXT_CLS[r.verdict] || "text-muted-foreground"
              return (
                <div key={`${r.reviewer_email}-${r.created_at}`} className="flex items-start gap-2 text-xs">
                  <VIcon className={cn("size-3 mt-0.5 shrink-0", vtextCls)} />
                  <span className="text-muted-foreground shrink-0 font-medium">{shortEmail(r.reviewer_email)}</span>
                  {r.comment && (
                    <span className="text-muted-foreground truncate">
                      &ldquo;{r.comment}&rdquo;
                    </span>
                  )}
                </div>
              )
            })}
            {reviews.length > 3 && (
              <span className="text-[10px] text-muted-foreground/50">+{reviews.length - 3}개 더</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
