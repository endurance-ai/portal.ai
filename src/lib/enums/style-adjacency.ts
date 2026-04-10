/**
 * 스타일 노드 유사도 맵 — exact match 실패 시 gradient scoring
 *
 * fashion-genome.ts의 adjacent 필드 기반 + 도메인 판단으로 수치화.
 * 검색엔진에서:
 * - 1.0: 정확 매칭 (full weight)
 * - 0.7: 매우 유사 (같은 감도 스펙트럼)
 * - 0.5: 인접 (관련 무드)
 * - 0.3: 약한 연관 (간접적 교집합)
 * - 0.0: 무관
 */

import type {StyleNodeId} from "../fashion-genome"

// ─── 유사도 정의 (대칭) ─────────────────────────────────────
// 각 [nodeA, nodeB, similarity] — 순서 무관 (양방향 조회)

const STYLE_PAIRS: [StyleNodeId, StyleNodeId, number][] = [
  // ── 같은 감도 스펙트럼 (0.7) ──
  ["B",   "B-2",  0.7],   // alternative (dark ↔ casual)
  ["F",   "F-2",  0.7],   // feminine (minimal ↔ romantic)
  ["C",   "D",    0.7],   // contemporary (minimal ↔ casual)

  // ── 인접 무드 (0.5) ──
  ["F",   "F-3",  0.5],   // feminine (minimal ↔ sensual)
  ["F-2", "F-3",  0.5],   // feminine (romantic ↔ sensual)
  ["G",   "A-1",  0.5],   // outdoor/technical
  ["A-3", "I",    0.5],   // heritage/workwear
  ["H",   "K",    0.5],   // youth/street casual
  ["B",   "E",    0.5],   // dark/deconstructive
  ["B-2", "D",    0.5],   // alternative casual meets contemporary
  ["A-2", "H",    0.5],   // luxury street meets street
  ["B-2", "E",    0.5],   // alternative casual meets deconstructivism

  // ── 약한 연관 (0.3) ──
  ["C",   "B-2",  0.3],   // minimal ↔ alternative casual (실험적 교집합)
  ["C",   "E",    0.3],   // minimal ↔ deconstructivism (구조적 교집합)
  ["C",   "F-3",  0.3],   // minimal ↔ sensual (하이엔드 교집합)
  ["C",   "G",    0.3],   // minimal ↔ gorpcore (기능적 정제 교집합)
  ["D",   "H",    0.3],   // contemporary ↔ street (캐주얼 교집합)
  ["D",   "A-3",  0.3],   // contemporary ↔ heritage (착장성 교집합)
  ["D",   "F",    0.3],   // contemporary ↔ feminine (정제 캐주얼 교집합)
  ["D",   "I",    0.3],   // contemporary ↔ japanese workwear (라이프스타일 교집합)
  ["A-1", "C",    0.3],   // trail ↔ minimal (기능성+정제 교집합)
  ["A-2", "B",    0.3],   // luxury street ↔ deep street (스트릿 교집합)
  ["G",   "E",    0.3],   // gorpcore ↔ deconstructivism (테크니컬 교집합)
  ["K",   "F-2",  0.3],   // young casual ↔ romantic (영/트렌디 교집합)
  ["I",   "G",    0.3],   // japanese workwear ↔ gorpcore (유틸리티 교집합)
]

// ─── 빠른 조회를 위한 맵 구축 ─────────────────────────────────

const SIMILARITY_MAP = new Map<string, number>()

for (const [a, b, sim] of STYLE_PAIRS) {
  SIMILARITY_MAP.set(`${a}::${b}`, sim)
  SIMILARITY_MAP.set(`${b}::${a}`, sim)
}

// ─── Public API ──────────────────────────────────────────────

/** 두 스타일 노드 간 유사도 반환 (0.0 ~ 1.0) */
export function getStyleSimilarity(a: string | undefined | null, b: string | undefined | null): number {
  if (!a || !b) return 0
  if (a === b) return 1.0
  return SIMILARITY_MAP.get(`${a}::${b}`) ?? 0
}
