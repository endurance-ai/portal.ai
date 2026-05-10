/**
 * Brand-name normalization — NFKD-aware.
 *
 * 기존 src/lib/find/resolve-brands.ts:8 의 normalize 는 악센트 (é, ó, ñ) 를
 * 그냥 제거해서 "Aimé Leon Dore" → "leondore" 처럼 일부 글자가 사라짐.
 * 본 모듈은 NFKD 분해 후 combining mark 만 제거 → "aimeleondore".
 *
 * 한글 브랜드도 보존 ([가-힣] 유지).
 */

export function normalizeBrand(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
}
