import {notFound} from "next/navigation"
import {supabase} from "@/lib/supabase"
import {ResultClient} from "./result-client"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  params: Promise<{ analysisId: string }>
}

export default async function ResultPage({ params }: PageProps) {
  const { analysisId } = await params
  if (!UUID_RE.test(analysisId)) notFound()

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, prompt_text, image_url, detected_gender, items, ai_raw_response, session_id, sequence_number")
    .eq("id", analysisId)
    .single()

  if (error || !analysis) notFound()

  const raw = analysis.ai_raw_response as Record<string, unknown> | null
  const mood = (raw?.mood ?? {}) as { tags?: { label: string; score: number }[]; summary?: string; vibe?: string; season?: string; occasion?: string }
  const palette = (raw?.palette ?? []) as { hex: string; label: string }[]
  const style = (raw?.style ?? {}) as { fit?: string; aesthetic?: string; gender?: string; detectedGender?: string }
  const styleNode = (raw?.styleNode ?? null) as { primary: string; secondary?: string } | null

  type RawItem = { id: string; category: string; subcategory?: string; name: string; detail?: string; fabric?: string; color?: string; fit?: string; colorFamily?: string; searchQuery: string; searchQueryKo?: string; season?: string; pattern?: string; position?: { top: number; left: number } }
  const items = (analysis.items as RawItem[]) ?? []

  return (
    <ResultClient
      analysisId={analysis.id}
      imageUrl={analysis.image_url ?? ""}
      promptText={analysis.prompt_text ?? ""}
      detectedGender={analysis.detected_gender ?? style.detectedGender ?? ""}
      sessionId={analysis.session_id ?? ""}
      sequenceNumber={analysis.sequence_number ?? 1}
      items={items}
      mood={mood}
      palette={palette}
      style={style}
      styleNode={styleNode}
      moodTags={mood.tags ?? []}
    />
  )
}
