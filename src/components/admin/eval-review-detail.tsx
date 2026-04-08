"use client"

import {useState} from "react"
import {useRouter} from "next/navigation"
import Image from "next/image"
import {toast} from "sonner"
import {Badge} from "@/components/ui/badge"
import {Button} from "@/components/ui/button"
import {Textarea} from "@/components/ui/textarea"
import {Checkbox} from "@/components/ui/checkbox"
import {Label} from "@/components/ui/label"
import {Card, CardContent} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {AlertCircle, ArrowLeft, CheckCircle, Loader2, Pencil, Pin, PinOff, Plus, Search, Star, Trash2, XCircle} from "lucide-react"
import {cn} from "@/lib/utils"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  analysis: any
  items: any[]
  reviews: any[]
  goldenSet: { id: string; added_by: string; created_at: string } | null
}

type Verdict = "pass" | "fail" | "partial"

const VERDICT_CONFIG: Record<Verdict, { label: string; icon: typeof CheckCircle; className: string; textCls: string }> = {
  pass:    { label: "Pass",    icon: CheckCircle,  className: "border-turquoise bg-turquoise/10 text-turquoise hover:bg-turquoise/20",    textCls: "text-turquoise" },
  fail:    { label: "Fail",    icon: XCircle,      className: "border-red-600 bg-red-600/10 text-red-400 hover:bg-red-600/20",            textCls: "text-red-400" },
  partial: { label: "Partial", icon: AlertCircle,  className: "border-yellow-600 bg-yellow-600/10 text-yellow-400 hover:bg-yellow-600/20", textCls: "text-yellow-400" },
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" }) +
    " " + new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const v = value ?? 0
  const pct = max > 0 ? Math.min((v / max) * 100, 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-muted-foreground shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums text-muted-foreground">{v.toFixed(2)}</span>
    </div>
  )
}

