import "server-only"

import { createHash, randomUUID } from "node:crypto"

import { recordAuditEvent } from "@/lib/audit/events"
import type { CaseStatus } from "@/lib/domain/labels"
import { canonicalJson, contextHash } from "@/lib/investigations/context"
import {
  CASE_CONTEXT_COLUMNS,
  loadInvestigationContext,
} from "@/lib/investigations/load"
import { parseInvestigation } from "@/lib/investigations/records"
import { formatMoney } from "@/lib/money/amounts"
import { PayPalError } from "@/lib/paypal/errors"
import {
  getPayPalRefund,
  refundPayPalCapture,
  refundRequest,
  type RefundRequestInput,
} from "@/lib/paypal/payments"
import { evaluateEligibility } from "@/lib/policy/eligibility"
import {
  outcomeFromError,
  outcomeFromRefund,
  refundIssueMessages,
  type RefundOutcome,
} from "@/lib/refunds/outcome"
import { can, type Member } from "@/lib/security/auth"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { paypalMockCodes, type TestFault } from "@/lib/testing/faults"
import type { Database, Enums, Json, Tables } from "@/types/database"

type Admin = ReturnType<typeof createAdminClient>
type Attempt = Tables<"refund_attempts">

/** The PayPal calls the refund workflow makes. Tests pass a double. */
export type RefundGateway = {
  refund: typeof refundPayPalCapture
  getRefund: typeof getPayPalRefund
}

const paypalGateway: RefundGateway = {
  refund: refundPayPalCapture,
  getRefund: getPayPalRefund,
}

/** A REQUESTED attempt younger than this may still have its first call in flight. */
const IN_FLIGHT_MS = 60 * 1000

export type RefundConfirmation = {
  investigationId: string
  amountMinor: number
  currencyCode: string
}

/** The refund attempt a duplicate or blocked request ran into. */
export type ExistingAttempt = {
  attemptId: string
  status: Enums<"refund_attempt_status">
  refundId: string | null
  /** Seeded demo attempts never reached PayPal. */
  demo: boolean
}

export type RefundResult =
  | {
      status: "completed" | "pending" | "failed" | "recovery_required"
      attemptId: string
      refundId: string | null
      message: string
    }
  | {
      status: "blocked"
      code:
        | "forbidden"
        | "not_found"
        | "not_ready"
        | "changed"
        | "not_eligible"
        | "in_progress"
        | "already_refunded"
        | "too_soon"
        | "rate_limited"
        | "unavailable"
      message: string
      existing?: ExistingAttempt
    }

type BlockedCode = Extract<RefundResult, { status: "blocked" }>["code"]

/** HTTP status for each blocked reason, used by the JSON routes. */
export const blockedHttpStatus: Record<BlockedCode, number> = {
  forbidden: 403,
  not_found: 404,
  not_ready: 409,
  changed: 409,
  not_eligible: 422,
  in_progress: 409,
  already_refunded: 409,
  too_soon: 409,
  rate_limited: 429,
  unavailable: 503,
}

const blocked = (
  code: BlockedCode,
  message: string,
  existing?: ExistingAttempt,
): RefundResult => ({ status: "blocked", code, message, existing })

/** Nothing reached PayPal: safe to say, and safe to try again. */
const NOTHING_SENT =
  "Settlix couldn't check or record this approval, so nothing was sent to PayPal. Refresh the case and try again shortly."

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")

/** Hash of the exact refund request, stored with the intent before the first call. */
export function refundRequestHash(input: RefundRequestInput) {
  return sha256(canonicalJson(refundRequest(input)))
}

function requestInputOf(attempt: Attempt): RefundRequestInput {
  return {
    captureId: attempt.capture_id!,
    amountMinor: attempt.approved_amount_minor,
    currency: attempt.currency_code,
    settlixRefundId: attempt.id,
  }
}

