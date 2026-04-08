/**
 * 체형 정보 추출 유틸리티
 *
 * 리뷰 파서에서 사용하는 body-info regex 패턴을 분리하여
 * Node 컨텍스트와 브라우저(page.evaluate) 컨텍스트 양쪽에서 재사용할 수 있도록 한다.
 */

// ─── 타입 ─────────────────────────────────────────────

export interface BodyInfo {
  height: string | null
  weight: string | null
  usualSize: string | null
  purchasedSize: string | null
  bodyType: string | null
}

// ─── 패턴 (문자열) ────────────────────────────────────

/** page.evaluate 에 직렬화하여 전달할 수 있는 regex source 문자열 */
export const BODY_INFO_PATTERNS = {
  height: String.raw`(?:키|신장|Height)\s*[:：]?\s*(\d{2,3}\s*(?:cm|CM)?)`,
  weight: String.raw`(?:몸무게|체중|Weight)\s*[:：]?\s*(\d{2,3}\s*(?:kg|KG)?)`,
  usualSize: String.raw`(?:평소\s*사이즈|보통\s*사이즈|Usual\s*Size)\s*[:：]?\s*([^\n,]{1,10})`,
  purchasedSize: String.raw`(?:구매\s*사이즈|선택\s*사이즈|Purchased\s*Size|주문\s*사이즈)\s*[:：]?\s*([^\n,]{1,10})`,
  bodyType: String.raw`(?:체형|Body\s*Type)\s*[:：]?\s*([^\n,]{1,20})`,
} as const

// ─── Node 컨텍스트용 ──────────────────────────────────

/** Node 컨텍스트에서 체형 정보를 추출한다 */
export function extractBodyInfo(text: string): BodyInfo | null {
  return extractBodyInfoInBrowser(text, BODY_INFO_PATTERNS)
}

// ─── 브라우저 컨텍스트용 ──────────────────────────────

/**
 * 브라우저(page.evaluate) 컨텍스트에서 사용할 수 있도록
 * 패턴 객체를 인자로 받는 버전.
 *
 * 사용 예:
 * ```ts
 * const body = await page.evaluate(
 *   (args) => extractBodyInfoInBrowser(args.text, args.patterns),
 *   { text: bodyText, patterns: BODY_INFO_PATTERNS }
 * )
 * ```
 */
export function extractBodyInfoInBrowser(
  text: string,
  patterns: Record<string, string>,
): BodyInfo | null {
  const heightMatch = text.match(new RegExp(patterns.height, "i"))
  const weightMatch = text.match(new RegExp(patterns.weight, "i"))
  const usualSizeMatch = text.match(new RegExp(patterns.usualSize, "i"))
  const purchasedSizeMatch = text.match(new RegExp(patterns.purchasedSize, "i"))
  const bodyTypeMatch = text.match(new RegExp(patterns.bodyType, "i"))

  const hasAny = heightMatch || weightMatch || usualSizeMatch || purchasedSizeMatch || bodyTypeMatch
  if (!hasAny) return null

  return {
    height: heightMatch?.[1]?.trim() ?? null,
    weight: weightMatch?.[1]?.trim() ?? null,
    usualSize: usualSizeMatch?.[1]?.trim() ?? null,
    purchasedSize: purchasedSizeMatch?.[1]?.trim() ?? null,
    bodyType: bodyTypeMatch?.[1]?.trim() ?? null,
  }
}
