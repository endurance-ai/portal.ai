// Centralized product enum definitions — single source of truth
// Used by: prompts (analyze, prompt-search), search engine, batch analyzer

// ─── Categories ──────────────────────────────────────────

export const CATEGORIES = [
  "Outer", "Top", "Bottom", "Shoes", "Bag", "Dress", "Accessories",
] as const
export type Category = (typeof CATEGORIES)[number]

// ─── Subcategories ───────────────────────────────────────

export const SUBCATEGORIES = {
  Outer: [
    "overcoat", "trench-coat", "parka", "bomber", "blazer", "cardigan",
    "vest", "anorak", "leather-jacket", "denim-jacket", "fleece",
    "windbreaker", "cape", "poncho", "shearling", "down-jacket",
    "field-jacket", "chore-jacket", "overshirt", "hoodie",
  ],
  Top: [
    "t-shirt", "shirt", "blouse", "polo", "sweater", "knit-top",
    "tank-top", "crop-top", "henley", "turtleneck", "sweatshirt",
    "rugby-shirt", "camisole",
  ],
  Bottom: [
    "jeans", "trousers", "chinos", "shorts", "skirt", "joggers",
    "cargo-pants", "wide-pants", "leggings", "culottes", "sweatpants",
  ],
  Shoes: [
    "sneakers", "boots", "loafers", "derby", "oxford", "sandals",
    "mules", "heels", "flats", "slides", "chelsea-boots", "combat-boots",
    "running-shoes",
  ],
  Bag: [
    "tote", "crossbody", "backpack", "clutch", "shoulder-bag",
    "belt-bag", "messenger", "bucket-bag", "briefcase",
  ],
  Dress: [
    "mini-dress", "midi-dress", "maxi-dress", "shirt-dress",
    "wrap-dress", "slip-dress", "knit-dress",
  ],
  Accessories: [
    "hat", "cap", "scarf", "belt", "sunglasses", "watch", "necklace",
    "bracelet", "ring", "earrings", "tie", "gloves", "socks",
  ],
} as const satisfies Record<Category, readonly string[]>

export type Subcategory = (typeof SUBCATEGORIES)[Category][number]
export const ALL_SUBCATEGORIES: readonly string[] = (
  Object.values(SUBCATEGORIES) as readonly (readonly string[])[]
).flat()

// ─── Fits ────────────────────────────────────────────────

export const FITS = [
  "oversized", "relaxed", "regular", "slim", "skinny", "boxy", "cropped", "longline",
] as const
export type Fit = (typeof FITS)[number]

// ─── Fabrics ─────────────────────────────────────────────

export const FABRICS = [
  "cotton", "wool", "linen", "silk", "denim", "leather", "suede",
  "nylon", "polyester", "cashmere", "corduroy", "fleece", "tweed",
  "jersey", "knit", "mesh", "satin", "chiffon", "velvet", "canvas",
  "gore-tex", "ripstop",
] as const
export type Fabric = (typeof FABRICS)[number]

// ─── Color Families ──────────────────────────────────────

export const COLOR_FAMILIES = [
  "BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN", "GREEN",
  "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM", "KHAKI", "MULTI",
] as const
export type ColorFamily = (typeof COLOR_FAMILIES)[number]

// ─── Validation ──────────────────────────────────────────

export function isValidCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v)
}

export function isValidSubcategory(v: string, category?: Category): boolean {
  if (category) {
    return (SUBCATEGORIES[category] as readonly string[]).includes(v)
  }
  return ALL_SUBCATEGORIES.includes(v)
}

export function isValidFit(v: string): v is Fit {
  return (FITS as readonly string[]).includes(v)
}

export function isValidFabric(v: string): v is Fabric {
  return (FABRICS as readonly string[]).includes(v)
}

export function isValidColorFamily(v: string): v is ColorFamily {
  return (COLOR_FAMILIES as readonly string[]).includes(v)
}

// ─── Prompt Builder ──────────────────────────────────────

/** AI 프롬프트에 주입할 enum 레퍼런스 텍스트 생성 */
export function buildEnumReference(): string {
  const subcategoryLines = (Object.entries(SUBCATEGORIES) as [Category, readonly string[]][])
    .map(([cat, subs]) => `  ${cat}: ${subs.join(", ")}`)
    .join("\n")

  return `category (pick one):
  ${CATEGORIES.join(", ")}

subcategory by category:
${subcategoryLines}

fit (pick one):
  ${FITS.join(", ")}

fabric (pick one primary):
  ${FABRICS.join(", ")}

color_family (pick one):
  ${COLOR_FAMILIES.join(", ")}`
}
