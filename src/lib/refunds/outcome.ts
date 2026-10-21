import type { RefundAttemptStatus } from "@/lib/domain/labels"
import { PayPalError } from "@/lib/paypal/errors"
import { payPalToMinor } from "@/lib/paypal/money"
import type { PayPalRefund } from "@/lib/paypal/types"
import type { Json } from "@/types/database"

/**
 * What a PayPal refund call means for a Settlix refund attempt
 * (references/refunds.md state machine):
 * - only `status: COMPLETED` that matches the approved intent is COMPLETED;
 * - PENDING stays pending; FAILED / CANCELLED and definitive 4xx errors mean
 *   no money moved;
 * - anything uncertain (timeouts, network errors, POST 5xx, 202, 409, 429, an
 *   unreadable or mismatching body) is RECOVERY_REQUIRED and is reconciled by
 *   replaying the same request ID, never by a new refund.
 */
export type RefundOutcome = {
  status: Exclude<RefundAttemptStatus, "REQUESTED">
  paypalRefundId: string | null
  responseCode: number | null
  /** Sanitized: status, amounts, and timestamps only. No payer data. */
  responseSummary: Json | null
  errorCode: string | null
  debugId: string | null
}

export type RefundExpectation = {
  attemptId: string
  amountMinor: number
  currency: string
}

const PAYPAL_ID = /^[A-Za-z0-9-]{10,64}$/

function summarize(refund: PayPalRefund): Json {
  return {
    status: refund.status,
    amount: refund.amount ?? null,
    status_reason: refund.status_details?.reason ?? null,
    total_refunded_amount:
      refund.seller_payable_breakdown?.total_refunded_amount ?? null,
    create_time: refund.create_time ?? null,
    update_time: refund.update_time ?? null,
  }
}

function matchesIntent(refund: PayPalRefund, expected: RefundExpectation) {
  if (
    refund.custom_id !== undefined &&
    refund.custom_id !== expected.attemptId
  ) {
    return false
  }
  if (!refund.amount) return true
  if (refund.amount.currency_code !== expected.currency) return false
  try {
    return payPalToMinor(refund.amount) === expected.amountMinor
  } catch {
    return false
  }
}

/** Interprets a 2xx refund response (POST or replay) or a GET of the refund. */
export function outcomeFromRefund(
  expected: RefundExpectation,
  httpStatus: number,
  refund: PayPalRefund | null | undefined,
): RefundOutcome {
  const base = {
    responseCode: httpStatus,
    debugId: null,
  }
  if (
    httpStatus === 202 ||
    !refund ||
    typeof refund.id !== "string" ||
    !PAYPAL_ID.test(refund.id) ||
    typeof refund.status !== "string"
  ) {
    return {
      ...base,
      status: "RECOVERY_REQUIRED",
      paypalRefundId: null,
      responseSummary: refund ? summarize(refund) : null,
      errorCode: "UNCONFIRMED_RESPONSE",
    }
  }

  const responseSummary = summarize(refund)
  const paypalRefundId = refund.id

  if (refund.status === "COMPLETED" || refund.status === "PENDING") {
    if (!matchesIntent(refund, expected)) {
      return {
        ...base,
        status: "RECOVERY_REQUIRED",
        paypalRefundId,
        responseSummary,
        errorCode: "RESPONSE_MISMATCH",
      }
    }
    return {
      ...base,
      status: refund.status,
      paypalRefundId,
      responseSummary,
      errorCode: null,
    }
  }
  if (refund.status === "FAILED" || refund.status === "CANCELLED") {
    return {
      ...base,
      status: "FAILED",
      paypalRefundId,
      responseSummary,
      errorCode: `REFUND_${refund.status}`,
    }
  }
  return {
    ...base,
    status: "RECOVERY_REQUIRED",
    paypalRefundId,
    responseSummary,
    errorCode: "UNKNOWN_STATUS",
  }
}

/** Interprets a failed refund POST. Only a definitive rejection is FAILED. */
export function outcomeFromError(error: unknown): RefundOutcome {
  if (error instanceof PayPalError) {
    const code = (
      error.issue ??
      error.errorName ??
      (error.kind === "rejected"
        ? `HTTP_${error.httpStatus ?? "ERROR"}`
        : `PAYPAL_${error.kind.toUpperCase()}`)
    ).slice(0, 128)
    return {
      status: error.kind === "rejected" ? "FAILED" : "RECOVERY_REQUIRED",
      paypalRefundId: null,
      responseCode:
        error.httpStatus && error.httpStatus >= 100 && error.httpStatus <= 599
          ? error.httpStatus
          : null,
      responseSummary: null,
      errorCode: code,
      debugId: error.debugId?.slice(0, 64) ?? null,
    }
  }
  return {
    status: "RECOVERY_REQUIRED",
    paypalRefundId: null,
    responseCode: null,
    responseSummary: null,
    errorCode: "UNEXPECTED_ERROR",
    debugId: null,
  }
}

/** Merchant-facing explanations for common PayPal refund issues. */
export const refundIssueMessages: Record<string, string> = {
  CAPTURE_FULLY_REFUNDED:
    "PayPal shows this payment as already fully refunded.",
  REFUND_AMOUNT_EXCEEDED:
    "The amount is more than PayPal shows as refundable for this payment.",
  REFUND_TIME_LIMIT_EXCEEDED:
    "The payment is too old to refund through PayPal.",
  REFUND_FAILED_INSUFFICIENT_FUNDS:
    "The merchant PayPal account doesn't have enough funds for this refund.",
  TRANSACTION_DISPUTED:
    "The payment is under dispute, so PayPal won't refund it.",
  REFUND_NOT_PERMITTED_DUE_TO_CHARGEBACK:
    "The payment has a chargeback, so PayPal won't refund it.",
  PERMISSION_DENIED: "The PayPal app isn't allowed to refund this payment.",
  PARTIAL_REFUND_NOT_ALLOWED: "PayPal doesn't allow a partial refund here.",
  REFUND_CAPTURE_CURRENCY_MISMATCH:
    "The refund currency doesn't match the payment currency.",
  REFUND_FAILED: "PayPal reported the refund as failed.",
  REFUND_CANCELLED: "PayPal cancelled the refund.",
}
