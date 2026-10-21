import { describe, expect, test } from "bun:test"

import { minorToPayPal, payPalToMinor } from "./money"

describe("minorToPayPal", () => {
  test("formats integer minor units as PayPal decimal strings", () => {
    expect(minorToPayPal(1999, "USD")).toEqual({
      currency_code: "USD",
      value: "19.99",
    })
    expect(minorToPayPal(5, "USD").value).toBe("0.05")
    expect(minorToPayPal(100, "USD").value).toBe("1.00")
    expect(minorToPayPal(500, "JPY").value).toBe("500")
  })

  test("rejects zero, negative, fractional, and unsafe amounts", () => {
    expect(() => minorToPayPal(0, "USD")).toThrow(RangeError)
    expect(() => minorToPayPal(-100, "USD")).toThrow(RangeError)
    expect(() => minorToPayPal(10.5, "USD")).toThrow(RangeError)
    expect(() => minorToPayPal(Number.MAX_SAFE_INTEGER + 1, "USD")).toThrow(
      RangeError,
    )
  })

  test("rejects unsupported currencies", () => {
    expect(() => minorToPayPal(100, "XYZ")).toThrow(RangeError)
  })
})

describe("payPalToMinor", () => {
  test("parses PayPal amounts exactly", () => {
    expect(payPalToMinor({ currency_code: "USD", value: "19.99" })).toBe(1999)
    expect(payPalToMinor({ currency_code: "USD", value: "10" })).toBe(1000)
    expect(payPalToMinor({ currency_code: "USD", value: "10.5" })).toBe(1050)
    expect(payPalToMinor({ currency_code: "USD", value: "0.01" })).toBe(1)
    expect(payPalToMinor({ currency_code: "JPY", value: "500" })).toBe(500)
  })

  test("round-trips without loss", () => {
    for (const minor of [1, 99, 100, 8900, 123456789]) {
      expect(payPalToMinor(minorToPayPal(minor, "USD"))).toBe(minor)
    }
  })

  test("rejects precision loss, negatives, and junk", () => {
    expect(() =>
      payPalToMinor({ currency_code: "USD", value: "1.999" }),
    ).toThrow()
    expect(() =>
      payPalToMinor({ currency_code: "USD", value: "-1.00" }),
    ).toThrow()
    expect(() =>
      payPalToMinor({ currency_code: "USD", value: "1e3" }),
    ).toThrow()
    expect(() =>
      payPalToMinor({ currency_code: "JPY", value: "1.5" }),
    ).toThrow()
  })
})
