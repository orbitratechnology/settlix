import { describe, expect, test } from "bun:test"

import { buyerFromPayer, evaluateCapture } from "./capture-evaluation"

const order = {
  id: "settlix-order-1",
  original_amount_minor: 8900,
  currency_code: "USD",
}

function capture(overrides: Record<string, unknown> = {}) {
  return {
    id: "CAPTURE123456789",
    status: "COMPLETED" as const,
    amount: { currency_code: "USD", value: "89.00" },
    custom_id: "settlix-order-1",
    create_time: "2026-10-21T12:00:00Z",
    ...overrides,
  }
}

describe("evaluateCapture", () => {
  test("a matching COMPLETED capture marks the order captured", () => {
    const result = evaluateCapture(order, {
      capture: capture(),
      customId: "settlix-order-1",
      referenceId: "settlix-order-1",
    })
    expect(result).toEqual({
      ok: true,
      paymentState: "CAPTURED",
      captureId: "CAPTURE123456789",
      captureStatus: "COMPLETED",
      capturedAt: "2026-10-21T12:00:00Z",
    })
  })

  test("PENDING and DECLINED captures are never treated as paid", () => {
    const pending = evaluateCapture(order, {
      capture: capture({ status: "PENDING" }),
      customId: undefined,
      referenceId: undefined,
    })
    expect(pending.ok && pending.paymentState).toBe("CAPTURE_PENDING")

    const declined = evaluateCapture(order, {
      capture: capture({ status: "DECLINED" }),
      customId: undefined,
      referenceId: undefined,
    })
    expect(declined.ok && declined.paymentState).toBe("CAPTURE_DECLINED")
  })

  test("rejects a capture for a different amount, currency, or order", () => {
    const amount = evaluateCapture(order, {
      capture: capture({ amount: { currency_code: "USD", value: "8.90" } }),
      customId: undefined,
      referenceId: undefined,
    })
    expect(amount).toMatchObject({ ok: false, reason: "mismatch" })

    const currency = evaluateCapture(order, {
      capture: capture({ amount: { currency_code: "EUR", value: "89.00" } }),
      customId: undefined,
      referenceId: undefined,
    })
    expect(currency).toMatchObject({ ok: false, reason: "mismatch" })

    const other = evaluateCapture(order, {
      capture: capture({ custom_id: "someone-else" }),
      customId: undefined,
      referenceId: undefined,
    })
    expect(other).toMatchObject({ ok: false, reason: "mismatch" })
  })

  test("a response without a capture is not a payment", () => {
    expect(
      evaluateCapture(order, {
        capture: undefined,
        customId: undefined,
        referenceId: undefined,
      }),
    ).toMatchObject({ ok: false, reason: "no_capture" })
  })
})

describe("buyerFromPayer", () => {
  test("keeps the buyer's email (lowercased) and full name", () => {
    expect(
      buyerFromPayer({
        email_address: " Sam.Rivera@Example.com ",
        name: { given_name: "Sam", surname: "Rivera" },
      }),
    ).toEqual({ email: "sam.rivera@example.com", name: "Sam Rivera" })
  })

  test("a missing name is null, a missing or malformed email is no buyer", () => {
    expect(buyerFromPayer({ email_address: "a@b.co" })).toEqual({
      email: "a@b.co",
      name: null,
    })
    expect(buyerFromPayer(undefined)).toBeNull()
    expect(buyerFromPayer({ email_address: "not an email" })).toBeNull()
    expect(buyerFromPayer({ name: { given_name: "Sam" } })).toBeNull()
  })
})
