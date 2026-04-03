"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle, XCircle, AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function EvalReviewDetail({ analysis, items, reviews }: Props) {
  const router = useRouter()
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [comment, setComment] = useState("")
  const [addToGoldenSet, setAddToGoldenSet] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)

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
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/admin/eval")}>
        <ArrowLeft className="size-4 mr-1" /> 뒤로
      </Button>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column — Analysis result */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">분석 결과</h2>

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

              {analysis.sensitivity_tags && analysis.sensitivity_tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {analysis.sensitivity_tags.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {analysis.mood_summary && (
                <p className="text-sm italic text-muted-foreground">{analysis.mood_summary}</p>
              )}

              <p className="text-xs text-muted-foreground">
                {formatTime(analysis.created_at)}
                {analysis.analysis_duration_ms != null && (
                  <span className="ml-2">
                    Analysis: {(analysis.analysis_duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Items */}
          <h3 className="text-sm font-semibold">아이템 ({items.length || (Array.isArray(analysis.items) ? analysis.items.length : 0)})</h3>
          <div className="space-y-2">
            {(items.length > 0 ? items : (analysis.items || [])).map((item: any, idx: number) => (
              <Card key={item.id || idx}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.category || item.name}</span>
                    {item.name && item.category && (
                      <span className="text-xs text-muted-foreground">{item.name}</span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {item.subcategory && <Badge variant="outline" className="text-xs">{item.subcategory}</Badge>}
                    {item.fit && <Badge variant="outline" className="text-xs">{item.fit}</Badge>}
                    {item.fabric && <Badge variant="outline" className="text-xs">{item.fabric}</Badge>}
                    {item.color && (
                      <Badge variant="outline" className="text-xs">
                        {item.color_hex && (
                          <span
                            className="inline-block size-2 rounded-full mr-1"
                            style={{ backgroundColor: item.color_hex }}
                          />
                        )}
                        {item.color}
                      </Badge>
                    )}
                  </div>
                  {(item.search_query_sent || item.searchQuery) && (
                    <p className="text-xs text-muted-foreground font-mono">
                      Q: {item.search_query_sent || item.searchQuery}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Right column — Reviews + Form */}
        <div className="space-y-4">
          {/* Previous reviews */}
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
                          <Badge className={cfg?.className || ""}>
                            {r.verdict}
                          </Badge>
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

          {/* New review form */}
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
                  {/* Verdict buttons */}
                  <div className="flex gap-2">
                    {(Object.entries(VERDICT_CONFIG) as [Verdict, typeof VERDICT_CONFIG[Verdict]][]).map(
                      ([key, cfg]) => {
                        const Icon = cfg.icon
                        return (
                          <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            className={cn(
                              "flex-1",
                              verdict === key && cfg.className
                            )}
                            onClick={() => setVerdict(key)}
                          >
                            <Icon className="size-4 mr-1" />
                            {cfg.label}
                          </Button>
                        )
                      }
                    )}
                  </div>

                  {/* Comment */}
                  <Textarea
                    placeholder="의견을 남겨주세요 (선택)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                  />

                  {/* Golden set checkbox */}
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

                  {/* Submit */}
                  <Button
                    onClick={handleSubmit}
                    disabled={!verdict || submitting}
                    className="w-full"
                  >
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
