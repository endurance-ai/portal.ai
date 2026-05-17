import "server-only"
import {supabase} from "@/lib/supabase"

/**
 * SPEC-BRAND-EMBED-001 P5: brand multimodal embedding helper.
 *
 * brand_multimodal_embeddings (FashionSigLIP 768-dim) 공간에서
 * 주어진 brand 의 cosine top-K 이웃 반환. HNSW 인덱스 활용.
 */

export type SimilarBrand = {
  brand_id: number
  brand_name: string
  primary_style_node_id: number | null
  similarity: number
}

/**
 * brandId 와 cosine 유사한 top-K brand 반환.
 * target brand 가 임베딩 보유하지 않으면 빈 배열.
 */
export async function findSimilarBrands(brandId: number, limit = 10): Promise<SimilarBrand[]> {
  const {data, error} = await supabase.rpc("find_similar_brands", {
    p_brand_id: brandId,
    p_limit: limit,
  })
  if (error) throw new Error(`findSimilarBrands failed: ${error.message}`)
  return (data ?? []) as SimilarBrand[]
}
