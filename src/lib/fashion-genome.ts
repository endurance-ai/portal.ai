/**
 * Fashion Genome — Style Node & Sensitivity Tag 정의
 *
 * 동료가 관리하는 Fashion_genome_root.xlsx (Style_DB, Node_Criteria)를
 * 코드에서 사용할 수 있도록 정규화한 것.
 *
 * 노드 추가/수정 시 이 파일만 변경하면 AI 프롬프트에 자동 반영됨.
 */

// ─── Style Nodes ────────────────────────────────────────────

export const STYLE_NODES = {
  "A-1": {
    name: "트레일_아웃도어스트릿",
    enName: "Trail Outdoor Street",
    mood: "실제 트레일/아웃도어 퍼포먼스",
    include:
      "러닝·등산·하이킹 장비 문맥, 퍼포먼스 기능이 브랜드 본질",
    exclude: "도시형 기능성 스타일링만 강하면 G",
    adjacent: ["G", "C"],
    enKeywords: [
      "trail running", "hiking", "outdoor performance", "gorpcore authentic",
      "technical outerwear", "mountain gear",
    ],
  },
  "A-2": {
    name: "하이엔드_럭셔리스트릿",
    enName: "High-End Luxury Street",
    mood: "럭셔리와 스트릿의 강한 결합",
    include:
      "스트릿 태도·볼륨·그래픽이 핵심이면서 하이패션 감도가 강함",
    exclude: "단순 럭셔리/고가라는 이유만으로 배정 금지",
    adjacent: ["B", "H"],
    enKeywords: [
      "luxury streetwear", "high fashion street", "bold graphics",
      "oversized luxury", "designer street",
    ],
  },
  "A-3": {
    name: "헤리티지_빈티지캐주얼",
    enName: "Heritage Vintage Casual",
    mood: "헤리티지/빈티지/워크웨어 기반 캐주얼",
    include:
      "아카이브, 빈티지, 워크웨어, 조용한 남성복 감도",
    exclude: "현대적 데일리 착장성이 더 강하면 D",
    adjacent: ["D", "I"],
    enKeywords: [
      "heritage", "vintage", "workwear", "americana", "military casual",
      "retro", "archive",
    ],
  },
  "B": {
    name: "얼터너티브_딥스트릿",
    enName: "Alternative Deep Street",
    mood: "다크, 언더그라운드, 고딕, 펑크, 거리감 있는 디자이너 무드",
    include:
      "무드/태도/서브컬처 정체성이 핵심일 때. 캐주얼보다 대안적 존재감이 먼저 읽힐 때.",
    exclude:
      "캐주얼·워드로브 기반 전위성이 더 크면 B-2. 구조 해체/기술 실험이 브랜드 본질일 때만 E.",
    adjacent: ["B-2", "E"],
    enKeywords: [
      "dark", "gothic", "punk", "underground", "avant-garde street",
      "subculture", "anti-classic",
    ],
  },
  "B-2": {
    name: "얼터너티브_캐주얼",
    enName: "Alternative Casual",
    mood: "캐주얼 기반 전위, 하이브리드 워드로브, 유스/디자이너 캐주얼",
    include:
      "스트리트/일상복/테일러링/워크웨어 기반에 전복적 디테일, 과장, 하이브리드, 아이러니가 얹힐 때.",
    exclude:
      "순수 다크 무드가 핵심이면 B. 구조 해체·재조립·기술 실험이 본질이면 E.",
    adjacent: ["B", "E", "D"],
    enKeywords: [
      "deconstructed casual", "hybrid wardrobe", "youth avant-garde",
      "ironic streetwear", "experimental casual",
    ],
  },
  "C": {
    name: "미니멀_컨템퍼러리",
    enName: "Minimal Contemporary",
    mood: "정제된 하이엔드 미니멀, 조형 실험",
    include:
      "정제된 비례, 절제된 실루엣, 구조감, 소재 실험, 통제된 조형성이 핵심",
    exclude:
      "캐주얼 기반 전위성이 핵심이면 B-2, 현실 착장성이 우세하면 D, 공격적 해체면 E",
    adjacent: ["D", "B-2", "E", "F-3"],
    enKeywords: [
      "minimal", "contemporary", "refined", "clean lines", "quiet luxury",
      "structured", "architectural", "tonal",
    ],
  },
  "D": {
    name: "컨템퍼러리_캐주얼",
    enName: "Contemporary Casual",
    mood: "감도 높은 현실 착장 캐주얼",
    include:
      "동시대적이지만 일상적으로 소화되는 정제 캐주얼, 라이프스타일 캐주얼",
    exclude:
      "정제된 조형 실험이 우위면 C, 캐주얼 기반 전위면 B-2, 스트릿이면 H",
    adjacent: ["C", "B-2", "H", "A-3"],
    enKeywords: [
      "contemporary casual", "elevated basics", "daily refined",
      "lifestyle casual", "well-made everyday",
    ],
  },
  "E": {
    name: "하이엔드_테크니컬&해체주의",
    enName: "High-End Technical & Deconstructivism",
    mood: "해체, 재조립, 구조 조작, 기술 소재, 산업적 긴장감",
    include:
      "해체성이 본질이고, 구조 실험·패턴 조작·소재 실험이 스타일 핵심일 때.",
    exclude:
      "캐주얼 기반 전위성이면 B-2. 산업적/기능적 인상만으로는 E로 보내지 않는다.",
    adjacent: ["B", "B-2"],
    enKeywords: [
      "deconstructed", "technical fabric", "industrial", "pattern manipulation",
      "structural experiment", "reconstructed",
    ],
  },
  "F": {
    name: "미니멀_페미닌",
    enName: "Minimal Feminine",
    mood: "절제된 우아함, 정제된 여성성",
    include: "담백한 실루엣, 부드러운 우아함, 절제된 스타일링",
    exclude: "로맨틱/러블리/장식성이 강하면 F-2",
    adjacent: ["F-2", "F-3", "D"],
    enKeywords: [
      "minimal feminine", "understated elegance", "soft silhouette",
      "quiet femininity", "restrained",
    ],
  },
  "F-2": {
    name: "로맨틱_페미닌",
    enName: "Romantic Feminine",
    mood: "러블리, 볼륨, 장식, 동화적 무드",
    include:
      "러플, 볼륨, 장식성, 개성 있는 로맨틱 스타일링",
    exclude: "관능적 드레시함이 더 강하면 F-3",
    adjacent: ["F", "F-3"],
    enKeywords: [
      "romantic", "ruffles", "volume", "whimsical", "decorative",
      "fairytale", "lovely",
    ],
  },
  "F-3": {
    name: "럭셔리_센슈얼페미닌",
    enName: "Luxury Sensual Feminine",
    mood: "관능적, 구조적, 드레시한 하이엔드 여성성",
    include:
      "바디 컨셔스, 드레시 럭셔리, 구조적 페미닌, 조각적 존재감",
    exclude:
      "단순 로맨틱함은 F-2, 절제된 우아함은 F, 미니멀 조형 실험은 C",
    adjacent: ["F", "F-2", "C"],
    enKeywords: [
      "sensual", "body-conscious", "dressy luxury", "sculptural feminine",
      "structured glamour",
    ],
  },
  "G": {
    name: "테크니컬_고프코어",
    enName: "Technical Gorpcore",
    mood: "도시형 기능성, 테크 스타일링",
    include:
      "고프코어, 기능성 소재, 액티브웨어, 도시형 테크웨어 문법",
    exclude: "실제 트레일 퍼포먼스면 A-1, 정제된 미니멀 구조면 C",
    adjacent: ["A-1", "C", "E"],
    enKeywords: [
      "gorpcore", "techwear", "urban functional", "technical fabric",
      "activewear styling",
    ],
  },
  "H": {
    name: "스트릿_캐주얼",
    enName: "Street Casual",
    mood: "직관적 스트릿, 대중적 캐주얼",
    include:
      "그래픽, 스케이트/스트릿 문화, 젊은 태도, 서브컬처 기반 캐주얼",
    exclude:
      "다크/언더그라운드면 B, 라이프스타일 캐주얼이면 D, 영캐주얼이면 K",
    adjacent: ["B", "D", "K", "A-2"],
    enKeywords: [
      "streetwear", "skate", "graphic heavy", "youth culture",
      "casual street", "logo",
    ],
  },
  "I": {
    name: "재패니즈_워크웨어&유틸리티",
    enName: "Japanese Workwear & Utility",
    mood: "일본 감성 정제 워크웨어",
    include:
      "차분한 레이어드, 유틸리티, 정제된 캐주얼",
    exclude: "국가가 아니라 스타일 문법이 기준",
    adjacent: ["A-3", "G", "D"],
    enKeywords: [
      "japanese workwear", "utility", "layered functional",
      "refined casual", "wabi-sabi", "indigo craft",
    ],
  },
  "K": {
    name: "영_캐주얼",
    enName: "Young Casual",
    mood: "트렌디한 소비 감도의 영캐주얼",
    include:
      "빠른 트렌드 반응, 영한 무드, 도메스틱 패션성",
    exclude:
      "스트릿이면 H, 로맨틱 페미닌이면 F-2",
    adjacent: ["H", "F-2"],
    enKeywords: [
      "young casual", "trendy", "domestic fashion",
      "youth trend", "fast fashion forward", "korean casual",
    ],
  },
} as const

