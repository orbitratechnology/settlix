import { describe, expect, test } from "bun:test"

import { evalFixtures } from "@/lib/ai/evals/fixtures"
import type { ResolutionRecommendation } from "@/lib/ai/schemas"
import type { CaseStatus } from "@/lib/domain/labels"
import type { InvestigationContext } from "@/lib/investigations/context"
import { validateCitations } from "@/lib/policy/citations"
import {
  evaluateEligibility,
  type EligibilityInput,
} from "@/lib/policy/eligibility"

const fixture = (id: string) => {
  const found = evalFixtures.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown fixture ${id}`)
  return structuredClone(found)
}

function evaluate(
  context: InvestigationContext,
  recommendation: ResolutionRecommendation,
  options: Partial<Pick<EligibilityInput, "caseStatus" | "freshness">> = {},
) {
  return evaluateEligibility({
    context,
    recommendation,
    caseStatus: options.caseStatus ?? "NEW",
    citations: validateCitations(
      recommendation.policyCitations,
      context.policies,
    ),
    freshness: options.freshness,
  })
}

const check = (result: ReturnType<typeof evaluate>, key: string) =>
  result.checks.find((c) => c.key === key)

describe("eligibility engine on the §10.8 golden recommendations", () => {
  for (const f of evalFixtures) {
    test(`${f.id}: ${f.goldenOutcome}`, () => {
      const result = evaluate(f.context, f.golden, { caseStatus: f.caseStatus })
      expect(result.outcome).toBe(f.goldenOutcome)
      expect(f.expected.actions).toContain(f.golden.proposedAction)
      expect(f.expected.outcomes).toContain(result.outcome)
      if (f.expected.maxApprovableMinor !== undefined) {
        expect(result.approvableAmountMinor ?? 0).toBeLessThanOrEqual(
          f.expected.maxApprovableMinor,
        )
      }
      // Golden citations quote stored clauses verbatim.
      expect(
        validateCitations(f.golden.policyCitations, f.context.policies).every(
          (c) => c.valid,
        ),
      ).toBe(true)
    })
  }
})

describe("eligibility rules", () => {
  test("an eligible full refund approves exactly the remaining balance", () => {
    const f = fixture("eligible-full-refund")
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("eligible_for_approval")
    expect(result.approvableAmountMinor).toBe(8900)
    expect(result.reasonCodes).toEqual([])
  })

  test("a full refund after an earlier partial refund is capped at the remainder", () => {
    const f = fixture("eligible-full-refund")
    f.context.order.paymentState = "PARTIALLY_REFUNDED"
    f.context.refundHistory.push({
      attemptId: "a1",
      caseId: "c-other",
      status: "COMPLETED",
      amountMinor: 2500,
      currencyCode: "USD",
      origin: "app",
      paypalRefundId: "REFUND0000001",
      createdAt: "2026-10-12T00:00:00.000Z",
    })
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("eligible_for_approval")
    expect(result.approvableAmountMinor).toBe(6400)
    expect(check(result, "refund_amount")?.detail).toContain(
      "a full refund is the remaining balance",
    )
  })

  test("the AI cannot override the return window", () => {
    const f = fixture("outside-return-window")
    const refund: ResolutionRecommendation = {
      ...fixture("eligible-full-refund").golden,
      proposedAmountMinor: 32000,
    }
    const result = evaluate(f.context, refund)
    expect(result.outcome).toBe("not_eligible")
    expect(result.reasonCodes).toContain("OUTSIDE_RETURN_WINDOW")
    expect(result.approvableAmountMinor).toBeNull()
  })

  test("a manual-review recommendation outside the window escalates to review", () => {
    const f = fixture("outside-return-window")
    const result = evaluate(f.context, {
      ...f.golden,
      proposedAction: "manual_review",
    })
    expect(result.outcome).toBe("requires_review")
  })

  test("demo orders can be investigated but never approved", () => {
    const f = fixture("eligible-full-refund")
    f.context.order.origin = "seed"
    f.context.order.paypalCaptureId = null
    f.context.order.paypalOrderId = null
    const eligible = evaluate(f.context, f.golden)
    expect(eligible.outcome).toBe("blocked_by_payment_state")
    expect(eligible.summary).toContain("Demo order")
    expect(eligible.approvableAmountMinor).toBeNull()

    const evidence = evaluate(f.context, fixture("missing-evidence").golden)
    expect(evidence.outcome).toBe("requires_evidence")
    expect(evidence.reasonCodes).toContain("NO_CAPTURE_MAPPING")
  })

  test("an uncaptured payment blocks the case outright", () => {
    const f = fixture("missing-evidence")
    f.context.order.paymentState = "AWAITING_CAPTURE"
    f.context.order.capturedAt = null
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("blocked_by_payment_state")
    expect(result.reasonCodes).toContain("PAYMENT_NOT_CAPTURED")
    expect(check(result, "return_window")?.status).toBe("not_applicable")
  })

  test("a currency mismatch between case and payment blocks the refund", () => {
    const f = fixture("eligible-full-refund")
    f.context.case.currencyCode = "EUR"
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("blocked_by_payment_state")
    expect(result.reasonCodes).toContain("CURRENCY_MISMATCH")
  })

  test("an unresolved refund attempt blocks a new one", () => {
    for (const status of [
      "REQUESTED",
      "PENDING",
      "RECOVERY_REQUIRED",
    ] as const) {
      const f = fixture("eligible-full-refund")
      f.context.refundHistory.push({
        attemptId: "a2",
        caseId: f.context.case.caseId,
        status,
        amountMinor: 1000,
        currencyCode: "USD",
        origin: "app",
        paypalRefundId: null,
        createdAt: "2026-10-16T10:00:00.000Z",
      })
      const result = evaluate(f.context, f.golden)
      expect(result.outcome).toBe("blocked_by_payment_state")
      expect(result.reasonCodes).toContain("REFUND_IN_PROGRESS")
      expect(result.amounts.unresolvedMinor).toBe(1000)
      expect(result.amounts.remainingMinor).toBe(7900)
    }
  })

  test("failed attempts don't reduce the refundable balance", () => {
    const f = fixture("eligible-full-refund")
    f.context.refundHistory.push({
      attemptId: "a3",
      caseId: f.context.case.caseId,
      status: "FAILED",
      amountMinor: 8900,
      currencyCode: "USD",
      origin: "app",
      paypalRefundId: null,
      createdAt: "2026-10-16T10:00:00.000Z",
    })
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("eligible_for_approval")
    expect(result.approvableAmountMinor).toBe(8900)
  })

  test("a case with a refund underway or done is locked", () => {
    const f = fixture("eligible-full-refund")
    for (const status of [
      "REFUND_PENDING",
      "REFUNDED",
      "RECOVERY_REQUIRED",
    ] satisfies CaseStatus[]) {
      const result = evaluate(f.context, f.golden, { caseStatus: status })
      expect(result.outcome).toBe("blocked_by_payment_state")
      expect(result.reasonCodes).toContain("CASE_LOCKED")
    }
  })

  test("an invalid citation sends the case to review", () => {
    const f = fixture("eligible-full-refund")
    f.golden.policyCitations[0].supportingQuote =
      "Every customer always gets a full refund, no questions asked."
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("requires_review")
    expect(result.reasonCodes).toContain("INVALID_CITATION")
  })

  test("a refund recommendation without citations needs review", () => {
    const f = fixture("eligible-full-refund")
    f.golden.policyCitations = []
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("requires_review")
    expect(result.reasonCodes).toContain("MISSING_CITATION")
  })

  test("missing evidence turns a refund recommendation into an evidence request", () => {
    const f = fixture("eligible-full-refund")
    f.golden.evidenceMissing = ["A photo of the carafe."]
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("requires_evidence")
  })

  test("contradictions and review-level risk flags require review", () => {
    const f = fixture("eligible-full-refund")
    const contradictions = evaluate(f.context, {
      ...f.golden,
      contradictions: ["Tracking says the parcel is still in transit."],
    })
    expect(contradictions.outcome).toBe("requires_review")

    const injection = evaluate(f.context, {
      ...f.golden,
      riskFlags: [
        { code: "prompt_injection", detail: "Instructions to the AI." },
      ],
    })
    expect(injection.outcome).toBe("requires_review")
    expect(injection.reasonCodes).toContain("PROMPT_INJECTION_FLAGGED")

    const note = evaluate(f.context, {
      ...f.golden,
      riskFlags: [{ code: "repeat_requester", detail: "Second request." }],
    })
    expect(note.outcome).toBe("eligible_for_approval")
    expect(check(note, "risk_flags")?.status).toBe("warning")
  })

  test("a partial refund must have an amount within the balance and the request", () => {
    const f = fixture("eligible-partial-refund")
    const missing = evaluate(f.context, {
      ...f.golden,
      proposedAmountMinor: null,
    })
    expect(missing.reasonCodes).toContain("AMOUNT_MISSING")

    const negative = evaluate(f.context, {
      ...f.golden,
      proposedAmountMinor: -500,
    })
    expect(negative.outcome).toBe("requires_review")
    expect(negative.reasonCodes).toContain("AMOUNT_MISSING")
    expect(negative.approvableAmountMinor).toBeNull()

    const tooMuch = evaluate(f.context, {
      ...f.golden,
      proposedAmountMinor: 9000,
    })
    expect(tooMuch.outcome).toBe("requires_review")
    expect(tooMuch.reasonCodes).toContain("AMOUNT_EXCEEDS_REQUEST")

    const wrongCurrency = evaluate(f.context, {
      ...f.golden,
      currencyCode: "EUR",
    })
    expect(wrongCurrency.reasonCodes).toContain("AMOUNT_CURRENCY_MISMATCH")
  })

  test("amounts above the policy's review threshold require review", () => {
    const f = fixture("eligible-full-refund")
    f.context.order.originalAmountMinor = 60000
    f.context.case.requestedAmountMinor = 60000
    const result = evaluate(f.context, f.golden)
    expect(result.outcome).toBe("requires_review")
    expect(result.reasonCodes).toContain("ABOVE_REVIEW_THRESHOLD")
  })

  test("no active policy means a merchant must decide", () => {
    const f = fixture("eligible-full-refund")
    f.context.policies = []
    const result = evaluate(f.context, { ...f.golden, policyCitations: [] })
    expect(result.outcome).toBe("requires_review")
    expect(result.reasonCodes).toContain("NO_APPLICABLE_POLICY")
  })

  test("a recommendation made on older records is stale", () => {
    const f = fixture("eligible-full-refund")
    const result = evaluate(f.context, f.golden, {
      freshness: {
        recommendationHash: "a".repeat(64),
        currentHash: "b".repeat(64),
      },
    })
    expect(result.outcome).toBe("requires_review")
    expect(result.reasonCodes).toContain("STALE_RECOMMENDATION")
  })

  test("reason codes are unique and only come from failed checks", () => {
    const f = fixture("already-refunded")
    const result = evaluate(f.context, f.golden)
    expect(result.reasonCodes).toEqual([...new Set(result.reasonCodes)])
    expect(result.reasonCodes).toContain("ALREADY_FULLY_REFUNDED")
    expect(result.reasonCodes).not.toContain("MISSING_CITATION")
  })
})
