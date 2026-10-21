import { describe, expect, test } from "bun:test"

import {
  receiptReply,
  receiptState,
  receiptSummaryText,
  type Receipt,
  type ReceiptAttempt,
} from "@/lib/receipts/receipt"

const attempt = (overrides: Partial<ReceiptAttempt> = {}): ReceiptAttempt => ({
  id: "6b7d1d0e-3a2f-4f7e-9d7a-2b3c4d5e6f70",
  origin: "app",
  status: "COMPLETED",
  approvedMinor: 2500,
  currency: "USD",
  approvedAt: "2026-10-21T20:00:00.000Z",
  approvedBy: "demo@settlix.example",
  paypalRefundId: "1JU08902781691411",
  paypalStatus: "COMPLETED",
  paypalAmount: { value: "25.00", currency_code: "USD" },
  responseCode: 201,
  errorCode: null,
  debugId: null,
  approvalOutcome: "eligible_for_approval",
  ...overrides,
})

const receipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  caseId: "42e6b94a-b25d-4a2c-80f0-c7d27c776537",
  caseNumber: "STX-1023",
  caseStatus: "REFUNDED",
  origin: "app",
  merchantName: "Harbor & Pine Supply Co.",
  customerName: "Jordan Lee",
  customerMessage: "The carafe arrived cracked.",
  claimedIssue: "Carafe arrived cracked",
  category: "damaged_item",
  requestedMinor: 2500,
  currency: "USD",
  openedAt: "2026-10-21T15:00:00.000Z",
  order: {
    reference: "SBX-FB92B37F",
    description: "Pour-over coffee set",
    capturedMinor: 8900,
    currency: "USD",
    paymentState: "PARTIALLY_REFUNDED",
    paypalOrderId: "0SH46036KR300010D",
    paypalCaptureId: "4S172867UT322280T",
    origin: "app",
  },
  investigation: null,
  attempt: attempt(),
  ...overrides,
})

describe("receiptState", () => {
  test("only a completed app refund reads as completed", () => {
    expect(receiptState(receipt()).label).toBe("Refund completed")
    expect(
      receiptState(
        receipt({
          caseStatus: "REFUND_PENDING",
          attempt: attempt({ status: "PENDING" }),
        }),
      ).label,
    ).toBe("Refund pending")
    expect(
      receiptState(
        receipt({
          caseStatus: "RECOVERY_REQUIRED",
          attempt: attempt({ status: "RECOVERY_REQUIRED" }),
        }),
      ).label,
    ).toBe("Recovery required")
    expect(
      receiptState(
        receipt({
          caseStatus: "REFUND_FAILED",
          attempt: attempt({ status: "FAILED" }),
        }),
      ).label,
    ).toBe("Refund failed")
  })

  test("seeded refund records never claim a PayPal refund", () => {
    const state = receiptState(
      receipt({ attempt: attempt({ origin: "seed", paypalRefundId: null }) }),
    )
    expect(state.label).toBe("Demo record")
    expect(state.description).toContain("No PayPal refund")
  })

  test("a failed attempt followed by a new decision shows the case state", () => {
    expect(
      receiptState(
        receipt({
          caseStatus: "READY_FOR_APPROVAL",
          attempt: attempt({ status: "FAILED" }),
        }),
      ).label,
    ).toBe("Awaiting decision")
  })
})

describe("receiptReply", () => {
  test("a completed refund reply cites PayPal's reference and promises no date", () => {
    const reply = receiptReply(receipt())!
    expect(reply).toContain("$25.00")
    expect(reply).toContain("1JU08902781691411")
    expect(reply).not.toMatch(/\b(business )?days?\b|\bwithin\b/i)
  })

  test("a pending refund is described as pending, never completed", () => {
    const reply = receiptReply(
      receipt({
        caseStatus: "REFUND_PENDING",
        attempt: attempt({ status: "PENDING" }),
      }),
    )!
    expect(reply).toContain("pending")
    expect(reply).not.toMatch(/\brefunded\b|\bcompleted\b(?! it)/i)
  })

  test("without a refund it falls back to the AI draft, or nothing", () => {
    expect(
      receiptReply(receipt({ caseStatus: "NEEDS_REVIEW", attempt: null })),
    ).toBeNull()
  })
})

describe("receiptSummaryText", () => {
  test("includes identifiers, approval, and the PayPal result", () => {
    const text = receiptSummaryText(receipt())
    for (const expected of [
      "STX-1023",
      "4S172867UT322280T",
      "0SH46036KR300010D",
      "demo@settlix.example",
      "1JU08902781691411",
      "status COMPLETED",
      "Refund completed",
    ]) {
      expect(text).toContain(expected)
    }
  })

  test("a demo record says no refund was executed", () => {
    expect(
      receiptSummaryText(receipt({ attempt: attempt({ origin: "seed" }) })),
    ).toContain("no PayPal refund was executed")
  })
})
