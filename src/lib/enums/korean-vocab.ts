/**
 * 한국어 패션 용어 → enum 매핑 테이블
 *
 * 한국 유저들이 자주 사용하는 패션 용어를 시스템 enum으로 변환.
 * 검색엔진 name fallback + 프롬프트 분석 양쪽에서 사용.
 */

// ─── 한국어 → subcategory 매핑 ─────────────────────────

export type KoreanVocabEntry = {
  subcategory: string
  category: string
  keywords: string[]  // 검색 키워드 (KO + EN)
}

/** 한국어 패션 용어 → enum subcategory + 검색 키워드 */
export const KOREAN_VOCAB: Record<string, KoreanVocabEntry> = {
  // ─── Outer ───
  "블루종": { subcategory: "bomber", category: "Outer", keywords: ["블루종", "blouson", "봄버"] },
  "야상": { subcategory: "field-jacket", category: "Outer", keywords: ["야상", "밀리터리", "field jacket"] },
  "항공점퍼": { subcategory: "bomber", category: "Outer", keywords: ["항공점퍼", "항공자켓", "bomber"] },
  "항공자켓": { subcategory: "bomber", category: "Outer", keywords: ["항공자켓", "항공점퍼", "bomber"] },
  "점퍼": { subcategory: "bomber", category: "Outer", keywords: ["점퍼", "자켓", "jumper"] },
  "패딩": { subcategory: "down-jacket", category: "Outer", keywords: ["패딩", "다운", "puffer", "padding"] },
  "롱패딩": { subcategory: "down-jacket", category: "Outer", keywords: ["롱패딩", "다운코트", "long puffer"] },
  "숏패딩": { subcategory: "down-jacket", category: "Outer", keywords: ["숏패딩", "경량패딩", "short puffer"] },
  "무스탕": { subcategory: "shearling", category: "Outer", keywords: ["무스탕", "양털", "shearling"] },
  "바람막이": { subcategory: "windbreaker", category: "Outer", keywords: ["바람막이", "윈드브레이커", "windbreaker"] },
  "사파리": { subcategory: "field-jacket", category: "Outer", keywords: ["사파리", "사파리자켓", "safari"] },
  "가디건": { subcategory: "cardigan", category: "Outer", keywords: ["가디건", "cardigan"] },
  "후리스": { subcategory: "fleece", category: "Outer", keywords: ["후리스", "플리스", "fleece"] },
  "기모": { subcategory: "fleece", category: "Outer", keywords: ["기모", "플리스", "fleece"] },
  "코트": { subcategory: "overcoat", category: "Outer", keywords: ["코트", "coat"] },
  "트렌치": { subcategory: "trench-coat", category: "Outer", keywords: ["트렌치", "트렌치코트", "trench"] },
  "자켓": { subcategory: "blazer", category: "Outer", keywords: ["자켓", "재킷", "jacket"] },

  // ─── Top ───
  "맨투맨": { subcategory: "sweatshirt", category: "Top", keywords: ["맨투맨", "스웻셔츠", "sweatshirt", "mtm"] },
  "목폴라": { subcategory: "turtleneck", category: "Top", keywords: ["목폴라", "터틀넥", "폴라", "turtleneck"] },
  "폴라": { subcategory: "turtleneck", category: "Top", keywords: ["폴라", "터틀넥", "목폴라", "turtleneck"] },
  "반목": { subcategory: "turtleneck", category: "Top", keywords: ["반목", "반폴라", "mock neck"] },
  "반팔": { subcategory: "t-shirt", category: "Top", keywords: ["반팔", "반팔티", "t-shirt", "tee"] },
  "긴팔": { subcategory: "t-shirt", category: "Top", keywords: ["긴팔", "긴팔티", "long sleeve"] },
  "나시": { subcategory: "tank-top", category: "Top", keywords: ["나시", "민소매", "나시티", "sleeveless"] },
  "민소매": { subcategory: "tank-top", category: "Top", keywords: ["민소매", "나시", "sleeveless"] },
  "니트": { subcategory: "sweater", category: "Top", keywords: ["니트", "knit", "sweater"] },
  "후드티": { subcategory: "hoodie", category: "Outer", keywords: ["후드티", "후디", "hoodie"] },
  "후드": { subcategory: "hoodie", category: "Outer", keywords: ["후드", "후디", "후드티", "hoodie"] },
  "러그비": { subcategory: "rugby-shirt", category: "Top", keywords: ["러그비", "럭비", "rugby"] },
  "카라티": { subcategory: "polo", category: "Top", keywords: ["카라티", "폴로", "collar", "polo"] },
  "헨리넥": { subcategory: "henley", category: "Top", keywords: ["헨리넥", "henley"] },
  "블라우스": { subcategory: "blouse", category: "Top", keywords: ["블라우스", "blouse"] },

  // ─── Bottom ───
  "청바지": { subcategory: "jeans", category: "Bottom", keywords: ["청바지", "진", "데님팬츠", "jeans"] },
  "슬랙스": { subcategory: "trousers", category: "Bottom", keywords: ["슬랙스", "슬렉스", "trousers", "slacks"] },
  "면바지": { subcategory: "chinos", category: "Bottom", keywords: ["면바지", "치노", "chinos"] },
  "반바지": { subcategory: "shorts", category: "Bottom", keywords: ["반바지", "쇼츠", "shorts"] },
  "카고": { subcategory: "cargo-pants", category: "Bottom", keywords: ["카고", "카고팬츠", "cargo"] },
  "와이드": { subcategory: "wide-pants", category: "Bottom", keywords: ["와이드", "와이드팬츠", "wide"] },
  "조거": { subcategory: "joggers", category: "Bottom", keywords: ["조거", "조거팬츠", "jogger"] },
  "츄리닝": { subcategory: "sweatpants", category: "Bottom", keywords: ["츄리닝", "트레이닝", "sweatpants"] },
  "레깅스": { subcategory: "leggings", category: "Bottom", keywords: ["레깅스", "leggings"] },

  // ─── Shoes ───
  "운동화": { subcategory: "sneakers", category: "Shoes", keywords: ["운동화", "스니커즈", "sneakers"] },
  "구두": { subcategory: "derby", category: "Shoes", keywords: ["구두", "드레스슈즈", "derby", "dress shoes"] },
  "로퍼": { subcategory: "loafers", category: "Shoes", keywords: ["로퍼", "loafer"] },
  "부츠": { subcategory: "boots", category: "Shoes", keywords: ["부츠", "boots"] },
  "워커": { subcategory: "combat-boots", category: "Shoes", keywords: ["워커", "워커부츠", "combat boots"] },
  "첼시": { subcategory: "chelsea-boots", category: "Shoes", keywords: ["첼시", "첼시부츠", "chelsea"] },
  "슬리퍼": { subcategory: "slides", category: "Shoes", keywords: ["슬리퍼", "슬라이드", "slides"] },
  "쪼리": { subcategory: "slides", category: "Shoes", keywords: ["쪼리", "플립플롭", "flip flop", "slides"] },
  "샌들": { subcategory: "sandals", category: "Shoes", keywords: ["샌들", "샌달", "sandals"] },
  "뮬": { subcategory: "mules", category: "Shoes", keywords: ["뮬", "mules"] },
  "러닝화": { subcategory: "running-shoes", category: "Shoes", keywords: ["러닝화", "런닝화", "running shoes"] },

  // ─── Bag ───
  "에코백": { subcategory: "tote", category: "Bag", keywords: ["에코백", "토트", "tote"] },
  "숄더백": { subcategory: "shoulder-bag", category: "Bag", keywords: ["숄더백", "shoulder bag"] },
  "크로스백": { subcategory: "crossbody", category: "Bag", keywords: ["크로스백", "크로스바디", "crossbody"] },
  "백팩": { subcategory: "backpack", category: "Bag", keywords: ["백팩", "배낭", "backpack"] },
  "힙색": { subcategory: "belt-bag", category: "Bag", keywords: ["힙색", "벨트백", "웨이스트백", "belt bag"] },
  "클러치": { subcategory: "clutch", category: "Bag", keywords: ["클러치", "clutch"] },

  // ─── Dress ───
  "원피스": { subcategory: "midi-dress", category: "Dress", keywords: ["원피스", "드레스", "dress"] },

  // ─── Accessories ───
  "모자": { subcategory: "cap", category: "Accessories", keywords: ["모자", "캡", "cap"] },
  "볼캡": { subcategory: "cap", category: "Accessories", keywords: ["볼캡", "야구모자", "cap"] },
  "버킷햇": { subcategory: "hat", category: "Accessories", keywords: ["버킷햇", "벙거지", "bucket hat"] },
  "벙거지": { subcategory: "hat", category: "Accessories", keywords: ["벙거지", "버킷햇", "bucket hat"] },
  "비니": { subcategory: "hat", category: "Accessories", keywords: ["비니", "beanie"] },
  "머플러": { subcategory: "scarf", category: "Accessories", keywords: ["머플러", "목도리", "muffler", "scarf"] },
  "목도리": { subcategory: "scarf", category: "Accessories", keywords: ["목도리", "머플러", "scarf"] },
  "넥타이": { subcategory: "tie", category: "Accessories", keywords: ["넥타이", "타이", "tie"] },
  "장갑": { subcategory: "gloves", category: "Accessories", keywords: ["장갑", "gloves"] },
  "양말": { subcategory: "socks", category: "Accessories", keywords: ["양말", "삭스", "socks"] },
}

