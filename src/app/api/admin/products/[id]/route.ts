import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServer } from "@/lib/supabase-server"
import { supabase } from "@/lib/supabase"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Fetch product
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single()

  if (productError || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  // Fetch AI data (v1)
  const { data: aiData } = await supabase
    .from("product_ai_analysis")
    .select("*")
    .eq("product_id", id)
    .eq("version", "v1")
    .single()

  // Transform response
  const response = {
    product: {
      id: product.id,
      brand: product.brand,
      name: product.name,
      price: product.price,
      originalPrice: product.original_price,
      salePrice: product.sale_price,
      imageUrl: product.image_url,
      images: product.images,
      productUrl: product.product_url,
      platform: product.platform,
      category: product.category,
      subcategory: product.subcategory,
      gender: product.gender,
      inStock: product.in_stock,
      color: product.color,
      material: product.material,
      description: product.description,
      tags: product.tags,
      sizeInfo: product.size_info,
      createdAt: product.created_at,
      ai: aiData
        ? {
            category: aiData.category,
            subcategory: aiData.subcategory,
            fit: aiData.fit,
            fabric: aiData.fabric,
            colorFamily: aiData.color_family,
            colorDetail: aiData.color_detail,
            styleNode: aiData.style_node,
            moodTags: aiData.mood_tags,
            keywordsKo: aiData.keywords_ko,
            keywordsEn: aiData.keywords_en,
            confidence: aiData.confidence,
            modelId: aiData.model_id,
            version: aiData.version,
          }
        : null,
    },
  }

  return NextResponse.json(response)
}
