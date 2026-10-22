/**
 * Refund workflow against the real Supabase project with a PayPal test double
 * (PRD §17.2: approval recording, refund response and recovery-state
 * persistence; §15: duplicates, tampered amounts, rejection, pending, unknown
 * outcomes; §14: merchant scoping and rate limits).
 *
 * Each run creates its own merchant (see ./fixtures) and each test its own
 * order and case. Orders carry clearly fake TEST… PayPal IDs and the double
 * answers like PayPal would, so these rows prove software behavior only, never
 * a real refund. Audit events and investigations are append-only, so the rows
 * stay. Skipped without NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY.
 */
import { beforeAll, describe, expect, test } from "bun:test"

import { PROMPT_VERSION } from "@/lib/ai/prompts"
import type { ProposedAction, ResolutionRecommendation } from "@/lib/ai/schemas"
import { PayPalError } from "@/lib/paypal/errors"
import { minorToPayPal } from "@/lib/paypal/money"
import type { RefundRequestInput } from "@/lib/paypal/payments"
import type { PayPalRefund } from "@/lib/paypal/types"
import type { Member } from "@/lib/security/auth"

import {
  adminClient,
  APPROVER_ID,
  createTestCase,
  createTestMerchant,
  FULL_REFUND_CLAUSE,
  integrationConfigured,
  ISOLATION_MERCHANT_ID,
  PARTIAL_REFUND_CLAUSE,
  type TestDb,
} from "./fixtures"

type RefundCall = RefundRequestInput & { requestId: string }

/**
 * Answers like PayPal: one refund per PayPal-Request-Id (201, then 200 with the
 * same refund on a replay). `next` can override the next answer.
 */
