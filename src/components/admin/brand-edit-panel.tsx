"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const ATTR_ENUMS: Record<string, { values: string[]; label: string; description: string }> = {
  silhouette: {
    label: "실루엣 Silhouette",
    description: "Shape & structure",
    values: [
      "structured", "sculptural", "draped", "oversized", "voluminous",
      "body-conscious", "tailored", "deconstructed", "reconstructed",
    ],
  },
  palette: {
    label: "색감 Palette",
    description: "Color direction",
    values: ["monochrome", "bold-color"],
  },
  material: {
    label: "소재 Material",
    description: "Fabric & texture",
    values: ["denim", "leather", "sheer", "technical", "knit", "jersey", "padded"],
  },
  detail: {
    label: "디테일 Detail",
    description: "Surface & construction",
    values: ["graphic", "decorative", "layered", "utility", "military"],
  },
  vibe: {
    label: "무드 Vibe",
    description: "Cultural reference",
    values: ["bohemian", "heritage", "gorpcore", "outdoor", "trail", "athletic", "japanese"],
  },
}

interface Brand {
  id: string
  brand_name: string
  brand_name_normalized: string
  primary_style_node_id: number | null
  secondary_style_node_id: number | null
  category_type: string
  price_band: string
  gender_scope: string[]
  sensitivity_tags: string[]
  attributes: Record<string, string[]> | null
  [key: string]: unknown
}

interface BrandEditPanelProps {
  brand: Brand | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (updated: Brand) => void
}

export function BrandEditPanel({ brand, open, onOpenChange, onSaved }: BrandEditPanelProps) {
  const [attrs, setAttrs] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  // Sync state when brand changes
  const syncState = (b: Brand) => {
    setAttrs(b.attributes || {})
  }

  // Use a ref-like pattern to detect brand changes
  const [prevBrandId, setPrevBrandId] = useState<string | null>(null)
  if (brand && brand.id !== prevBrandId) {
    setPrevBrandId(brand.id)
    syncState(brand)
  }

  const toggleAttr = (category: string, value: string) => {
    setAttrs((prev) => {
      const current = prev[category] || []
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [category]: next }
    })
  }

  const handleSave = async () => {
    if (!brand) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributes: attrs }),
      })
      if (res.ok) {
        const { brand: updated } = await res.json()
        onSaved(updated)
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!brand) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{brand.brand_name}</SheetTitle>
          <SheetDescription>{brand.brand_name_normalized}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 px-4">
          {/* Style Node (readonly) — 옛 15 코드 dropdown 은 062 마이그 후 사용 불가.
              어드민 reskin PR 에서 style_nodes 테이블 fetch + A~T 노드 dropdown 으로 복원 예정. */}
          <div className="space-y-1.5">
            <Label>스타일 노드</Label>
            <div className="rounded border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              primary #{brand.primary_style_node_id ?? "—"}
              {brand.secondary_style_node_id != null && (
                <span className="ml-2">/ secondary #{brand.secondary_style_node_id}</span>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                노드 수정은 brand-VLM 재분류 또는 어드민 reskin PR 이후 가능.
              </p>
            </div>
          </div>

          {/* Attributes */}
          {Object.entries(ATTR_ENUMS).map(([category, { label, description, values }]) => (
            <div key={category} className="space-y-1.5">
              <div>
                <Label>{label}</Label>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {values.map((v) => {
                  const active = (attrs[category] || []).includes(v)
                  return (
                    <Badge
                      key={v}
                      variant={active ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer select-none text-xs transition-colors",
                        active && "bg-foreground text-background hover:bg-foreground/90"
                      )}
                      onClick={() => toggleAttr(category, v)}
                    >
                      {v}
                    </Badge>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Read-only info */}
          <div className="space-y-2 text-sm text-muted-foreground border-t pt-4">
            <div className="flex justify-between">
              <span>카테고리</span>
              <span className="text-foreground">{brand.category_type || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>가격대</span>
              <span className="text-foreground tabular-nums">{brand.price_band || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>성별</span>
              <span className="text-foreground">{(brand.gender_scope || []).join(", ") || "—"}</span>
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            저장
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
