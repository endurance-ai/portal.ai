"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { STYLE_NODE_CONFIG, STYLE_NODE_IDS, NODE_COLOR_CLASSES } from "@/lib/style-nodes"

const CATEGORIES = [
  { value: "", label: "전체 카테고리" },
  { value: "의류", label: "의류" },
  { value: "슈즈", label: "슈즈" },
  { value: "주얼리", label: "주얼리" },
  { value: "아이웨어", label: "아이웨어" },
  { value: "제외", label: "제외" },
]

const GENDERS = [
  { value: "", label: "전체 성별" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "unisex", label: "Unisex" },
]

interface BrandFiltersProps {
  node: string
  category: string
  gender: string
  search: string
  onNodeChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onGenderChange: (v: string) => void
  onSearchChange: (v: string) => void
}

export function BrandFilters({
  node,
  category,
  gender,
  search,
  onNodeChange,
  onCategoryChange,
  onGenderChange,
  onSearchChange,
}: BrandFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Node chips */}
      <div className="flex flex-wrap gap-2">
        {/* ALL chip */}
        <button
          onClick={() => onNodeChange("ALL")}
          className={cn(
            "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors select-none",
            node === "ALL"
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
          )}
        >
          ALL
        </button>

        {/* Per-node chips */}
        {STYLE_NODE_IDS.map((id) => {
          const cfg = STYLE_NODE_CONFIG[id]
          const colors = NODE_COLOR_CLASSES[cfg.color]
          const isSelected = node === id
          // Derive a short label: first word of the label (e.g. "Minimal" from "Minimal Contemporary")
          const shortLabel = cfg.label.split(" ")[0]

          return (
            <button
              key={id}
              onClick={() => onNodeChange(id)}
              title={cfg.description}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors select-none",
                isSelected
                  ? cn(colors.bg, colors.text, colors.border)
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
              )}
            >
              <span className="font-semibold">{id}</span>
              <span
                className={cn(
                  "hidden sm:inline",
                  isSelected ? cn(colors.text, "opacity-70") : "text-muted-foreground/70"
                )}
              >
                {shortLabel}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="브랜드 검색..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        <Select value={category} onValueChange={(v) => onCategoryChange(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="전체 카테고리" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value || "_all"}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={gender} onValueChange={(v) => onGenderChange(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="전체 성별" />
          </SelectTrigger>
          <SelectContent>
            {GENDERS.map((g) => (
              <SelectItem key={g.value} value={g.value || "_all"}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
