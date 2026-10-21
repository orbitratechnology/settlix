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
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database, Json, Tables } from "@/types/database"

type Admin = ReturnType<typeof createAdminClient>
type Attempt = Tables<"refund_attempts">

/** A REQUESTED attempt younger than this may still have its first call in flight. */
const IN_FLIGHT_MS = 60 * 1000

export type RefundConfirmation = {
  investigationId: string
  amountMinor: number
  currencyCode: string
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
        | "too_soon"
        | "unavailable"
      message: string
    }

/** HTTP status for each blocked reason, used by the JSON routes. */
export const blockedHttpStatus: Record<
  Extract<RefundResult, { status: "blocked" }>["code"],
  number
> = {
  forbidden: 403,
  not_found: 404,
  not_ready: 409,
  changed: 409,
  not_eligible: 422,
  in_progress: 409,
  too_soon: 409,
  unavailable: 503,
}

const blocked = (
  code: Extract<RefundResult, { status: "blocked" }>["code"],
  message: string,
): RefundResult => ({ status: "blocked", code, message })

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
): Promise<RefundResult> {
  if (!can.approveRefunds(member.role)) {
    return blocked("forbidden", "Your role can't approve refunds.")
  }
  const merchantId = member.workspace.id
  const admin = createAdminClient()

  const row = await loadCase(admin, merchantId, caseId)
  if (!row) return blocked("not_found", "Case not found.")
  if (inProgress(row.status)) {
    return blocked(
      "in_progress",
      "A refund for this case is already being processed. Check its status instead of approving again.",
    )
  }
  if (row.status !== "READY_FOR_APPROVAL") {
    return blocked(
      "not_ready",
      row.status === "REFUNDED"
        ? "This case has already been refunded."
        : "Only a case that is ready for approval can be refunded.",
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
      return current && inProgress(current.status)
        ? blocked(
            "in_progress",
            "This refund is already being processed. Check its status instead of approving again.",
          )
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

  await recordAuditEvent(admin, {
    merchantId,
    caseId,
    actor: { type: "user", id: member.userId },
    eventType: "refund.approved",
    summary: `Approved a ${money(amountMinor)} refund to the buyer's PayPal account. Refund attempt recorded before calling PayPal.`,
    metadata: {
      attempt_id: attempt.id,
      investigation_id: latest.id,
      amount_minor: amountMinor,
      currency,
      paypal_capture_id: requestInput.captureId,
      context_hash: currentHash,
    },
  })

  let outcome: RefundOutcome
  try {
    const { httpStatus, refund } = await refundPayPalCapture({
      ...requestInput,
      requestId: idempotencyKey,
    })
    outcome = outcomeFromRefund(
      { attemptId: attempt.id, amountMinor, currency },
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

/**
 * Resolves a pending or uncertain attempt: reads the refund when PayPal gave us
 * its ID, otherwise replays the identical request with the same
 * PayPal-Request-Id (PayPal returns the original refund or creates it once).
 */
export async function reconcileRefund(
  member: Member,
  caseId: string,
): Promise<RefundResult> {
  if (!can.approveRefunds(member.role)) {
    return blocked("forbidden", "Your role can't manage refunds.")
  }
  const merchantId = member.workspace.id
  const admin = createAdminClient()

  const row = await loadCase(admin, merchantId, caseId)
  if (!row) return blocked("not_found", "Case not found.")
  const attempt = await loadUnresolvedAttempt(admin, merchantId, caseId)
  if (!attempt || !attempt.capture_id) {
    return blocked("not_ready", "There is no unresolved refund to check.")
  }
  if (
    attempt.status === "REQUESTED" &&
    Date.now() - Date.parse(attempt.created_at) < IN_FLIGHT_MS
  ) {
    return blocked(
      "too_soon",
      "The refund request was just sent. Check again in a minute.",
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
      const refund = await getPayPalRefund(attempt.paypal_refund_id)
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
      const { httpStatus, refund } = await refundPayPalCapture({
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
      return `PayPal completed the ${amount} refund (refund ${outcome.paypalRefundId}).`
    case "PENDING":
      return `PayPal accepted the ${amount} refund (refund ${outcome.paypalRefundId}), but it is still pending. The case stays pending until PayPal confirms it.`
    case "FAILED": {
      const reason =
        (outcome.errorCode && refundIssueMessages[outcome.errorCode]) ??
        `PayPal declined it (${outcome.errorCode ?? "no reason given"}).`
      return `The ${amount} refund didn't go through. ${reason} No money was returned.`
    }
    case "RECOVERY_REQUIRED":
      return `PayPal's answer for the ${amount} refund couldn't be confirmed (${outcome.errorCode ?? "unknown"}). It is marked for recovery: use "Check with PayPal" to reconcile with the same request. Don't approve another refund.`
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
      message: `PayPal was called, but its answer couldn't be saved. The refund stays pending; use "Check with PayPal" to reconcile. Don't approve another refund.`,
    }
  }

  await recordAuditEvent(admin, {
    merchantId,
    caseId,
    actor: { type: "system" },
    eventType: outcomeEvent[outcome.status],
    summary:
      source === "reconcile"
        ? `Reconciled with PayPal: ${outcomeMessage(outcome, amount)}`
        : outcomeMessage(outcome, amount),
    metadata: {
      attempt_id: attempt.id,
      paypal_refund_id: outcome.paypalRefundId,
      response_code: outcome.responseCode,
      error_code: outcome.errorCode,
      paypal_debug_id: outcome.debugId,
      source,
    },
  })

  return {
    status: resultStatus[outcome.status],
    attemptId: attempt.id,
    refundId: outcome.paypalRefundId,
    message: outcomeMessage(outcome, amount),
  }
}
