/**
 * 어드민 표시용 USD 환산 유틸.
 *
 * 모든 brand/product 가격을 단일 통화 (USD) 로 통일해서 비교 가능하게 표시.
 * 실시간 FX rate 가 아니라 **근사 정적 환율** — 어드민 빠른 시각 비교 목적이라 충분.
 * 사용자 향 가격 표시에는 사용하지 않음 (그쪽은 source_currency 유지).
 *
 * Rates (2026 추정):
 *   1 USD ≈ 1370 KRW
 *   1 GBP ≈ 1.27 USD
 *   1 EUR ≈ 1.07 USD
 *   1 USD ≈ 156 JPY
 *   1 USD ≈ 7.2 CNY
 */

const USD_PER: Record<string, number> = {
  USD: 1.0,
  KRW: 1 / 1370,
  GBP: 1.27,
  EUR: 1.07,
  JPY: 1 / 156,
  CNY: 1 / 7.2,
}

/** 주어진 금액을 USD 로 환산. 알 수 없는 통화면 null. */
export function toUsd(amount: number | null | undefined, currency: string | null | undefined): number | null {
  if (amount == null) return null
  const cur = (currency ?? "KRW").toUpperCase()
  const rate = USD_PER[cur]
  if (rate == null) return null
  return amount * rate
}

/** 환산 후 표시 문자열. 알 수 없는 통화면 원본 그대로 fallback. */
export function fmtUsd(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null) return "—"
  const usd = toUsd(amount, currency)
  if (usd == null) return `${currency ?? "?"} ${amount.toLocaleString()}`
  if (usd >= 1000) return `$${Math.round(usd).toLocaleString("en-US")}`
  if (usd >= 100) return `$${usd.toFixed(0)}`
  return `$${usd.toFixed(2)}`
}
