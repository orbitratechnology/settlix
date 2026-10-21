import { describe, expect, test } from "bun:test"

import { evalFixtures } from "@/lib/ai/evals/fixtures"
import {
  canonicalJson,
  contextHash,
  derivePaymentFacts,
} from "@/lib/investigations/context"

const base = () => structuredClone(evalFixtures[0].context)

describe("derivePaymentFacts", () => {
  test("separates confirmed, unresolved, and failed refunds", () => {
    const context = base()
    context.order.originalAmountMinor = 10000
    const attempt = {
      caseId: context.case.caseId,
      currencyCode: "USD",
      origin: "app" as const,
      paypalRefundId: null,
      createdAt: "2026-10-12T00:00:00.000Z",
    }
    context.refundHistory = [
      { ...attempt, attemptId: "1", status: "COMPLETED", amountMinor: 2500 },
      { ...attempt, attemptId: "2", status: "FAILED", amountMinor: 4000 },
      { ...attempt, attemptId: "3", status: "PENDING", amountMinor: 1000 },
    ]
    expect(derivePaymentFacts(context)).toMatchObject({
      capturedMinor: 10000,
      confirmedRefundedMinor: 2500,
      unresolvedMinor: 1000,
      remainingMinor: 6500,
      hasUnresolvedAttempt: true,
    })
  })

  test("never reports a negative balance", () => {
    const context = base()
    context.refundHistory = [
      {
        attemptId: "1",
        caseId: "c",
        status: "COMPLETED",
        amountMinor: context.order.originalAmountMinor + 100,
        currencyCode: "USD",
        origin: "app",
        paypalRefundId: null,
        createdAt: "2026-10-12T00:00:00.000Z",
      },
    ]
    expect(derivePaymentFacts(context).remainingMinor).toBe(0)
  })

  test("measures whole days from capture to the request", () => {
    const context = base()
    context.order.capturedAt = "2026-10-01T23:00:00.000Z"
    context.case.requestReceivedAt = "2026-10-31T22:59:00.000Z"
    expect(derivePaymentFacts(context).daysFromCaptureToRequest).toBe(29)
    context.order.capturedAt = null
    expect(derivePaymentFacts(context).daysFromCaptureToRequest).toBeNull()
  })
})

describe("contextHash", () => {
  test("ignores key order but not values", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,1]},"b":1}',
    )
    const context = base()
    const reordered = Object.fromEntries(
      Object.entries(context).reverse(),
    ) as typeof context
    expect(Object.keys(reordered)).not.toEqual(Object.keys(context))
    expect(contextHash(reordered)).toBe(contextHash(context))
    expect(contextHash(context)).toMatch(/^[a-f0-9]{64}$/)
  })

  test("changes when any evidence changes", () => {
    const context = base()
    const original = contextHash(context)
    context.case.merchantNotes = "Customer withdrew the photos."
    expect(contextHash(context)).not.toBe(original)
  })
})
