import {notFound} from "next/navigation"
import {supabase} from "@/lib/supabase"
import {ProductDetail} from "@/components/admin/product-detail"

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [productRes, aiRes, reviewsRes] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).single(),
    supabase
      .from("product_ai_analysis")
      .select("*")
      .eq("product_id", id)
      .eq("version", "v1")
      .single()
      .then(
        (res) => res,
        () => ({ data: null, error: null })
      ),
    supabase
      .from("product_reviews")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  if (productRes.error) notFound()

  return (
    <ProductDetail
      product={productRes.data}
      ai={aiRes.data}
      reviews={reviewsRes.data ?? []}
    />
  )
}