/**
 * 한국어 입력 텍스트에서 매칭되는 vocab 엔트리 찾기
 * 가장 긴 매칭을 우선 반환 (e.g., "항공점퍼" > "점퍼")
 */
export function findKoreanVocabMatch(text: string): KoreanVocabEntry | null {
  const normalized = text.trim().toLowerCase()

  // 긴 키부터 매칭 (e.g., "롱패딩" before "패딩")
  const sortedKeys = Object.keys(KOREAN_VOCAB).sort((a, b) => b.length - a.length)

  for (const key of sortedKeys) {
    if (normalized.includes(key)) {
      return KOREAN_VOCAB[key]
    }
  }
  return null
}

/**
 * subcategory용 한국어 키워드 맵 빌드
 * 검색엔진의 SUBCATEGORY_NAME_KEYWORDS에 머지하기 위함
 */
export function buildKoreanKeywordsMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const entry of Object.values(KOREAN_VOCAB)) {
    if (!map[entry.subcategory]) {
      map[entry.subcategory] = []
    }
    for (const kw of entry.keywords) {
      if (!map[entry.subcategory].includes(kw)) {
        map[entry.subcategory].push(kw)
      }
    }
  }
  return map
}

/**
 * 프롬프트에 주입할 한국어 어휘 레퍼런스 텍스트
 */
export function buildKoreanVocabReference(): string {
  const lines: string[] = []
  const byCategory: Record<string, string[]> = {}

  for (const [koreanTerm, entry] of Object.entries(KOREAN_VOCAB)) {
    const cat = entry.category
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(`"${koreanTerm}" → ${entry.subcategory}`)
  }

  for (const [cat, mappings] of Object.entries(byCategory)) {
    lines.push(`  ${cat}: ${mappings.join(", ")}`)
  }

  return lines.join("\n")
}