function paypalDouble() {
  const refunds = new Map<string, PayPalRefund>()
  const calls: RefundCall[] = []
  const gets: string[] = []
  let next: ((call: RefundCall) => Promise<unknown>) | null = null
  let delayMs = 0

  const toRefund = (
    call: RefundCall,
    status: PayPalRefund["status"],
  ): PayPalRefund => ({
    id: `TESTREFUND${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    status,
    amount: minorToPayPal(call.amountMinor, call.currency),
    custom_id: call.settlixRefundId,
  })

  return {
    calls,
    gets,
    refunds,
    /** Overrides the next refund call only. */
    once(answer: (call: RefundCall) => Promise<unknown>) {
      next = answer
    },
    slow(ms: number) {
      delayMs = ms
    },
    gateway: {
      refund: async (call: RefundCall) => {
        calls.push(call)
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
        const override = next
        next = null
        if (override) {
          return (await override(call)) as {
            httpStatus: number
            refund: PayPalRefund
          }
        }
        const existing = refunds.get(call.requestId)
        if (existing) return { httpStatus: 200, refund: existing }
        const refund = toRefund(call, "COMPLETED")
        refunds.set(call.requestId, refund)
        return { httpStatus: 201, refund }
      },
      getRefund: async (id: string) => {
        gets.push(id)
        const found = [...refunds.values()].find((refund) => refund.id === id)
        if (!found) throw new Error(`Unknown refund ${id}`)
        return found
      },
    },
    toRefund,
  }
}

describe.skipIf(!integrationConfigured)("refund workflow", () => {
  let db: TestDb
  let service: typeof import("@/lib/refunds/service")
  let member: Member
  let merchantId: string
  let policyId: string

  beforeAll(async () => {
    db = adminClient()
    service = await import("@/lib/refunds/service")
    ;({ merchantId, policyId, member } = await createTestMerchant(db))
  })

  function recommendation(
    action: ProposedAction,
    proposedMinor: number | null,
  ): ResolutionRecommendation {
    const partial = action === "partial_refund"
    return {
      summary: "Integration test case with a clear, supported request.",
      extractedFacts: [],
      proposedAction: action,
      proposedAmountMinor: proposedMinor,
      currencyCode: proposedMinor === null ? null : "USD",
      policyCitations: [
        {
          policyId,
          policyVersion: 1,
          clauseKey: partial ? "PR-1" : "RF-1",
          supportingQuote: partial ? PARTIAL_REFUND_CLAUSE : FULL_REFUND_CLAUSE,
          explanation: "The clause covers this request.",
        },
      ],
      evidenceFor: ["The merchant notes confirm the request."],
      evidenceMissing: [],
      contradictions: [],
      riskFlags: [],
      explanation: "The cited clause applies and nothing conflicts with it.",
      suggestedCustomerReply: "Thanks for reaching out. We're on it.",
    }
  }

  /**
   * A captured test order and a case that is READY_FOR_APPROVAL, with an
   * investigation built from the same context, citation, and eligibility code
   * the investigation service uses (without a model call).
   */
  async function readyCase({
    capturedMinor = 2400,
    action = "full_refund" as ProposedAction,
    proposedMinor = null as number | null,
  } = {}) {
    const { CASE_CONTEXT_COLUMNS, loadInvestigationContext } =
      await import("@/lib/investigations/load")
    const { contextHash } = await import("@/lib/investigations/context")
    const { validateCitations } = await import("@/lib/policy/citations")
    const { evaluateEligibility } = await import("@/lib/policy/eligibility")

    const fixture = await createTestCase(db, merchantId, {
      capturedMinor,
      requestedMinor: proposedMinor ?? capturedMinor,
    })
    const { data: created, error: caseError } = await db
      .from("cases")
      .select(CASE_CONTEXT_COLUMNS)
      .eq("id", fixture.caseId)
      .single()
    if (caseError) throw caseError

    const rec = recommendation(action, proposedMinor)
    const context = await loadInvestigationContext(db, merchantId, created)
    const citations = validateCitations(rec.policyCitations, context.policies)
    const eligibility = evaluateEligibility({
      context,
      caseStatus: "NEW",
      recommendation: rec,
      citations,
    })
    expect(eligibility.outcome).toBe("eligible_for_approval")

    const { data: investigation, error: investigationError } = await db
      .from("investigations")
      .insert({
        merchant_id: merchantId,
        case_id: created.id,
        model_provider: "test-double",
        model_id: "test-double",
        prompt_version: PROMPT_VERSION,
        policy_version_snapshot: context.policies as never,
        input_context_hash: contextHash(context),
        recommendation_json: {
          recommendation: rec,
          citations,
          usage: { inputTokens: null, outputTokens: null },
        } as never,
        eligibility_result: eligibility as never,
        created_by: APPROVER_ID,
      })
      .select("id")
      .single()
    if (investigationError) throw investigationError
    for (const status of ["INVESTIGATING", "READY_FOR_APPROVAL"] as const) {
      const { error } = await db
        .from("cases")
        .update({ status })
        .eq("id", created.id)
      if (error) throw error
    }

    return {
      ...fixture,
      confirmation: {
        investigationId: investigation.id,
        amountMinor: eligibility.approvableAmountMinor!,
        currencyCode: "USD",
      },
    }
  }

  const caseRow = async (caseId: string) =>
    (
      await db
        .from("cases")
        .select(
          "status, order:orders!cases_merchant_id_order_id_fkey(payment_state)",
        )
        .eq("id", caseId)
        .single()
    ).data!

  const attemptsOf = async (caseId: string) =>
    (
      await db
        .from("refund_attempts")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at")
    ).data!

  const eventsOf = async (caseId: string) =>
    (
      await db
        .from("audit_events")
        .select("event_type")
        .eq("case_id", caseId)
        .like("event_type", "refund.%")
        .order("created_at")
    ).data!.map((event) => event.event_type)

  test("records the approval before PayPal, then the completed refund", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase()
    const result = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(result.status).toBe("completed")

    const [attempt] = await attemptsOf(ready.caseId)
    expect(paypal.calls).toHaveLength(1)
    expect(paypal.calls[0]).toMatchObject({
      captureId: ready.captureId,
      amountMinor: 2400,
      currency: "USD",
      settlixRefundId: attempt.id,
      requestId: attempt.idempotency_key,
    })
    expect(attempt).toMatchObject({
      status: "COMPLETED",
      approved_amount_minor: 2400,
      approved_by: APPROVER_ID,
      response_code: 201,
      paypal_refund_id: paypal.refunds.get(attempt.idempotency_key)!.id,
    })
    expect(await caseRow(ready.caseId)).toEqual({
      status: "REFUNDED",
      order: { payment_state: "REFUNDED" },
    })
    expect(await eventsOf(ready.caseId)).toEqual([
      "refund.approved",
      "refund.completed",
    ])

    // E2E-05 / §15: a repeat answers with the existing refund, not a new one.
    const again = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(again).toMatchObject({
      status: "blocked",
      code: "already_refunded",
      existing: { attemptId: attempt.id, refundId: attempt.paypal_refund_id },
    })
    expect(paypal.calls).toHaveLength(1)
  })

  test("concurrent approvals send exactly one refund", async () => {
    const paypal = paypalDouble()
    paypal.slow(300)
    const ready = await readyCase()
    const results = await Promise.all([
      service.approveAndRefund(member, ready.caseId, ready.confirmation, {
        paypal: paypal.gateway,
      }),
      service.approveAndRefund(member, ready.caseId, ready.confirmation, {
        paypal: paypal.gateway,
      }),
    ])
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual(["blocked", "completed"])
    const loser = results.find((r) => r.status === "blocked")
    expect(["in_progress", "already_refunded"]).toContain(
      loser?.status === "blocked" ? loser.code : "",
    )
    expect(paypal.calls).toHaveLength(1)
    expect(await attemptsOf(ready.caseId)).toHaveLength(1)
  })

  test("a tampered amount, currency, or investigation is refused before any claim", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase()
    const attempts = [
      {
        ...ready.confirmation,
        amountMinor: ready.confirmation.amountMinor + 1,
      },
      { ...ready.confirmation, amountMinor: 999_999 },
      { ...ready.confirmation, currencyCode: "EUR" },
      { ...ready.confirmation, investigationId: crypto.randomUUID() },
    ]
    for (const confirmation of attempts) {
      const result = await service.approveAndRefund(
        member,
        ready.caseId,
        confirmation,
        { paypal: paypal.gateway },
      )
      expect(result).toMatchObject({ status: "blocked", code: "changed" })
    }
    expect(paypal.calls).toHaveLength(0)
    expect(await attemptsOf(ready.caseId)).toHaveLength(0)
    expect((await caseRow(ready.caseId)).status).toBe("READY_FOR_APPROVAL")
  })

  test("a PayPal rejection fails the attempt and leaves the payment untouched", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase()
    paypal.once(async () => {
      throw new PayPalError(
        "rejected",
        422,
        "UNPROCESSABLE_ENTITY",
        ["REFUND_FAILED_INSUFFICIENT_FUNDS"],
        "test-debug-id",
        "test double rejection",
      )
    })
    const result = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(result.status).toBe("failed")
    const [attempt] = await attemptsOf(ready.caseId)
    expect(attempt).toMatchObject({
      status: "FAILED",
      error_code: "REFUND_FAILED_INSUFFICIENT_FUNDS",
      paypal_debug_id: "test-debug-id",
      paypal_refund_id: null,
    })
    expect(await caseRow(ready.caseId)).toEqual({
      status: "REFUND_FAILED",
      order: { payment_state: "CAPTURED" },
    })
    expect(await eventsOf(ready.caseId)).toEqual([
      "refund.approved",
      "refund.failed",
    ])
    // A failed case needs a new investigation before another approval.
    const retry = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(retry).toMatchObject({ status: "blocked", code: "not_ready" })
    expect(paypal.calls).toHaveLength(1)
  })

  test("a pending refund stays pending until PayPal confirms it", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase()
    paypal.once(async (call) => {
      const refund = paypal.toRefund(call, "PENDING")
      paypal.refunds.set(call.requestId, refund)
      return { httpStatus: 201, refund }
    })
    const result = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(result.status).toBe("pending")
    expect(await caseRow(ready.caseId)).toEqual({
      status: "REFUND_PENDING",
      order: { payment_state: "CAPTURED" },
    })
    const duplicate = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(duplicate).toMatchObject({
      status: "blocked",
      code: "in_progress",
      existing: { status: "PENDING" },
    })

    // PayPal completes it; reconciliation reads the refund by its ID.
    const [attempt] = await attemptsOf(ready.caseId)
    const stored = paypal.refunds.get(attempt.idempotency_key)!
    paypal.refunds.set(attempt.idempotency_key, {
      ...stored,
      status: "COMPLETED",
    })
    const reconciled = await service.reconcileRefund(member, ready.caseId, {
      paypal: paypal.gateway,
    })
    expect(reconciled.status).toBe("completed")
    expect(paypal.gets).toEqual([stored.id])
    expect(paypal.calls).toHaveLength(1)
    expect(await caseRow(ready.caseId)).toEqual({
      status: "REFUNDED",
      order: { payment_state: "REFUNDED" },
    })
  })

  test("an unknown outcome is reconciled with the same request, never a new one", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase()
    paypal.once(async () => {
      throw new PayPalError(
        "unknown",
        undefined,
        undefined,
        [],
        undefined,
        "test double timeout",
      )
    })
    const result = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(result.status).toBe("recovery_required")
    const [attempt] = await attemptsOf(ready.caseId)
    expect(attempt).toMatchObject({
      status: "RECOVERY_REQUIRED",
      paypal_refund_id: null,
    })
    expect((await caseRow(ready.caseId)).status).toBe("RECOVERY_REQUIRED")

    const duplicate = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(duplicate).toMatchObject({ status: "blocked", code: "in_progress" })
    expect(paypal.calls).toHaveLength(1)

    const reconciled = await service.reconcileRefund(member, ready.caseId, {
      paypal: paypal.gateway,
    })
    expect(reconciled.status).toBe("completed")
    expect(paypal.calls).toHaveLength(2)
    expect(paypal.calls[1]).toEqual(paypal.calls[0])
    expect(paypal.calls[1].requestId).toBe(attempt.idempotency_key)
    expect(await caseRow(ready.caseId)).toEqual({
      status: "REFUNDED",
      order: { payment_state: "REFUNDED" },
    })
  })

  test("a lost response is recovered without a second refund", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase()
    const result = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway, testFault: "paypal_lost_response" },
    )
    expect(result.status).toBe("recovery_required")
    expect(paypal.refunds.size).toBe(1)

    const reconciled = await service.reconcileRefund(member, ready.caseId, {
      paypal: paypal.gateway,
    })
    expect(reconciled.status).toBe("completed")
    // The replay returned PayPal's original refund (HTTP 200), not a new one.
    expect(paypal.refunds.size).toBe(1)
    const [attempt] = await attemptsOf(ready.caseId)
    expect(attempt).toMatchObject({
      status: "COMPLETED",
      response_code: 200,
      paypal_refund_id: [...paypal.refunds.values()][0].id,
    })
  })

  test("a partial refund leaves the rest of the capture refundable", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase({
      action: "partial_refund",
      proposedMinor: 700,
    })
    expect(ready.confirmation.amountMinor).toBe(700)
    const result = await service.approveAndRefund(
      member,
      ready.caseId,
      ready.confirmation,
      { paypal: paypal.gateway },
    )
    expect(result.status).toBe("completed")
    expect(paypal.calls[0].amountMinor).toBe(700)
    expect(await caseRow(ready.caseId)).toEqual({
      status: "REFUNDED",
      order: { payment_state: "PARTIALLY_REFUNDED" },
    })
  })

  test("other merchants and roles without approval rights are refused", async () => {
    const paypal = paypalDouble()
    const ready = await readyCase()
    const outsider: Member = {
      ...member,
      workspace: { ...member.workspace, id: ISOLATION_MERCHANT_ID },
    }
    expect(
      await service.approveAndRefund(
        outsider,
        ready.caseId,
        ready.confirmation,
        { paypal: paypal.gateway },
      ),
    ).toMatchObject({ status: "blocked", code: "not_found" })
    expect(
      await service.reconcileRefund(outsider, ready.caseId, {
        paypal: paypal.gateway,
      }),
    ).toMatchObject({ status: "blocked", code: "not_found" })
    expect(
      await service.approveAndRefund(
        { ...member, role: "support" },
        ready.caseId,
        ready.confirmation,
        { paypal: paypal.gateway },
      ),
    ).toMatchObject({ status: "blocked", code: "forbidden" })
    expect(paypal.calls).toHaveLength(0)
    expect((await caseRow(ready.caseId)).status).toBe("READY_FOR_APPROVAL")
  })

  test("rate limits count per merchant and action", async () => {
    const take = (merchant: string) =>
      db
        .rpc("consume_rate_limit", {
          p_merchant_id: merchant,
          p_action: "test.limit",
          p_limit: 2,
          p_window_seconds: 3600,
        })
        .then(({ data, error }) => {
          if (error) throw error
          return data
        })
    expect([await take(merchantId), await take(merchantId)]).toEqual([
      true,
      true,
    ])
    expect(await take(merchantId)).toBe(false)
  })
})
