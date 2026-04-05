import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ProductDetail } from "@/components/admin/product-detail"

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [productRes, aiRes] = await Promise.all([
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
  ])

  if (productRes.error) notFound()

  return <ProductDetail product={productRes.data} ai={aiRes.data} />
}
