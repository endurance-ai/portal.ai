import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { EvalReviewDetail } from "@/components/admin/eval-review-detail"

export default async function EvalAnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>
}) {
  const { analysisId } = await params

  const [analysisRes, reviewsRes, itemsRes] = await Promise.all([
    supabase.from("analyses").select("*").eq("id", analysisId).single(),
    supabase.from("eval_reviews").select("*").eq("analysis_id", analysisId).order("created_at", { ascending: false }).then(
      (res) => res,
      () => ({ data: null, error: { message: "table not found" } })
    ),
    supabase.from("analysis_items").select("*").eq("analysis_id", analysisId).order("item_index").then(
      (res) => res,
      () => ({ data: null, error: { message: "table not found" } })
    ),
  ])

  if (analysisRes.error) notFound()

  return (
    <EvalReviewDetail
      analysis={analysisRes.data}
      items={itemsRes.data || []}
      reviews={reviewsRes.data || []}
    />
  )
}
