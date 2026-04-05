"use client"

import {useState} from "react"
import {useRouter} from "next/navigation"
import Image from "next/image"
import {Badge} from "@/components/ui/badge"
import {Button} from "@/components/ui/button"
import {Textarea} from "@/components/ui/textarea"
import {Checkbox} from "@/components/ui/checkbox"
import {Label} from "@/components/ui/label"
import {Card, CardContent} from "@/components/ui/card"
import {AlertCircle, ArrowLeft, CheckCircle, Loader2, Search, XCircle} from "lucide-react"
import {cn} from "@/lib/utils"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  analysis: any
  items: any[]
  reviews: any[]
}

type Verdict = "pass" | "fail" | "partial"

const VERDICT_CONFIG: Record<Verdict, { label: string; icon: typeof CheckCircle; className: string }> = {
  pass:    { label: "Pass",    icon: CheckCircle,  className: "border-green-600 bg-green-600/10 text-green-400 hover:bg-green-600/20" },
  fail:    { label: "Fail",    icon: XCircle,      className: "border-red-600 bg-red-600/10 text-red-400 hover:bg-red-600/20" },
  partial: { label: "Partial", icon: AlertCircle,   className: "border-yellow-600 bg-yellow-600/10 text-yellow-400 hover:bg-yellow-600/20" },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
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

export function EvalReviewDetail({ analysis, items, reviews }: Props) {
  const router = useRouter()
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [comment, setComment] = useState("")
  const [addToGoldenSet, setAddToGoldenSet] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

  // search_results from analyses table
  const searchResults: any[] = analysis.search_results || []

  async function handleSubmit() {
    if (!verdict) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/eval/${analysis.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, comment, addToGoldenSet }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/admin/eval")}>
        <ArrowLeft className="size-4 mr-1" /> 뒤로
      </Button>

      {/* Analysis meta + uploaded image */}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Uploaded image */}
        {analysis.image_url ? (
          <div className="relative aspect-[3/4] w-full max-w-[240px] rounded-lg overflow-hidden border border-border bg-muted">
            <Image
              src={analysis.image_url}
              alt="업로드 이미지"
              fill
              sizes="240px"
              className="object-cover"
            />
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
                  <span className="ml-1 opacity-60">
                    {Math.round(analysis.style_node_confidence * 100)}%
                  </span>
                )}
              </Badge>
            )}
            {analysis.style_node_secondary && (
              <Badge variant="outline">{analysis.style_node_secondary}</Badge>
            )}
            {analysis.detected_gender && (
              <Badge variant="outline">{analysis.detected_gender}</Badge>
            )}
          </div>

          {analysis.prompt_text && (
            <div className="px-3 py-2 rounded-md bg-muted/50 border border-border">
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Prompt</p>
              <p className="text-sm text-foreground">&quot;{analysis.prompt_text}&quot;</p>
            </div>
          )}

          {analysis.sensitivity_tags && analysis.sensitivity_tags.length > 0 && (
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

      {/* Items + Search Results (per item) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">아이템별 검색 결과</h2>

        {(items.length > 0 ? items : (analysis.items || [])).map((item: any, idx: number) => {
          // 매칭되는 search_results 찾기
          const sr = searchResults.find((r: any) => r.id === (item.item_id || item.id))

          return (
            <Card key={item.id || idx}>
              <CardContent className="p-4 space-y-3">
                {/* Item header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{item.category || item.name}</span>
                    {item.name && item.category && (
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {item.subcategory && <Badge variant="outline" className="text-xs">{item.subcategory}</Badge>}
                    {item.fit && <Badge variant="outline" className="text-xs">{item.fit}</Badge>}
                    {item.fabric && <Badge variant="outline" className="text-xs">{item.fabric}</Badge>}
                  </div>
                </div>

                {/* Search queries */}
                {(item.search_query_sent || item.searchQuery) && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <Search className="size-3" />
                      EN: {item.search_query_sent || item.searchQuery}
                    </p>
                    {item.search_query_ko && (
                      <p className="text-xs text-muted-foreground font-mono">
                        🇰🇷 KO: {item.search_query_ko}
                      </p>
                    )}
                  </div>
                )}

                {/* Keywords used */}
                {sr && (
                  <div className="flex flex-wrap gap-1">
                    {sr.koKeywords?.map((kw: string) => (
                      <Badge key={`ko-${kw}`} variant="secondary" className="text-[10px]">🇰🇷 {kw}</Badge>
                    ))}
                    {sr.enKeywords?.map((kw: string) => (
                      <Badge key={`en-${kw}`} variant="outline" className="text-[10px]">EN {kw}</Badge>
                    ))}
                  </div>
                )}

                {/* Products with scoring */}
                {sr?.products && sr.products.length > 0 ? (
                  <div className="space-y-2">
                    {sr.products.map((product: any, pi: number) => (
                      <div key={pi} className="flex gap-3 p-2 rounded-md border border-border hover:bg-muted/30">
                        {/* Product image */}
                        <div className="size-16 shrink-0 rounded overflow-hidden bg-muted relative">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.title || "product"}
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="size-full flex items-center justify-center text-muted-foreground text-xs">N/A</div>
                          )}
                        </div>

                        {/* Product info + scoring */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{product.title}</p>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">{product.price}</span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{product.brand}</span>
                            <span>·</span>
                            <span>{product.platform}</span>
                          </div>

                          {/* Score breakdown */}
                          {product.scoring && (
                            <div className="space-y-1 pt-1">
                              <ScoreBar label="카테고리" value={product.scoring.subcategory} max={0.25} color="bg-blue-400" />
                              <ScoreBar label="컬러" value={product.scoring.colorFamily} max={0.20} color="bg-cyan-400" />
                              <ScoreBar label="노드" value={product.scoring.styleNode} max={0.30} color="bg-green-400" />
                              <ScoreBar label="핏" value={product.scoring.fit} max={0.15} color="bg-purple-400" />
                              <ScoreBar label="소재" value={product.scoring.fabric} max={0.15} color="bg-orange-400" />
                              <ScoreBar label="무드" value={product.scoring.moodTags} max={0.15} color="bg-pink-400" />

                              <div className="flex items-center justify-between text-xs pt-0.5">
                                <div className="flex gap-1 flex-wrap">
                                  {product.scoring.subcategory > 0 && (
                                    <span className="px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px]">sub ✓</span>
                                  )}
                                  {product.scoring.colorFamily > 0 && (
                                    <span className="px-1 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[10px]">color ✓</span>
                                  )}
                                  {product.scoring.styleNode > 0 && (
                                    <span className="px-1 py-0.5 bg-green-500/10 text-green-400 rounded text-[10px]">
                                      node {product.scoring.styleNode >= 0.3 ? 'primary' : 'secondary'}
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono font-semibold tabular-nums">
                                  {(product.scoring.totalScore ?? 0).toFixed(2)}
                                </span>
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

      {/* Reviews + Form */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Previous reviews */}
        <div className="space-y-4">
          {reviews.length > 0 && (
            <>
              <h2 className="text-lg font-semibold">이전 리뷰</h2>
              <div className="space-y-2">
                {reviews.map((r: any) => {
                  const cfg = VERDICT_CONFIG[r.verdict as Verdict]
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={cfg?.className || ""}>{r.verdict}</Badge>
                          <span className="text-xs text-muted-foreground">{r.reviewer_email}</span>
                        </div>
                        {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                        <p className="text-xs text-muted-foreground">{formatTime(r.created_at)}</p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* New review form */}
        <div className="space-y-4">
          {saved ? (
            <Card>
              <CardContent className="p-6 flex items-center gap-2 text-green-400">
                <CheckCircle className="size-5" />
                <span className="font-medium">리뷰가 저장되었습니다</span>
              </CardContent>
            </Card>
          ) : (
            <>
              <h2 className="text-lg font-semibold">리뷰</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-2">
                    {(Object.entries(VERDICT_CONFIG) as [Verdict, typeof VERDICT_CONFIG[Verdict]][]).map(
                      ([key, cfg]) => {
                        const Icon = cfg.icon
                        return (
                          <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            className={cn("flex-1", verdict === key && cfg.className)}
                            onClick={() => setVerdict(key)}
                          >
                            <Icon className="size-4 mr-1" />
                            {cfg.label}
                          </Button>
                        )
                      }
                    )}
                  </div>

                  <Textarea
                    placeholder="의견을 남겨주세요 (선택)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                  />

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="golden-set"
                      checked={addToGoldenSet}
                      onCheckedChange={(checked) => setAddToGoldenSet(checked === true)}
                    />
                    <Label htmlFor="golden-set" className="text-sm cursor-pointer">
                      Add to Golden Set
                    </Label>
                  </div>

                  <Button onClick={handleSubmit} disabled={!verdict || submitting} className="w-full">
                    {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
                    리뷰 제출
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
