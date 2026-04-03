"use client"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search } from "lucide-react"

const NODES = [
  "ALL", "A-1", "A-2", "A-3", "B", "B-2", "C", "D", "E",
  "F", "F-2", "F-3", "G", "H", "I", "K",
] as const

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "의류", label: "의류" },
  { value: "슈즈", label: "슈즈" },
  { value: "주얼리", label: "주얼리" },
  { value: "아이웨어", label: "아이웨어" },
  { value: "제외", label: "제외" },
]

const GENDERS = [
  { value: "", label: "All Genders" },
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
      <div className="flex flex-wrap gap-1.5">
        {NODES.map((n) => (
          <Badge
            key={n}
            variant={node === n ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => onNodeChange(n)}
          >
            {n}
          </Badge>
        ))}
      </div>

      {/* Search + dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8"
          />
        </div>

        <Select value={category} onValueChange={(v) => onCategoryChange(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
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
            <SelectValue placeholder="All Genders" />
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
