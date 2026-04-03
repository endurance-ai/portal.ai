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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

const STYLE_NODE_OPTIONS = [
  "A-1", "A-2", "A-3", "B", "B-2", "C", "D", "E",
  "F", "F-2", "F-3", "G", "H", "I", "K",
]

const ATTR_ENUMS: Record<string, string[]> = {
  silhouette: [
    "structured", "sculptural", "draped", "oversized", "voluminous",
    "body-conscious", "tailored", "deconstructed", "reconstructed",
  ],
  palette: ["monochrome", "bold-color"],
  material: ["denim", "leather", "sheer", "technical", "knit", "jersey", "padded"],
  detail: ["graphic", "decorative", "layered", "utility", "military"],
  vibe: ["bohemian", "heritage", "gorpcore", "outdoor", "trail", "athletic", "japanese"],
}

interface Brand {
  id: string
  brand_name: string
  brand_name_normalized: string
  style_node: string
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
  const [styleNode, setStyleNode] = useState("")
  const [attrs, setAttrs] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  // Sync state when brand changes
  const syncState = (b: Brand) => {
    setStyleNode(b.style_node || "")
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
        body: JSON.stringify({ style_node: styleNode, attributes: attrs }),
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

        <div className="flex-1 space-y-5 px-4">
          {/* Style Node */}
          <div className="space-y-1.5">
            <Label>Style Node</Label>
            <Select value={styleNode} onValueChange={(v) => setStyleNode(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_NODE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Attributes */}
          {Object.entries(ATTR_ENUMS).map(([category, values]) => (
            <div key={category} className="space-y-1.5">
              <Label className="capitalize">{category}</Label>
              <div className="flex flex-wrap gap-1.5">
                {values.map((v) => {
                  const active = (attrs[category] || []).includes(v)
                  return (
                    <Badge
                      key={v}
                      variant={active ? "default" : "outline"}
                      className="cursor-pointer select-none"
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
              <span>Category</span>
              <span className="text-foreground">{brand.category_type || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>Price Band</span>
              <span className="text-foreground">{brand.price_band || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>Gender</span>
              <span className="text-foreground">{(brand.gender_scope || []).join(", ") || "—"}</span>
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
