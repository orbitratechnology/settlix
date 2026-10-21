import { describe, expect, test } from "bun:test"

import { currencyExponent, formatMoney, toDecimalString } from "./amounts"

describe("currencyExponent", () => {
  test("uses ISO 4217 minor units", () => {
    expect(currencyExponent("USD")).toBe(2)
    expect(currencyExponent("EUR")).toBe(2)
    expect(currencyExponent("JPY")).toBe(0)
  })
})

describe("toDecimalString", () => {
  test("converts minor units without floating point", () => {
    expect(toDecimalString(8900, 2)).toBe("89.00")
    expect(toDecimalString(1, 2)).toBe("0.01")
    expect(toDecimalString(0, 2)).toBe("0.00")
    expect(toDecimalString(123456789, 2)).toBe("1234567.89")
    expect(toDecimalString(500, 0)).toBe("500")
    expect(toDecimalString(-250, 2)).toBe("-2.50")
  })

  test("rejects non-integer amounts", () => {
    expect(() => toDecimalString(10.5, 2)).toThrow(RangeError)
    expect(() => toDecimalString(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow(
      RangeError,
    )
  })
})

describe("formatMoney", () => {
  test("formats with the currency symbol and exact cents", () => {
    expect(formatMoney(8900, "USD")).toBe("$89.00")
    expect(formatMoney(480000, "USD")).toBe("$4,800.00")
    expect(formatMoney(12000, "EUR")).toBe("€120.00")
    expect(formatMoney(1999, "JPY")).toBe("¥1,999")
  })
})
