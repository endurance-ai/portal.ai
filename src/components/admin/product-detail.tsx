"use client"

import {useState} from "react"
import Image from "next/image"
import Link from "next/link"
import {ArrowUpRight, ChevronLeft} from "lucide-react"
import {cn} from "@/lib/utils"

type Review = {
  id: string
  text: string | null
  author: string | null
  review_date: string | null
  photo_urls: string[] | null
  body_info: {
    height?: string
    weight?: string
    usualSize?: string
    purchasedSize?: string
    bodyType?: string
  } | null
  created_at: string
}

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
    review_count: number | null
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
  reviews: Review[]
}

type Tab = "info" | "description" | "reviews"

export function ProductDetail({ product, ai, reviews }: ProductDetailProps) {
  const [tab, setTab] = useState<Tab>("info")

  const formatPrice = (price: number | null) =>
    price != null ? `₩${price.toLocaleString("ko-KR")}` : "—"

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "info", label: "기본 정보" },
    { key: "description", label: "상세 설명" },
    { key: "reviews", label: "리뷰", count: reviews.length },
  ]

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
            <div className="bg-turquoise/5 border border-turquoise/20 rounded-lg p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-turquoise text-sm">AI ANALYSIS</span>
                <span className="text-xs bg-turquoise/15 text-turquoise px-2 py-0.5 rounded">
                  {ai.version}
                </span>
                {ai.confidence != null && (
                  <span className="text-xs bg-turquoise/15 text-turquoise px-2 py-0.5 rounded">
                    confidence: {ai.confidence.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Fields grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">category</span>
                  <br />
                  <span className="text-turquoise">{ai.category}</span>
                </div>
                {ai.subcategory && (
                  <div>
                    <span className="text-muted-foreground text-xs">subcategory</span>
                    <br />
                    <span className="text-turquoise">{ai.subcategory}</span>
                  </div>
                )}
                {ai.fit && (
                  <div>
                    <span className="text-muted-foreground text-xs">fit</span>
                    <br />
                    <span className="text-turquoise">{ai.fit}</span>
                  </div>
                )}
                {ai.fabric && (
                  <div>
                    <span className="text-muted-foreground text-xs">fabric</span>
                    <br />
                    <span className="text-turquoise">{ai.fabric}</span>
                  </div>
                )}
                {ai.color_family && (
                  <div>
                    <span className="text-muted-foreground text-xs">color</span>
                    <br />
                    <span className="text-turquoise uppercase">{ai.color_family}</span>
                  </div>
                )}
                {ai.style_node && (
                  <div>
                    <span className="text-muted-foreground text-xs">node</span>
                    <br />
                    <span className="text-turquoise">{ai.style_node}</span>
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
                        className="bg-turquoise/10 text-turquoise text-xs px-2 py-0.5 rounded"
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
                  <p className="text-turquoise text-sm">{ai.keywords_ko.join(", ")}</p>
                </div>
              )}
              {ai.keywords_en && ai.keywords_en.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">keywords_en</span>
                  <p className="text-turquoise text-sm">{ai.keywords_en.join(", ")}</p>
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

          {/* Tabs */}
          <div className="border-b border-border flex" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                aria-controls={`tabpanel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  tab === t.key
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="ml-1.5 text-xs bg-muted/30 px-1.5 py-0.5 rounded">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "info" && (
            <div id="tabpanel-info" role="tabpanel" className="bg-muted/10 border border-border rounded-lg p-4 space-y-2">
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
            </div>
          )}

          {tab === "description" && (
            <div id="tabpanel-description" role="tabpanel" className="bg-muted/10 border border-border rounded-lg p-4 space-y-3">
              {product.description ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {product.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">상세 설명 없음</p>
              )}
            </div>
          )}

          {tab === "reviews" && (
            <div id="tabpanel-reviews" role="tabpanel" className="space-y-3">
              {reviews.length > 0 ? (
                reviews.map((review) => (
                  <div
                    key={review.id}
                    className="bg-muted/10 border border-border rounded-lg p-4 space-y-2"
                  >
                    {/* Header: author + date */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {review.author || "익명"}
                      </span>
                      {review.review_date && (
                        <span className="text-xs text-muted-foreground">
                          {review.review_date}
                        </span>
                      )}
                    </div>

                    {/* Body */}
                    {review.text && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {review.text}
                      </p>
                    )}

                    {/* Body info */}
                    {review.body_info && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {review.body_info.height && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-border text-muted-foreground">
                            {review.body_info.height}
                          </span>
                        )}
                        {review.body_info.weight && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-border text-muted-foreground">
                            {review.body_info.weight}
                          </span>
                        )}
                        {review.body_info.usualSize && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-border text-muted-foreground">
                            평소 {review.body_info.usualSize}
                          </span>
                        )}
                        {review.body_info.purchasedSize && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-border text-muted-foreground">
                            구매 {review.body_info.purchasedSize}
                          </span>
                        )}
                        {review.body_info.bodyType && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-border text-muted-foreground">
                            {review.body_info.bodyType}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Photos */}
                    {review.photo_urls && review.photo_urls.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        {review.photo_urls.map((url, i) => (
                          <div
                            key={i}
                            className="size-16 relative rounded border border-border overflow-hidden"
                          >
                            <Image
                              src={url}
                              alt={`리뷰 사진 ${i + 1}`}
                              fill
                              sizes="64px"
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="bg-muted/10 border border-border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground italic">리뷰 없음</p>
                </div>
              )}
            </div>
          )}

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
