/**
 * Integer minor units ↔ PayPal decimal strings (PRD §12). No floating point.
 */

const MINOR_EXPONENT = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0,
} as const

export type CurrencyCode = keyof typeof MINOR_EXPONENT

export type PayPalMoney = {
  currency_code: string
  value: string
}

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return Object.hasOwn(MINOR_EXPONENT, value)
}

function exponentOf(currency: string): number {
  if (!isSupportedCurrency(currency)) {
    throw new RangeError(`Unsupported currency ${currency}`)
  }
  return MINOR_EXPONENT[currency]
}

/** 1999 USD → { currency_code: "USD", value: "19.99" }; 500 JPY → "500". */
export function minorToPayPal(minor: number, currency: string): PayPalMoney {
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new RangeError(
      "amount must be a positive safe integer in minor units",
    )
  }
  const exponent = exponentOf(currency)
  if (exponent === 0) return { currency_code: currency, value: String(minor) }
  const digits = String(minor).padStart(exponent + 1, "0")
  return {
    currency_code: currency,
    value: `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`,
  }
}

/** { USD, "19.99" } → 1999. Rejects negatives, junk, and precision loss. */
export function payPalToMinor(money: PayPalMoney): number {
  const exponent = exponentOf(money.currency_code)
  const match = /^(\d+)(?:\.(\d+))?$/.exec(money.value)
  if (!match) throw new RangeError(`Unexpected PayPal amount "${money.value}"`)
  const whole = match[1] ?? "0"
  const fraction = match[2] ?? ""
  if (/[1-9]/.test(fraction.slice(exponent))) {
    throw new RangeError(
      `Amount "${money.value}" has more than ${exponent} decimals`,
    )
  }
  const minor = Number(
    whole + fraction.slice(0, exponent).padEnd(exponent, "0"),
  )
  if (!Number.isSafeInteger(minor)) throw new RangeError("amount too large")
  return minor
}