export type StyleNodeId = keyof typeof STYLE_NODES

export const STYLE_NODE_IDS = Object.keys(STYLE_NODES) as StyleNodeId[]

// ─── Sensitivity Tags ───────────────────────────────────────

export const SENSITIVITY_TAGS = [
  "미니멀",
  "컨템포러리",
  "캐주얼",
  "스트릿",
  "하이엔드",
  "센슈얼",
  "로맨틱",
  "테크니컬",
  "헤리티지",
  "실험적",
  "아웃도어",
  "고프코어",
] as const

export type SensitivityTag = (typeof SENSITIVITY_TAGS)[number]

// ─── Prompt Builder ─────────────────────────────────────────

/** AI 프롬프트에 주입할 노드 레퍼런스 텍스트 생성 */
export function buildNodeReference(): string {
  const lines = STYLE_NODE_IDS.map((id) => {
    const n = STYLE_NODES[id]
    return [
      `[${id}] ${n.name} (${n.enName})`,
      `  Mood: ${n.mood}`,
      `  Include when: ${n.include}`,
      `  Exclude when: ${n.exclude}`,
      `  Keywords: ${n.enKeywords.join(", ")}`,
    ].join("\n")
  })
  return lines.join("\n\n")
}

/** AI 프롬프트에 주입할 태그 목록 */
export function buildTagList(): string {
  return SENSITIVITY_TAGS.join(", ")
}
