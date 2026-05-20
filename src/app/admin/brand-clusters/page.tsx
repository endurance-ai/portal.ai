import {NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabase"
import {BrandClustersClient, BrandPoint, NodeLabel} from "./brand-clusters-client"

export const dynamic = "force-dynamic"

export default async function BrandClustersPage() {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        관리자 권한이 필요합니다.
      </div>
    )
  }

  const {data: umap} = await supabase
    .from("brand_multimodal_umap")
    .select("brand_id, x, y, computed_at, cluster_id, cluster_computed_at")

  const brandIds = (umap ?? []).map((r) => r.brand_id)

  const [brandsRes, nodesRes] = await Promise.all([
    brandIds.length > 0
      ? supabase
          .from("brand_nodes")
          .select("id, brand_name, primary_style_node_id, secondary_style_node_id")
          .in("id", brandIds)
      : Promise.resolve({data: [], error: null}),
    supabase
      .from("style_nodes")
      .select("id, code, name_en")
      .eq("is_active", true)
      .order("code"),
  ])

  const brandById = new Map(((brandsRes.data ?? []) as Array<{id: number; brand_name: string; primary_style_node_id: number | null; secondary_style_node_id: number | null}>).map((b) => [b.id, b]))

  const points: BrandPoint[] = (umap ?? []).map((r) => {
    const b = brandById.get(r.brand_id)
    return {
      brand_id: r.brand_id,
      brand_name: b?.brand_name ?? "(unknown)",
      primary_style_node_id: b?.primary_style_node_id ?? null,
      secondary_style_node_id: b?.secondary_style_node_id ?? null,
      cluster_id: (r as {cluster_id?: number | null}).cluster_id ?? null,
      x: r.x,
      y: r.y,
    }
  })

  const nodes: NodeLabel[] = ((nodesRes.data ?? []) as Array<{id: number; code: string; name_en: string}>).map((n) => ({
    id: n.id,
    code: n.code,
    name_en: n.name_en,
  }))

  const latestComputed = (umap ?? [])
    .map((r) => r.computed_at)
    .sort()
    .at(-1) ?? null

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">브랜드 클러스터</h1>
          <p
            className="text-sm text-muted-foreground"
            title="FashionSigLIP 768-dim 멀티모달 임베딩의 cosine top-10 이웃 시각화. 거리=실제 유사도 (UMAP 압축 X)."
          >
            이미지+속성 임베딩 cosine top-10 ⓘ · {points.length} brand
          </p>
        </div>
        <div className="space-y-0.5 text-right text-xs text-muted-foreground">
          <div>임베딩 갱신: {latestComputed ? new Date(latestComputed).toLocaleString("ko-KR") : "—"}</div>
        </div>
      </header>

      {points.length < 10 && (
        <div className="rounded border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          현재 임베딩 보유 브랜드 {points.length}개 — 2D 시각화는 10개 이상에서 의미 있음. 크롤러 분류 완료 후 재계산 권장.
        </div>
      )}

      <BrandClustersClient points={points} nodes={nodes} />
    </div>
  )
}
