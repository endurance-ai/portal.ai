// 037 BGE-m3 텍스트 임베딩 자산은 migration 067 에서 폐기됨 (brand_nodes.embedding, x_umap, y_umap, sensitivity_tags).
// 새 시각화는 /admin/brand-clusters (이미지 임베딩 기반 UMAP) 사용.
import {redirect} from "next/navigation"

export default function BrandGraphPage() {
  redirect("/admin/brand-clusters")
}
