/**
 * 유사 subcategory 맵 — 정확 매칭 실패 시 폴백 후보
 *
 * key: 요청 subcategory
 * value: 유사한 subcategory 목록 (유사도 순)
 */

export const SIMILAR_SUBCATEGORIES: Record<string, string[]> = {
  // ─── Outer ───
  "overcoat": ["trench-coat", "blazer"],
  "trench-coat": ["overcoat", "blazer"],
  "blazer": ["overshirt", "overcoat"],
  "bomber": ["anorak", "windbreaker", "denim-jacket"],
  "denim-jacket": ["chore-jacket", "field-jacket", "bomber", "overshirt"],
  "leather-jacket": ["bomber", "blazer"],
  "cardigan": ["sweater", "blazer"],
  "vest": ["blazer", "overshirt"],
  "anorak": ["windbreaker", "parka", "bomber"],
  "parka": ["anorak", "down-jacket", "overcoat"],
  "down-jacket": ["parka", "anorak"],
  "field-jacket": ["chore-jacket", "denim-jacket", "overshirt"],
  "chore-jacket": ["field-jacket", "denim-jacket", "overshirt"],
  "overshirt": ["shirt", "chore-jacket", "blazer"],
  "hoodie": ["sweatshirt", "cardigan"],
  "fleece": ["hoodie", "vest"],
  "windbreaker": ["anorak", "bomber"],
  "shearling": ["leather-jacket", "overcoat"],

  // ─── Top ───
  "t-shirt": ["sweatshirt", "tank-top"],
  "shirt": ["blouse", "overshirt"],
  "blouse": ["shirt", "camisole"],
  "sweater": ["knit-top", "cardigan", "sweatshirt"],
  "knit-top": ["sweater", "tank-top"],
  "sweatshirt": ["hoodie", "t-shirt"],
  "tank-top": ["camisole", "crop-top", "t-shirt"],
  "crop-top": ["tank-top", "knit-top"],
  "turtleneck": ["sweater", "knit-top"],
  "polo": ["shirt", "t-shirt"],
  "henley": ["t-shirt", "polo"],
  "camisole": ["tank-top", "blouse"],

  // ─── Bottom ───
  "jeans": ["wide-pants", "trousers"],
  "wide-pants": ["trousers", "jeans", "culottes"],
  "trousers": ["wide-pants", "chinos", "jeans"],
  "chinos": ["trousers", "shorts"],
  "shorts": ["chinos", "cargo-pants"],
  "cargo-pants": ["wide-pants", "trousers", "joggers"],
  "skirt": ["culottes", "shorts"],
  "joggers": ["sweatpants", "cargo-pants"],
  "sweatpants": ["joggers", "wide-pants"],
  "culottes": ["wide-pants", "skirt"],
  "leggings": ["skinny", "joggers"],

  // ─── Shoes ───
  "sneakers": ["running-shoes", "slides"],
  "boots": ["chelsea-boots", "combat-boots", "derby"],
  "chelsea-boots": ["boots", "derby"],
  "combat-boots": ["boots", "chelsea-boots"],
  "loafers": ["derby", "mules", "flats"],
  "derby": ["oxford", "loafers"],
  "oxford": ["derby", "loafers"],
  "sandals": ["slides", "mules"],
  "mules": ["slides", "sandals", "flats"],
  "heels": ["mules", "flats"],
  "flats": ["loafers", "mules"],
  "slides": ["sandals", "mules"],

  // ─── Bag ───
  "shoulder-bag": ["crossbody", "tote"],
  "crossbody": ["shoulder-bag", "belt-bag"],
  "tote": ["shoulder-bag", "bucket-bag"],
  "clutch": ["shoulder-bag", "crossbody"],
  "bucket-bag": ["tote", "shoulder-bag"],
  "backpack": ["tote", "messenger"],
  "belt-bag": ["crossbody", "clutch"],
  "messenger": ["crossbody", "backpack"],
  "briefcase": ["tote", "messenger"],

  // ─── Dress ───
  "mini-dress": ["midi-dress", "shirt-dress"],
  "midi-dress": ["mini-dress", "maxi-dress", "wrap-dress"],
  "maxi-dress": ["midi-dress", "slip-dress"],
  "shirt-dress": ["mini-dress", "midi-dress"],
  "wrap-dress": ["midi-dress", "slip-dress"],
  "slip-dress": ["midi-dress", "maxi-dress"],
  "knit-dress": ["midi-dress", "sweater"],

  // ─── Accessories ───
  "cap": ["hat"],
  "hat": ["cap"],
  "scarf": ["tie"],
  "sunglasses": [],
  "watch": ["bracelet"],
  "necklace": ["bracelet", "earrings"],
  "bracelet": ["necklace", "watch", "ring"],
  "ring": ["bracelet", "earrings"],
  "earrings": ["necklace", "ring"],
  "belt": [],
  "gloves": ["scarf"],
  "tie": ["scarf"],
  "socks": [],
}
