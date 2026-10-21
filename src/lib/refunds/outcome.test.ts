import { describe, expect, test } from "bun:test"

import { PayPalError } from "@/lib/paypal/errors"
import type { PayPalRefund } from "@/lib/paypal/types"
import { outcomeFromError, outcomeFromRefund } from "@/lib/refunds/outcome"

const expected = {
  attemptId: "6b7d1d0e-3a2f-4f7e-9d7a-2b3c4d5e6f70",
  amountMinor: 2500,
  currency: "USD",
}

const refund = (overrides: Partial<PayPalRefund> = {}): PayPalRefund => ({
  id: "1JU08902781691411",
  status: "COMPLETED",
  amount: { value: "25.00", currency_code: "USD" },
  custom_id: expected.attemptId,
  create_time: "2026-10-21T20:00:00Z",
  ...overrides,
})

describe("outcomeFromRefund", () => {
  test("a matching COMPLETED refund is completed, with a sanitized summary", () => {
    const outcome = outcomeFromRefund(expected, 201, {
      ...refund(),
      // Fields that must never be stored.
      ...({ payer: { email_address: "buyer@example.com" } } as object),
    })
    expect(outcome).toMatchObject({
      status: "COMPLETED",
      paypalRefundId: "1JU08902781691411",
      responseCode: 201,
      errorCode: null,
    })
    expect(JSON.stringify(outcome.responseSummary)).not.toContain("buyer")
  })

  test("a replayed response (200) is treated the same way", () => {
    expect(outcomeFromRefund(expected, 200, refund()).status).toBe("COMPLETED")
  })

  test("PENDING stays pending", () => {
    expect(
      outcomeFromRefund(expected, 201, refund({ status: "PENDING" })).status,
    ).toBe("PENDING")
  })

  test("FAILED and CANCELLED mean no money moved", () => {
    expect(
      outcomeFromRefund(expected, 201, refund({ status: "FAILED" })),
    ).toMatchObject({ status: "FAILED", errorCode: "REFUND_FAILED" })
    expect(
      outcomeFromRefund(expected, 201, refund({ status: "CANCELLED" })),
    ).toMatchObject({ status: "FAILED", errorCode: "REFUND_CANCELLED" })
  })

  test("a COMPLETED refund that doesn't match the approved intent needs recovery", () => {
    for (const mismatch of [
      refund({ amount: { value: "89.00", currency_code: "USD" } }),
      refund({ amount: { value: "25.00", currency_code: "EUR" } }),
      refund({ custom_id: "someone-else" }),
    ]) {
      expect(outcomeFromRefund(expected, 201, mismatch)).toMatchObject({
        status: "RECOVERY_REQUIRED",
        errorCode: "RESPONSE_MISMATCH",
        paypalRefundId: "1JU08902781691411",
      })
    }
  })

  test("202, missing fields, or an unknown status are not proof of anything", () => {
    expect(outcomeFromRefund(expected, 202, refund()).status).toBe(
      "RECOVERY_REQUIRED",
    )
    expect(outcomeFromRefund(expected, 201, {} as PayPalRefund)).toMatchObject({
      status: "RECOVERY_REQUIRED",
      paypalRefundId: null,
    })
    expect(
      outcomeFromRefund(expected, 201, refund({ id: "bad id!" }))
        .paypalRefundId,
    ).toBeNull()
    expect(
      outcomeFromRefund(
        expected,
        201,
        refund({ status: "MYSTERY" as PayPalRefund["status"] }),
      ).status,
    ).toBe("RECOVERY_REQUIRED")
  })
})

describe("outcomeFromError", () => {
  const error = (
    kind: "rejected" | "retry_later" | "unknown",
    status: number | undefined,
    issues: string[] = [],
  ) => new PayPalError(kind, status, "ERR", issues, "dbg123", "PayPal error")

  test("a definitive rejection is FAILED with the issue code and debug ID", () => {
    expect(
      outcomeFromError(error("rejected", 422, ["REFUND_AMOUNT_EXCEEDED"])),
    ).toMatchObject({
      status: "FAILED",
      errorCode: "REFUND_AMOUNT_EXCEEDED",
      responseCode: 422,
      debugId: "dbg123",
    })
  })

  test("timeouts, network errors, 5xx, 409 and 429 require recovery", () => {
    expect(outcomeFromError(error("unknown", undefined)).status).toBe(
      "RECOVERY_REQUIRED",
    )
    expect(outcomeFromError(error("unknown", 500)).status).toBe(
      "RECOVERY_REQUIRED",
    )
    expect(
      outcomeFromError(
        error("retry_later", 409, ["PREVIOUS_REQUEST_IN_PROGRESS"]),
      ),
    ).toMatchObject({
      status: "RECOVERY_REQUIRED",
      errorCode: "PREVIOUS_REQUEST_IN_PROGRESS",
    })
    expect(outcomeFromError(new Error("socket hang up"))).toMatchObject({
      status: "RECOVERY_REQUIRED",
      errorCode: "UNEXPECTED_ERROR",
    })
  })
})
