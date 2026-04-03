export const STYLE_NODE_CONFIG: Record<
  string,
  { label: string; description: string; color: string }
> = {
  "A-1": { label: "Trail Outdoor",         description: "트레일/아웃도어 퍼포먼스",  color: "emerald" },
  "A-2": { label: "Luxury Street",          description: "럭셔리 × 스트릿",           color: "amber"   },
  "A-3": { label: "Heritage Vintage",       description: "헤리티지/빈티지 캐주얼",    color: "orange"  },
  "B":   { label: "Alt Deep Street",        description: "다크/언더그라운드/펑크",     color: "red"     },
  "B-2": { label: "Alt Casual",             description: "캐주얼 기반 전위",           color: "rose"    },
  "C":   { label: "Minimal Contemporary",  description: "정제된 미니멀",             color: "sky"     },
  "D":   { label: "Contemporary Casual",   description: "감도 높은 캐주얼",          color: "blue"    },
  "E":   { label: "Technical Decon",        description: "해체/재조립/기술 소재",     color: "violet"  },
  "F":   { label: "Minimal Feminine",       description: "절제된 우아함",             color: "pink"    },
  "F-2": { label: "Romantic Feminine",      description: "러블리/볼륨/장식",          color: "fuchsia" },
  "F-3": { label: "Sensual Feminine",       description: "관능적 하이엔드",           color: "purple"  },
  "G":   { label: "Tech Gorpcore",          description: "도시형 기능성 테크",        color: "teal"    },
  "H":   { label: "Street Casual",          description: "직관적 스트릿",             color: "yellow"  },
  "I":   { label: "JP Workwear",            description: "일본 감성 워크웨어",        color: "stone"   },
  "K":   { label: "Young Casual",           description: "트렌디 영캐주얼",           color: "lime"    },
}

export const STYLE_NODE_IDS = Object.keys(STYLE_NODE_CONFIG)

// Tailwind 4 requires fully static class strings — no dynamic interpolation.
// This map provides the resolved class sets for each color token used above.
export const NODE_COLOR_CLASSES: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  emerald: {
    bg:     "bg-emerald-500/10",
    text:   "text-emerald-400",
    border: "border-emerald-500/20",
    dot:    "bg-emerald-400",
  },
  amber: {
    bg:     "bg-amber-500/10",
    text:   "text-amber-400",
    border: "border-amber-500/20",
    dot:    "bg-amber-400",
  },
  orange: {
    bg:     "bg-orange-500/10",
    text:   "text-orange-400",
    border: "border-orange-500/20",
    dot:    "bg-orange-400",
  },
  red: {
    bg:     "bg-red-500/10",
    text:   "text-red-400",
    border: "border-red-500/20",
    dot:    "bg-red-400",
  },
  rose: {
    bg:     "bg-rose-500/10",
    text:   "text-rose-400",
    border: "border-rose-500/20",
    dot:    "bg-rose-400",
  },
  sky: {
    bg:     "bg-sky-500/10",
    text:   "text-sky-400",
    border: "border-sky-500/20",
    dot:    "bg-sky-400",
  },
  blue: {
    bg:     "bg-blue-500/10",
    text:   "text-blue-400",
    border: "border-blue-500/20",
    dot:    "bg-blue-400",
  },
  violet: {
    bg:     "bg-violet-500/10",
    text:   "text-violet-400",
    border: "border-violet-500/20",
    dot:    "bg-violet-400",
  },
  pink: {
    bg:     "bg-pink-500/10",
    text:   "text-pink-400",
    border: "border-pink-500/20",
    dot:    "bg-pink-400",
  },
  fuchsia: {
    bg:     "bg-fuchsia-500/10",
    text:   "text-fuchsia-400",
    border: "border-fuchsia-500/20",
    dot:    "bg-fuchsia-400",
  },
  purple: {
    bg:     "bg-purple-500/10",
    text:   "text-purple-400",
    border: "border-purple-500/20",
    dot:    "bg-purple-400",
  },
  teal: {
    bg:     "bg-teal-500/10",
    text:   "text-teal-400",
    border: "border-teal-500/20",
    dot:    "bg-teal-400",
  },
  yellow: {
    bg:     "bg-yellow-500/10",
    text:   "text-yellow-400",
    border: "border-yellow-500/20",
    dot:    "bg-yellow-400",
  },
  stone: {
    bg:     "bg-stone-500/10",
    text:   "text-stone-400",
    border: "border-stone-500/20",
    dot:    "bg-stone-400",
  },
  lime: {
    bg:     "bg-lime-500/10",
    text:   "text-lime-400",
    border: "border-lime-500/20",
    dot:    "bg-lime-400",
  },
}
