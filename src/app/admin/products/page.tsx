"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

const ProductsPageInner = dynamic(() => import("@/components/admin/products-page"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-20">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

export default function ProductsPage() {
  return <ProductsPageInner />
}