async function loadCase(admin: Admin, merchantId: string, caseId: string) {
  const { data, error } = await admin
    .from("cases")
    .select(CASE_CONTEXT_COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .maybeSingle()
  if (error) throw new Error("Could not load the case", { cause: error })
  return data
}

async function loadUnresolvedAttempt(
  admin: Admin,
  merchantId: string,
  caseId: string,
) {
  const { data, error } = await admin
    .from("refund_attempts")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("case_id", caseId)
    .eq("origin", "app")
    .in("status", ["REQUESTED", "PENDING", "RECOVERY_REQUIRED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error("Could not load the refund", { cause: error })
  return data
}

const inProgress = (status: CaseStatus) =>
  status === "REFUND_PENDING" || status === "RECOVERY_REQUIRED"

const attemptStatusLabels: Record<Enums<"refund_attempt_status">, string> = {
  REQUESTED: "sent to PayPal",
  PENDING: "pending at PayPal",
  COMPLETED: "completed",
  FAILED: "failed",
  RECOVERY_REQUIRED: "waiting for reconciliation",
}

/**
 * PRD §15 duplicate approval / already refunded: answer with the attempt that
 * already exists instead of starting another one.
 */
async function existingAttemptResult(
  admin: Admin,
  merchantId: string,
  caseId: string,
  caseStatus: CaseStatus,
): Promise<RefundResult> {
  const { data, error } = await admin
    .from("refund_attempts")
    .select(
      "id, status, paypal_refund_id, approved_amount_minor, currency_code, origin",
    )
    .eq("merchant_id", merchantId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error("Could not load the refund", { cause: error })

  const existing: ExistingAttempt | undefined = data
    ? {
        attemptId: data.id,
        status: data.status,
        refundId: data.paypal_refund_id,
        demo: data.origin === "seed",
      }
    : undefined
  const amount = data
    ? formatMoney(data.approved_amount_minor, data.currency_code)
    : null

  if (caseStatus === "REFUNDED") {
    return blocked(
      "already_refunded",
      existing?.demo
        ? "This demo case is already marked as refunded (demo data: no PayPal refund was made). No new refund was sent."
        : existing?.refundId
          ? `This case was already refunded: PayPal refund ${existing.refundId} for ${amount} completed. No new refund was sent.`
          : "This case has already been refunded. No new refund was sent.",
      existing,
    )
  }
  return blocked(
    "in_progress",
    existing && amount
      ? `A ${amount} refund for this case is already ${attemptStatusLabels[existing.status]}. No new refund was sent; check its status instead of approving again.`
      : "A refund for this case is already being processed. No new refund was sent; check its status instead of approving again.",
    existing,
  )
}

/**
 * PRD §13 POST /api/cases/[caseId]/approve-and-refund. The browser's amount is
 * only a confirmation: the server re-runs eligibility on current records, and
 * Postgres re-checks the balance while it claims the case. The intent and its
 * PayPal-Request-Id are committed before PayPal is called.
 */
export async function approveAndRefund(
  member: Member,
  caseId: string,
  confirmation: RefundConfirmation,
  options: { testFault?: TestFault | null; paypal?: RefundGateway } = {},
): Promise<RefundResult> {
  const paypal = options.paypal ?? paypalGateway
  if (!can.approveRefunds(member.role)) {
    return blocked("forbidden", "Your role can't approve refunds.")
  }
  const merchantId = member.workspace.id
  const admin = createAdminClient()

  // Until the claim commits, any failure leaves PayPal untouched.
  let claimed: Claimed
  try {
    const result = await checkAndClaim(admin, member, caseId, confirmation)
    if ("status" in result) return result
    claimed = result
  } catch (error) {
    console.error("Refund approval failed before PayPal", {
      caseId,
      reason: error instanceof Error ? error.message : "unknown",
    })
    return blocked("unavailable", NOTHING_SENT)
  }
  const { attempt, requestInput, idempotencyKey, money, investigationId } =
    claimed

  try {
    await recordAuditEvent(admin, {
      merchantId,
      caseId,
      actor: { type: "user", id: member.userId },
      eventType: "refund.approved",
      summary: `Approved a ${money} refund to the buyer's PayPal account. Refund attempt recorded before calling PayPal.`,
      metadata: {
        attempt_id: attempt.id,
        investigation_id: investigationId,
        amount_minor: requestInput.amountMinor,
        currency: requestInput.currency,
        paypal_capture_id: requestInput.captureId,
      },
    })
  } catch {
    // The approval is stored on the attempt, but without its audit event the
    // refund is not sent. "Check with PayPal" sends this same request later.
    console.error("Could not record the approval event", {
      attemptId: attempt.id,
    })
    return blocked(
      "unavailable",
      `Your approval was saved, but Settlix couldn't finish its audit trail, so the refund wasn't sent to PayPal. In a minute, use "Check with PayPal" on the case to send this same request once.`,
      {
        attemptId: attempt.id,
        status: attempt.status,
        refundId: null,
        demo: false,
      },
    )
  }

  let outcome: RefundOutcome
  try {
    const { httpStatus, refund } = await paypal.refund({
      ...requestInput,
      requestId: idempotencyKey,
      mockCode: options.testFault
        ? paypalMockCodes[options.testFault]
        : undefined,
    })
    if (options.testFault === "paypal_lost_response") {
      // Test fault: PayPal processed the refund, but its answer is dropped.
      throw new PayPalError(
        "unknown",
        undefined,
        undefined,
        [],
        undefined,
        "Test fault: refund response dropped",
      )
    }
    outcome = outcomeFromRefund(
      {
        attemptId: attempt.id,
        amountMinor: requestInput.amountMinor,
        currency: requestInput.currency,
      },
      httpStatus,
      refund,
    )
  } catch (error) {
    if (error instanceof PayPalError) {
      console.error("PayPal refund failed", {
        attemptId: attempt.id,
        ...error.toLogObject(),
      })
    }
    outcome = outcomeFromError(error)
  }

  return applyOutcome(admin, merchantId, caseId, attempt, outcome, "refund")
}

type Claimed = {
  attempt: Attempt
  requestInput: RefundRequestInput
  idempotencyKey: string
  investigationId: string
  money: string
}

/**
 * Everything before PayPal: re-checks the case, the latest investigation, and
 * eligibility on current records, then claims the attempt in Postgres. Returns
 * a blocked result, or the committed attempt to send.
 */
async function checkAndClaim(
  admin: Admin,
  member: Member,
  caseId: string,
  confirmation: RefundConfirmation,
): Promise<RefundResult | Claimed> {
  const merchantId = member.workspace.id
  const row = await loadCase(admin, merchantId, caseId)
  if (!row) return blocked("not_found", "Case not found.")
  if (inProgress(row.status) || row.status === "REFUNDED") {
    return existingAttemptResult(admin, merchantId, caseId, row.status)
  }
  if (row.status !== "READY_FOR_APPROVAL") {
    return blocked(
      "not_ready",
      "Only a case that is ready for approval can be refunded.",
    )
  }
  if (!(await consumeRateLimit(admin, merchantId, "refund.approve"))) {
    return blocked(
      "rate_limited",
      "This workspace has approved many refunds in the last 15 minutes. Nothing was sent to PayPal; wait a few minutes and try again.",
    )
  }

  const { data: latestRow, error: latestError } = await admin
    .from("investigations")
    .select(
      "id, model_provider, model_id, prompt_version, input_context_hash, recommendation_json, eligibility_result, policy_version_snapshot, created_at",
    )
    .eq("merchant_id", merchantId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) {
    throw new Error("Could not load the investigation", { cause: latestError })
  }
  const latest = latestRow ? parseInvestigation(latestRow) : null
  if (!latest || latest.id !== confirmation.investigationId) {
    return blocked(
      "changed",
      "A newer investigation exists. Review it before approving.",
    )
  }

  // FR-08: eligibility is recomputed now, on current records.
  const context = await loadInvestigationContext(admin, merchantId, row)
  const currentHash = contextHash(context)
  const eligibility = evaluateEligibility({
    context,
    caseStatus: row.status,
    recommendation: latest.stored.recommendation,
    citations: latest.stored.citations,
    freshness: {
      recommendationHash: latest.contextHash,
      currentHash,
    },
  })
  const currency = context.order.currencyCode
  const money = (minor: number) => formatMoney(minor, currency)

  if (
    eligibility.outcome !== "eligible_for_approval" ||
    eligibility.approvableAmountMinor === null ||
    !context.order.paypalCaptureId
  ) {
    // A concurrent approval that won the claim makes this one look ineligible
    // (its attempt uses up the balance): report that refund instead.
    const current = await loadCase(admin, merchantId, caseId)
    if (
      current &&
      (inProgress(current.status) || current.status === "REFUNDED")
    ) {
      return existingAttemptResult(admin, merchantId, caseId, current.status)
    }
    await recordAuditEvent(admin, {
      merchantId,
      caseId,
      actor: { type: "user", id: member.userId },
      eventType: "refund.blocked",
      summary: `Refund approval blocked: ${eligibility.summary}`,
      metadata: {
        outcome: eligibility.outcome,
        reason_codes: eligibility.reasonCodes,
      },
    })
    return blocked("not_eligible", eligibility.summary)
  }

  const amountMinor = eligibility.approvableAmountMinor
  if (
    amountMinor !== confirmation.amountMinor ||
    currency !== confirmation.currencyCode
  ) {
    return blocked(
      "changed",
      `The refund amount is now ${money(amountMinor)}, not the ${formatMoney(confirmation.amountMinor, confirmation.currencyCode)} you confirmed. Review it and approve again.`,
    )
  }

  const attemptId = randomUUID()
  const idempotencyKey = randomUUID()
  const requestInput: RefundRequestInput = {
    captureId: context.order.paypalCaptureId,
    amountMinor,
    currency,
    settlixRefundId: attemptId,
  }

  const { data: attempt, error: claimError } = await admin.rpc(
    "claim_refund_attempt",
    {
      p_merchant_id: merchantId,
      p_case_id: caseId,
      p_attempt_id: attemptId,
      p_investigation_id: latest.id,
      p_amount_minor: amountMinor,
      p_currency: currency,
      p_approved_by: member.userId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: refundRequestHash(requestInput),
      p_approval_snapshot: {
        engine_version: eligibility.engineVersion,
        outcome: eligibility.outcome,
        context_hash: currentHash,
        investigation_id: latest.id,
        prompt_version: latest.promptVersion,
        amount_minor: amountMinor,
        currency,
        amounts: eligibility.amounts,
        checks: eligibility.checks.map((check) => ({
          key: check.key,
          status: check.status,
          code: check.code,
        })),
      } as unknown as Json,
    },
  )
  if (claimError) {
    const reason = claimError.message
    if (reason.includes("case_not_ready")) {
      // Most often a duplicate click that lost the race to the first one.
      const current = await loadCase(admin, merchantId, caseId)
      return current &&
        (inProgress(current.status) || current.status === "REFUNDED")
        ? existingAttemptResult(admin, merchantId, caseId, current.status)
        : blocked(
            "changed",
            "The case changed while you were approving. Refresh and review it again.",
          )
    }
    if (reason.includes("refund_in_progress")) {
      return blocked(
        "in_progress",
        "Another refund for this payment is still unresolved. Resolve it before approving a new one.",
      )
    }
    if (reason.includes("stale_investigation")) {
      return blocked(
        "changed",
        "A newer investigation exists. Review it before approving.",
      )
    }
    if (
      reason.includes("amount_exceeds_balance") ||
      reason.includes("no_capture_mapping") ||
      reason.includes("payment_not_refundable") ||
      reason.includes("currency_mismatch")
    ) {
      return blocked(
        "not_eligible",
        "The payment records no longer allow this refund. Re-run the investigation.",
      )
    }
    throw new Error("Could not record the approval", { cause: claimError })
  }

  return {
    attempt,
    requestInput,
    idempotencyKey,
    investigationId: latest.id,
    money: money(amountMinor),
  }
}

/**
 * Resolves a pending or uncertain attempt: reads the refund when PayPal gave us
 * its ID, otherwise replays the identical request with the same
 * PayPal-Request-Id (PayPal returns the original refund or creates it once).
 */
export async function reconcileRefund(
  member: Member,
  caseId: string,
  options: { paypal?: RefundGateway } = {},
): Promise<RefundResult> {
  const paypal = options.paypal ?? paypalGateway
  if (!can.approveRefunds(member.role)) {
    return blocked("forbidden", "Your role can't manage refunds.")
  }
  const merchantId = member.workspace.id
  const admin = createAdminClient()

  let attempt: Attempt
  try {
    const row = await loadCase(admin, merchantId, caseId)
    if (!row) return blocked("not_found", "Case not found.")
    const unresolved = await loadUnresolvedAttempt(admin, merchantId, caseId)
    if (!unresolved || !unresolved.capture_id) {
      return blocked("not_ready", "There is no unresolved refund to check.")
    }
    if (
      unresolved.status === "REQUESTED" &&
      Date.now() - Date.parse(unresolved.created_at) < IN_FLIGHT_MS
    ) {
      return blocked(
        "too_soon",
        "The refund request was just sent. Check again in a minute.",
      )
    }
    if (!(await consumeRateLimit(admin, merchantId, "refund.reconcile"))) {
      return blocked(
        "rate_limited",
        "This workspace has checked refunds with PayPal many times in the last 15 minutes. Wait a few minutes and try again.",
      )
    }
    attempt = unresolved
  } catch (error) {
    console.error("Refund reconciliation failed before PayPal", {
      caseId,
      reason: error instanceof Error ? error.message : "unknown",
    })
    return blocked(
      "unavailable",
      "Settlix couldn't load this refund, so PayPal wasn't contacted. The refund status is unchanged; try again shortly.",
    )
  }

  const expected = {
    attemptId: attempt.id,
    amountMinor: attempt.approved_amount_minor,
    currency: attempt.currency_code,
  }

  let outcome: RefundOutcome
  if (attempt.paypal_refund_id) {
    try {
      const refund = await paypal.getRefund(attempt.paypal_refund_id)
      outcome = outcomeFromRefund(expected, 200, refund)
    } catch (error) {
      return blocked(
        "unavailable",
        error instanceof PayPalError && error.kind === "rejected"
          ? "PayPal couldn't find this refund. It stays marked for recovery; contact support with the refund ID."
          : "PayPal couldn't be reached. The refund status is unchanged; try again shortly.",
      )
    }
  } else {
    const input = requestInputOf(attempt)
    if (refundRequestHash(input) !== attempt.request_hash) {
      return blocked(
        "unavailable",
        "The stored refund request doesn't match its fingerprint, so it won't be replayed. Escalate to an administrator.",
      )
    }
    try {
      const { httpStatus, refund } = await paypal.refund({
        ...input,
        requestId: attempt.idempotency_key,
      })
      outcome = outcomeFromRefund(expected, httpStatus, refund)
    } catch (error) {
      outcome = outcomeFromError(error)
    }
  }

  return applyOutcome(admin, merchantId, caseId, attempt, outcome, "reconcile")
}

const outcomeEvent: Record<RefundOutcome["status"], string> = {
  COMPLETED: "refund.completed",
  PENDING: "refund.pending",
  FAILED: "refund.failed",
  RECOVERY_REQUIRED: "refund.recovery_required",
}

const resultStatus = {
  COMPLETED: "completed",
  PENDING: "pending",
  FAILED: "failed",
  RECOVERY_REQUIRED: "recovery_required",
} as const

function outcomeMessage(outcome: RefundOutcome, amount: string): string {
  switch (outcome.status) {
    case "COMPLETED":
      return `PayPal sent ${amount} back to the customer. The receipt is ready.`
    case "PENDING":
      return `PayPal accepted the ${amount} refund but hasn't finished it yet. The request stays "Refund in progress" until PayPal confirms it.`
    case "FAILED": {
      const reason =
        (outcome.errorCode && refundIssueMessages[outcome.errorCode]) ??
        `PayPal declined it (${outcome.errorCode ?? "no reason given"}).`
      return `The ${amount} refund didn't go through. ${reason} No money was returned.`
    }
    case "RECOVERY_REQUIRED":
      return `PayPal's answer about the ${amount} refund got lost, so Settlix can't tell yet whether it went through. Use "Check with PayPal" to ask about this same refund. Don't approve another one.`
  }
}

async function applyOutcome(
  admin: Admin,
  merchantId: string,
  caseId: string,
  attempt: Attempt,
  outcome: RefundOutcome,
  source: "refund" | "reconcile",
): Promise<RefundResult> {
  const amount = formatMoney(
    attempt.approved_amount_minor,
    attempt.currency_code,
  )

  // Generated RPC types mark every argument required; SQL accepts nulls here.
  const args = {
    p_merchant_id: merchantId,
    p_attempt_id: attempt.id,
    p_status: outcome.status,
    p_paypal_refund_id: outcome.paypalRefundId,
    p_response_code: outcome.responseCode,
    p_response_summary: outcome.responseSummary,
    p_error_code: outcome.errorCode,
    p_debug_id: outcome.debugId,
  } as Database["public"]["Functions"]["record_refund_outcome"]["Args"]
  const { error } = await admin.rpc("record_refund_outcome", args)
  if (error) {
    console.error("Could not record refund outcome", {
      attemptId: attempt.id,
      status: outcome.status,
      reason: error.message,
    })
    return {
      status: "recovery_required",
      attemptId: attempt.id,
      refundId: outcome.paypalRefundId,
      message: `PayPal was asked to refund, but its answer couldn't be saved. Use "Check with PayPal" to see what happened. Don't approve another refund.`,
    }
  }

  // The outcome is already stored; a missing audit row must not turn a
  // recorded refund into an error for the merchant.
  await recordAuditEvent(admin, {
    merchantId,
    caseId,
    actor: { type: "system" },
    eventType: outcomeEvent[outcome.status],
    summary:
      source === "reconcile"
        ? `Checked with PayPal: ${outcomeMessage(outcome, amount)}`
        : outcomeMessage(outcome, amount),
    metadata: {
      attempt_id: attempt.id,
      paypal_refund_id: outcome.paypalRefundId,
      response_code: outcome.responseCode,
      error_code: outcome.errorCode,
      paypal_debug_id: outcome.debugId,
      source,
    },
  }).catch(() => {
    console.error("Could not record the refund outcome event", {
      attemptId: attempt.id,
      status: outcome.status,
    })
  })

  return {
    status: resultStatus[outcome.status],
    attemptId: attempt.id,
    refundId: outcome.paypalRefundId,
    message: outcomeMessage(outcome, amount),
  }
}
