"use client"

import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import Image from "next/image"

export interface Product {
  brand: string
  price: string
  platform: string
  imageUrl: string
  link: string
}

interface ProductCardProps {
  product: Product
  index: number
}

export function ProductCard({ product, index }: ProductCardProps) {
  return (
    <motion.a
      href={product.link}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="group/card bg-white/70 backdrop-blur-xl border border-moodfit-outline/10 p-3 rounded-2xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 block"
    >
      <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-3 bg-moodfit-surface-container-low">
        <Image
          src={product.imageUrl}
          alt={`${product.brand} product`}
          fill
          className="object-cover"
        />
      </div>
      <div className="flex justify-between items-start mb-1">
        <span className="text-[10px] font-black uppercase text-moodfit-on-surface-variant">
          {product.brand}
        </span>
        <span className="text-[10px] font-bold text-moodfit-primary">
          {product.price}
        </span>
      </div>
      <span className="text-[11px] font-bold flex items-center gap-1 group-hover/card:text-moodfit-primary transition-colors">
        {product.platform}
        <ArrowUpRight className="size-3" />
      </span>
    </motion.a>
  )
}
