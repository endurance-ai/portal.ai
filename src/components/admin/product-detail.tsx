"use client"

import Image from "next/image"
import Link from "next/link"
import {ArrowUpRight, ChevronLeft} from "lucide-react"

type ProductDetailProps = {
  product: {
    id: string
    brand: string
    name: string
    price: number | null
    original_price: number | null
    sale_price: number | null
    image_url: string | null
    images: string[] | null
    product_url: string
    platform: string
    category: string | null
    subcategory: string | null
    gender: string[] | null
    in_stock: boolean
    color: string | null
    material: string | null
    description: string | null
    tags: string[] | null
    size_info: string | null
    created_at: string
  }
  ai: {
    category: string
    subcategory: string | null
    fit: string | null
    fabric: string | null
    color_family: string | null
    color_detail: string | null
    style_node: string | null
    mood_tags: string[] | null
    keywords_ko: string[] | null
    keywords_en: string[] | null
    confidence: number | null
    model_id: string | null
    version: string
  } | null
}

export function ProductDetail({ product, ai }: ProductDetailProps) {
  const formatPrice = (price: number | null) =>
    price != null ? `₩${price.toLocaleString("ko-KR")}` : "—"

  return (
    <div className="p-6 space-y-4">
      {/* Back link */}
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-4" />
        상품 목록
      </Link>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Image */}
        <div className="flex-1 lg:sticky lg:top-4 lg:self-start">
          <div className="aspect-[3/4] relative rounded-lg overflow-hidden border border-border bg-muted/20">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                이미지 없음
              </div>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex-1 space-y-4">
          {/* Platform */}
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {product.platform}
          </p>

          {/* Brand & Name */}
          <div>
            <h1 className="text-2xl font-bold">{product.brand}</h1>
            <p className="text-lg text-muted-foreground">{product.name}</p>
          </div>

          {/* Price */}
          <div className="text-xl font-bold">
            {product.sale_price ? (
              <span className="space-x-2">
                <del className="text-muted-foreground text-sm font-normal">
                  {formatPrice(product.original_price ?? product.price)}
                </del>
                <span>{formatPrice(product.sale_price)}</span>
              </span>
            ) : (
              <span>{formatPrice(product.price)}</span>
            )}
          </div>

          {/* AI Analysis */}
          {ai ? (
            <div className="bg-green-950/30 border border-green-800/30 rounded-lg p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-green-500 text-sm">AI ANALYSIS</span>
                <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded">
                  {ai.version}
                </span>
                {ai.confidence != null && (
                  <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded">
                    confidence: {ai.confidence.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">category</span>
                  <br />
                  <span className="text-green-400">{ai.category}</span>
                </div>
                {ai.subcategory && (
                  <div>
                    <span className="text-muted-foreground text-xs">subcategory</span>
                    <br />
                    <span className="text-green-400">{ai.subcategory}</span>
                  </div>
                )}
                {ai.fit && (
                  <div>
                    <span className="text-muted-foreground text-xs">fit</span>
                    <br />
                    <span className="text-green-400">{ai.fit}</span>
                  </div>
                )}
                {ai.fabric && (
                  <div>
                    <span className="text-muted-foreground text-xs">fabric</span>
                    <br />
                    <span className="text-green-400">{ai.fabric}</span>
                  </div>
                )}
                {ai.color_family && (
                  <div>
                    <span className="text-muted-foreground text-xs">color</span>
                    <br />
                    <span className="text-green-400 uppercase">{ai.color_family}</span>
                  </div>
                )}
                {ai.style_node && (
                  <div>
                    <span className="text-muted-foreground text-xs">node</span>
                    <br />
                    <span className="text-green-400">{ai.style_node}</span>
                  </div>
                )}
              </div>

              {/* Mood tags */}
              {ai.mood_tags && ai.mood_tags.length > 0 && (
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">mood</span>
                  <div className="flex flex-wrap gap-1">
                    {ai.mood_tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-green-900/30 text-green-400 text-xs px-2 py-0.5 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {ai.keywords_ko && ai.keywords_ko.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">keywords_ko</span>
                  <p className="text-green-400 text-sm">{ai.keywords_ko.join(", ")}</p>
                </div>
              )}
              {ai.keywords_en && ai.keywords_en.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">keywords_en</span>
                  <p className="text-green-400 text-sm">{ai.keywords_en.join(", ")}</p>
                </div>
              )}

              {/* Model */}
              {ai.model_id && (
                <p className="text-xs text-muted-foreground">{ai.model_id}</p>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-orange-400/30 bg-orange-950/10 rounded-lg p-4">
              <p className="text-orange-400 text-sm">AI 분석 데이터 없음</p>
            </div>
          )}

          {/* 상품 정보 */}
          <div className="bg-muted/10 border border-border rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-muted-foreground mb-2">상품 정보</p>

            {product.gender && product.gender.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">gender</span>
                <span>{product.gender.join(", ")}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">in_stock</span>
              <span>{product.in_stock ? "true" : "false"}</span>
            </div>
            {product.category && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">category</span>
                <span>{product.category}</span>
              </div>
            )}
            {product.subcategory && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">subcategory</span>
                <span>{product.subcategory}</span>
              </div>
            )}
            {product.color && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">color</span>
                <span>{product.color}</span>
              </div>
            )}
            {product.material && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">material</span>
                <span>{product.material}</span>
              </div>
            )}
            {product.tags && product.tags.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">tags</span>
                <span className="text-right max-w-[60%]">{product.tags.join(", ")}</span>
              </div>
            )}
            {product.size_info && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">size_info</span>
                <span>{product.size_info}</span>
              </div>
            )}
            {product.description && (
              <div className="pt-2 space-y-1">
                <span className="text-muted-foreground text-xs">description</span>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {product.description}
                </p>
              </div>
            )}
          </div>

          {/* External link */}
          <a
            href={product.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-10 border border-border rounded-md text-sm hover:bg-muted/20 transition-colors"
          >
            원본 상품 페이지
            <ArrowUpRight className="size-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
