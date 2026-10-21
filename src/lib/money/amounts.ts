/**
 * Money is stored as integer minor units (e.g. cents). These helpers never use
 * floating-point arithmetic on amounts.
 */

/** Number of minor-unit digits for an ISO 4217 currency (USD → 2, JPY → 0). */
export function currencyExponent(currencyCode: string): number {
  return (
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits ?? 2
  )
}

/** Display formatting, e.g. formatMoney(8900, "USD") → "$89.00". */
export function formatMoney(
  amountMinor: number,
  currencyCode: string,
  locale = "en-US",
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("amountMinor must be a safe integer")
  }
  const exponent = currencyExponent(currencyCode)
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  })
  // Build the decimal from digits so no float ever represents the amount.
  return formatter.format(
    toDecimalString(amountMinor, exponent) as Intl.StringNumericLiteral,
  )
}

/** Exact decimal string for an integer minor amount, e.g. (8900, 2) → "89.00". */
export function toDecimalString(amountMinor: number, exponent: number): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("amountMinor must be a safe integer")
  }
  const negative = amountMinor < 0
  const digits = Math.abs(amountMinor)
    .toString()
    .padStart(exponent + 1, "0")
  const whole = exponent === 0 ? digits : digits.slice(0, -exponent)
  const fraction = exponent === 0 ? "" : `.${digits.slice(-exponent)}`
  return `${negative ? "-" : ""}${whole}${fraction}`
}
