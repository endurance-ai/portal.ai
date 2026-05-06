/**
 * Global pricing display helper. Prefers source_currency/source_price
 * (native, e.g. USD 99.90) and falls back to the FX-converted KRW
 * `price` column. Used by admin product list/detail and any other
 * surface that renders product prices.
 *
 * Migration: see supabase/migrations/036_add_source_currency_to_products.sql
 */

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  KRW: "₩",
}

export function formatProductPrice(opts: {
  /** Native source price (USD decimal, KRW integer, etc.). May be null on legacy rows. */
  sourcePrice?: number | null
  /** ISO currency code; null/undefined for legacy rows = treat as KRW. */
  sourceCurrency?: string | null
  /** FX-converted KRW integer (legacy column, always populated). */
  krwPrice?: number | null
}): string {
  const {sourcePrice, sourceCurrency, krwPrice} = opts
  // Prefer source currency when available AND it's a non-KRW row.
  if (sourcePrice != null && sourceCurrency && sourceCurrency !== "KRW") {
    const symbol = CURRENCY_SYMBOL[sourceCurrency] ?? ""
    // Currencies with implicit decimal places: USD/EUR/GBP show 2.
    // KRW/JPY are integer-valued (handled in the fallback branch below).
    return `${symbol}${sourcePrice.toFixed(2)}`
  }
  // Fallback: KRW (legacy or KRW-source rows).
  if (krwPrice != null) {
    return `₩${krwPrice.toLocaleString("ko-KR")}`
  }
  // Last resort: source price even if currency is KRW (e.g. when the
  // converted column is missing for some reason).
  if (sourcePrice != null) {
    const symbol = sourceCurrency ? (CURRENCY_SYMBOL[sourceCurrency] ?? "") : "₩"
    return `${symbol}${Math.round(sourcePrice).toLocaleString("ko-KR")}`
  }
  return "—"
}