/** Single review row with inline edit + delete dialog */
function ReviewRow({ review, analysisId, onUpdate, onDelete }: {
  review: any
  analysisId: string
  onUpdate: (id: string, verdict: Verdict, comment: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [verdict, setVerdict] = useState<Verdict>(review.verdict)
  const [comment, setComment] = useState<string>(review.comment ?? "")
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const cfg = VERDICT_CONFIG[verdict]

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/eval/${analysisId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, verdict, comment }),
      })
      if (res.ok) {
        onUpdate(review.id, verdict, comment)
        setEditing(false)
        toast.success("리뷰가 수정되었습니다")
      } else {
        toast.error("수정에 실패했습니다")
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/eval/${analysisId}?reviewId=${review.id}`, { method: "DELETE" })
      if (res.ok) {
        onDelete(review.id)
        setDeleteOpen(false)
        toast.success("리뷰가 삭제되었습니다")
      } else {
        toast.error("삭제에 실패했습니다")
      }
    } finally {
      setDeleting(false)
    }
  }

  if (!editing) {
    const Icon = cfg.icon
    return (
      <>
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={cn("size-4", cfg.textCls)} />
                <Badge className={cfg.className}>{review.verdict}</Badge>
                {review.prompt_version && (
                  <Badge variant="outline" className="text-[10px] font-mono">{review.prompt_version}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{review.reviewer_email}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{formatTime(review.created_at)}</span>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditing(true)}>
                  <Pencil className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
            {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
          </CardContent>
        </Card>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>리뷰 삭제</DialogTitle>
              <DialogDescription>
                이 리뷰를 삭제할까요? 삭제 후 복구할 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                취소
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                {deleting && <Loader2 className="size-3.5 mr-1 animate-spin" />}
                삭제
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="p-3 space-y-3">
        <div className="flex gap-2">
          {(Object.entries(VERDICT_CONFIG) as [Verdict, typeof VERDICT_CONFIG[Verdict]][]).map(([key, c]) => {
            const Icon = c.icon
            return (
              <Button key={key} variant="outline" size="sm" className={cn("flex-1", verdict === key && c.className)} onClick={() => setVerdict(key)}>
                <Icon className="size-3.5 mr-1" />{c.label}
              </Button>
            )
          })}
        </div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="의견 (선택)"
          rows={2}
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>취소</Button>
          <Button size="sm" onClick={save} disabled={saving} className="flex-1">
            {saving && <Loader2 className="size-3.5 mr-1 animate-spin" />}수정 저장
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function EvalReviewDetail({ analysis, items, reviews: initialReviews, goldenSet }: Props) {
  const router = useRouter()
  const [reviews, setReviews] = useState<any[]>(initialReviews)
  const [showNewForm, setShowNewForm] = useState(initialReviews.length === 0)
  const [newVerdict, setNewVerdict] = useState<Verdict | null>(null)
  const [newComment, setNewComment] = useState("")
  const [newVersion, setNewVersion] = useState("")
  const [addToGoldenSet, setAddToGoldenSet] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pinned, setPinned] = useState<boolean>(analysis.is_pinned ?? false)

  const searchResults: any[] = analysis.search_results || []

  async function togglePin() {
    const next = !pinned
    try {
      const res = await fetch("/api/admin/eval", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: analysis.id, is_pinned: next }),
      })
      if (res.ok) {
        setPinned(next)
        toast.success(next ? "카드가 고정되었습니다" : "고정이 해제되었습니다")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(`고정 실패: ${data.error || res.statusText}`)
      }
    } catch (err) {
      toast.error("고정 요청에 실패했습니다")
      console.error("togglePin error:", err)
    }
  }

  function handleUpdate(id: string, verdict: Verdict, comment: string) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, verdict, comment } : r))
  }

  function handleDelete(id: string) {
    setReviews(prev => prev.filter(r => r.id !== id))
  }

  async function handleNewSubmit() {
    if (!newVerdict) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/eval/${analysis.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict: newVerdict, comment: newComment, addToGoldenSet, prompt_version: newVersion }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success("리뷰가 제출되었습니다")
        if (data.review) {
          setReviews(prev => [data.review, ...prev])
        }
        setShowNewForm(false)
        setNewVerdict(null)
        setNewComment("")
        setNewVersion("")
      } else {
        toast.error("제출에 실패했습니다")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/eval")}>
          <ArrowLeft className="size-4 mr-1" /> 뒤로
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(pinned && "border-turquoise text-turquoise")}
          onClick={togglePin}
        >
          {pinned ? <PinOff className="size-3.5 mr-1" /> : <Pin className="size-3.5 mr-1" />}
          {pinned ? "고정 해제" : "카드 고정"}
        </Button>
      </div>

      {/* Analysis meta + image */}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {analysis.image_url ? (
          <div className="relative aspect-[3/4] w-full max-w-[240px] rounded-lg overflow-hidden border border-border bg-muted">
            <Image src={analysis.image_url} alt="업로드 이미지" fill sizes="240px" className="object-cover" />
          </div>
        ) : (
          <div className="aspect-[3/4] w-full max-w-[240px] rounded-lg border border-border bg-muted flex items-center justify-center">
            <span className="text-sm text-muted-foreground">이미지 없음</span>
          </div>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {analysis.style_node_primary && (
                <Badge variant="secondary">
                  {analysis.style_node_primary}
                  {analysis.style_node_confidence != null && (
                    <span className="ml-1 opacity-60">{Math.round(analysis.style_node_confidence * 100)}%</span>
                  )}
                </Badge>
              )}
              {analysis.style_node_secondary && <Badge variant="outline">{analysis.style_node_secondary}</Badge>}
              {analysis.detected_gender && <Badge variant="outline">{analysis.detected_gender}</Badge>}
              {goldenSet && (
                <Badge className="gap-1 bg-turquoise/10 text-turquoise border-turquoise/30">
                  <Star className="size-3 fill-turquoise" />
                  Golden Set
                </Badge>
              )}
            </div>

            {analysis.prompt_text && (
              <div className="px-3 py-2 rounded-md bg-muted/50 border border-border">
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Prompt</p>
                <p className="text-sm text-foreground">&quot;{analysis.prompt_text}&quot;</p>
              </div>
            )}

            {analysis.sensitivity_tags?.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {analysis.sensitivity_tags.map((tag: string) => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}

            {analysis.mood_summary && (
              <p className="text-sm italic text-muted-foreground">{analysis.mood_summary}</p>
            )}

            <p className="text-xs text-muted-foreground">
              {formatTime(analysis.created_at)}
              {analysis.analysis_duration_ms != null && (
                <span className="ml-2 tabular-nums">AI: {(analysis.analysis_duration_ms / 1000).toFixed(1)}s</span>
              )}
              {analysis.search_duration_ms != null && (
                <span className="ml-2 tabular-nums">검색: {(analysis.search_duration_ms / 1000).toFixed(1)}s</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Items + Search Results */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">아이템별 검색 결과</h2>
        {(items.length > 0 ? items : (analysis.items || [])).map((item: any, idx: number) => {
          const sr = searchResults.find((r: any) => r.id === (item.item_id || item.id))
          return (
            <Card key={item.id || idx}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.category || item.name}</span>
                    {item.name && item.category && <span className="text-sm text-muted-foreground">{item.name}</span>}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {item.subcategory && <Badge variant="outline" className="text-xs">{item.subcategory}</Badge>}
                    {item.fit && <Badge variant="outline" className="text-xs">{item.fit}</Badge>}
                    {item.fabric && <Badge variant="outline" className="text-xs">{item.fabric}</Badge>}
                  </div>
                </div>

                {(item.search_query_sent || item.searchQuery) && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <Search className="size-3" />EN: {item.search_query_sent || item.searchQuery}
                    </p>
                    {item.search_query_ko && (
                      <p className="text-xs text-muted-foreground font-mono">KO: {item.search_query_ko}</p>
                    )}
                  </div>
                )}

                {sr && (
                  <div className="flex flex-wrap gap-1">
                    {sr.koKeywords?.map((kw: string) => <Badge key={`ko-${kw}`} variant="secondary" className="text-[10px]">KR {kw}</Badge>)}
                    {sr.enKeywords?.map((kw: string) => <Badge key={`en-${kw}`} variant="outline" className="text-[10px]">EN {kw}</Badge>)}
                  </div>
                )}

                {sr?.products && sr.products.length > 0 ? (
                  <div className="space-y-2">
                    {sr.products.map((product: any, pi: number) => (
                      <div key={pi} className="flex gap-3 p-2 rounded-md border border-border hover:bg-muted/30">
                        <div className="size-16 shrink-0 rounded overflow-hidden bg-muted relative">
                          {product.imageUrl ? (
                            <Image src={product.imageUrl} alt={product.title || "product"} fill sizes="64px" className="object-cover" />
                          ) : (
                            <div className="size-full flex items-center justify-center text-muted-foreground text-xs">N/A</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{product.title}</p>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">{product.price}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{product.brand}</span><span>·</span><span>{product.platform}</span>
                          </div>
                          {product.scoring && (
                            <div className="space-y-1 pt-1">
                              <ScoreBar label="카테고리" value={product.scoring.subcategory} max={0.25} color="bg-blue-400" />
                              <ScoreBar label="컬러" value={product.scoring.colorFamily} max={0.20} color="bg-cyan-400" />
                              <ScoreBar label="노드" value={product.scoring.styleNode} max={0.30} color="bg-turquoise" />
                              <ScoreBar label="핏" value={product.scoring.fit} max={0.15} color="bg-purple-400" />
                              <ScoreBar label="소재" value={product.scoring.fabric} max={0.15} color="bg-orange-400" />
                              <ScoreBar label="무드" value={product.scoring.moodTags} max={0.15} color="bg-pink-400" />
                              <div className="flex items-center justify-between text-xs pt-0.5">
                                <div className="flex gap-1 flex-wrap">
                                  {product.scoring.subcategory > 0 && <span className="px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px]">sub ✓</span>}
                                  {product.scoring.colorFamily > 0 && <span className="px-1 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[10px]">color ✓</span>}
                                  {product.scoring.styleNode > 0 && (
                                    <span className="px-1 py-0.5 bg-turquoise/10 text-turquoise rounded text-[10px]">
                                      node {product.scoring.styleNode >= 0.3 ? "primary" : "secondary"}
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono font-semibold tabular-nums">{(product.scoring.totalScore ?? 0).toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">검색 결과 없음</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Reviews section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Review list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              리뷰
              {reviews.length > 0 && (
                <span className="ml-1.5 text-muted-foreground font-normal text-sm">{reviews.length}개</span>
              )}
            </h2>
            {!showNewForm && (
              <Button variant="outline" size="sm" onClick={() => setShowNewForm(true)}>
                <Plus className="size-3.5 mr-1" />리뷰 추가
              </Button>
            )}
          </div>

          {reviews.length === 0 && !showNewForm && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              아직 리뷰가 없습니다
            </div>
          )}

          <div className="space-y-2">
            {reviews.map((r) => (
              <ReviewRow
                key={r.id}
                review={r}
                analysisId={analysis.id}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>

        {/* New review form */}
        {showNewForm && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold">새 리뷰 작성</h2>
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex gap-2">
                  {(Object.entries(VERDICT_CONFIG) as [Verdict, typeof VERDICT_CONFIG[Verdict]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon
                    return (
                      <Button key={key} variant="outline" size="sm" className={cn("flex-1", newVerdict === key && cfg.className)} onClick={() => setNewVerdict(key)}>
                        <Icon className="size-4 mr-1" />{cfg.label}
                      </Button>
                    )
                  })}
                </div>

                <Textarea
                  placeholder="의견을 남겨주세요 (선택)"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={3}
                />

                {/* Version tag */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="version" className="text-xs text-muted-foreground shrink-0">버전</Label>
                  <input
                    id="version"
                    type="text"
                    placeholder="v1.0"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="flex h-7 w-24 rounded-md border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-turquoise"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="golden-set"
                    checked={addToGoldenSet}
                    onCheckedChange={(checked) => setAddToGoldenSet(checked === true)}
                  />
                  <Label htmlFor="golden-set" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <Star className="size-3.5 text-turquoise" />
                    Golden Set에 추가
                  </Label>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowNewForm(false)}>취소</Button>
                  <Button onClick={handleNewSubmit} disabled={!newVerdict || submitting} className="flex-1">
                    {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
                    리뷰 제출
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
