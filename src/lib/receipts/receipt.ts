import {
  caseStatusMeta,
  eligibilityOutcomeMeta,
  proposedActionMeta,
  requestCategoryLabels,
  type CaseStatus,
  type PaymentState,
  type RefundAttemptStatus,
  type RequestCategory,
} from "@/lib/domain/labels"
import type { InvestigationRecord } from "@/lib/investigations/records"
import { formatMoney } from "@/lib/money/amounts"
import { formatDateTime } from "@/lib/format"
import type { EligibilityOutcome } from "@/lib/policy/eligibility"
import type { Enums } from "@/types/database"

/** Everything a Resolution Receipt shows, read from persisted records only. */
export type Receipt = {
  caseId: string
  caseNumber: string
  caseStatus: CaseStatus
  origin: Enums<"data_origin">
  merchantName: string
  customerName: string
  customerMessage: string
  claimedIssue: string
  category: RequestCategory
  requestedMinor: number | null
  currency: string
  openedAt: string
  order: {
    reference: string
    description: string
    capturedMinor: number
    currency: string
    paymentState: PaymentState
    paypalOrderId: string | null
    paypalCaptureId: string | null
    origin: Enums<"data_origin">
  }
  /** The investigation the refund was approved on, else the latest one. */
  investigation: InvestigationRecord | null
  /** The most recent refund attempt, if any. */
  attempt: ReceiptAttempt | null
}

export type ReceiptAttempt = {
  id: string
  origin: Enums<"data_origin">
  status: RefundAttemptStatus
  approvedMinor: number
  currency: string
  approvedAt: string
  approvedBy: string | null
  paypalRefundId: string | null
  /** Refund status and amount exactly as PayPal last reported them. */
  paypalStatus: string | null
  paypalAmount: { value: string; currency_code: string } | null
  responseCode: number | null
  errorCode: string | null
  debugId: string | null
  /** Eligibility outcome the server computed when the merchant approved. */
  approvalOutcome: EligibilityOutcome | null
}

type Tone =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"

export type ReceiptState = {
  label: string
  tone: Tone
  description: string
}

const REFUND_STATES: ReadonlySet<CaseStatus> = new Set([
  "REFUND_PENDING",
  "REFUNDED",
  "RECOVERY_REQUIRED",
  "REFUND_FAILED",
])

/**
 * FR-14 receipt states. A refund state comes from the refund attempt; only a
 * COMPLETED attempt from the app reads as a completed refund.
 */
export function receiptState(receipt: Receipt): ReceiptState {
  const { attempt, caseStatus } = receipt
  if (attempt && REFUND_STATES.has(caseStatus)) {
    if (attempt.origin === "seed") {
      return {
        label: "Demo record",
        tone: "outline",
        description: "Seeded example. No PayPal refund was executed.",
      }
    }
    switch (attempt.status) {
      case "COMPLETED":
        return {
          label: "Refund completed",
          tone: "success",
          description: "PayPal confirmed the refund as completed.",
        }
      case "REQUESTED":
      case "PENDING":
        return {
          label: "Refund pending",
          tone: "info",
          description:
            "Sent to PayPal and not completed yet. This is not a completed refund.",
        }
      case "RECOVERY_REQUIRED":
        return {
          label: "Recovery required",
          tone: "destructive",
          description:
            "PayPal's answer couldn't be confirmed. The refund must be reconciled before anything else happens.",
        }
      case "FAILED":
        return {
          label: "Refund failed",
          tone: "destructive",
          description: "The refund didn't go through. No money was returned.",
        }
    }
  }
  switch (caseStatus) {
    case "READY_FOR_APPROVAL":
      return {
        label: "Awaiting decision",
        tone: "info",
        description: "Eligible for approval. No refund has been approved.",
      }
    case "NEEDS_EVIDENCE":
      return {
        label: "Waiting for evidence",
        tone: "warning",
        description: "Evidence is needed before any refund decision.",
      }
    case "NEEDS_REVIEW":
      return {
        label: "Under review",
        tone: "warning",
        description: "A merchant must review the case.",
      }
    case "NOT_ELIGIBLE":
      return {
        label: "Closed without refund",
        tone: "outline",
        description: "No refund was issued.",
      }
    case "INVESTIGATING":
      return {
        label: "Investigation running",
        tone: "info",
        description: "An AI investigation is in progress.",
      }
    default:
      return receipt.investigation
        ? {
            label: "Recommendation prepared",
            tone: "secondary",
            description: "A recommendation exists. No decision has been made.",
          }
        : {
            label: "Not investigated",
            tone: "secondary",
            description: caseStatusMeta[caseStatus].description,
          }
  }
}

/**
 * A reply that states only what the records prove. A completed or pending
 * refund gets a factual message; otherwise the AI draft is offered.
 */
export function receiptReply(receipt: Receipt): string | null {
  const { attempt } = receipt
  if (attempt?.origin === "app" && REFUND_STATES.has(receipt.caseStatus)) {
    const amount = formatMoney(attempt.approvedMinor, attempt.currency)
    if (attempt.status === "COMPLETED" && attempt.paypalRefundId) {
      return `Hi ${receipt.customerName},\n\nWe've refunded ${amount} for order ${receipt.order.reference} to your original PayPal payment method. PayPal reference: ${attempt.paypalRefundId}. PayPal has completed the refund; how soon it shows on your statement depends on your payment method.\n\nThank you for your patience.`
    }
    if (attempt.status === "PENDING" || attempt.status === "REQUESTED") {
      return `Hi ${receipt.customerName},\n\nWe've submitted a refund of ${amount} for order ${receipt.order.reference} to PayPal. It is pending with PayPal right now, and we'll confirm once PayPal completes it.\n\nThank you for your patience.`
    }
  }
  return (
    receipt.investigation?.stored.recommendation.suggestedCustomerReply ?? null
  )
}

/** Plain-text receipt for copying into a ticket or email. */
export function receiptSummaryText(receipt: Receipt): string {
  const state = receiptState(receipt)
  const money = (minor: number, currency = receipt.currency) =>
    formatMoney(minor, currency)
  const lines = [
    `Settlix Resolution Receipt: ${receipt.caseNumber}`,
    `Merchant: ${receipt.merchantName} (PayPal Sandbox)`,
    `State: ${state.label}. ${state.description}`,
    `Order: ${receipt.order.reference}, ${receipt.order.description}, captured ${money(receipt.order.capturedMinor, receipt.order.currency)}`,
    `PayPal order: ${receipt.order.paypalOrderId ?? "none"}; capture: ${receipt.order.paypalCaptureId ?? "not linked"}`,
    `Request: ${requestCategoryLabels[receipt.category]}, "${receipt.claimedIssue}"; requested ${receipt.requestedMinor === null ? "no specific amount" : money(receipt.requestedMinor)}`,
  ]
  const investigation = receipt.investigation
  if (investigation) {
    const rec = investigation.stored.recommendation
    const amount =
      rec.proposedAmountMinor !== null && rec.currencyCode
        ? ` ${money(rec.proposedAmountMinor, rec.currencyCode)}`
        : ""
    const clauses = investigation.stored.citations
      .filter((c) => c.valid)
      .map((c) => `${c.clauseKey} (${c.policyName} v${c.policyVersion})`)
    lines.push(
      `AI recommendation: ${proposedActionMeta[rec.proposedAction].label}${amount} (${investigation.modelId}, prompt ${investigation.promptVersion}, ${formatDateTime(investigation.createdAt)})`,
      `Policy evidence: ${clauses.length ? clauses.join(", ") : "none cited"}`,
      `Checks at investigation: ${eligibilityOutcomeMeta[investigation.eligibility.outcome].label}`,
    )
  } else {
    lines.push("AI recommendation: none yet")
  }
  const attempt = receipt.attempt
  if (attempt) {
    if (attempt.origin === "seed") {
      lines.push("Refund: demo record; no PayPal refund was executed")
    } else {
      lines.push(
        `Approved: ${money(attempt.approvedMinor, attempt.currency)} by ${attempt.approvedBy ?? "unknown user"} at ${formatDateTime(attempt.approvedAt)}${attempt.approvalOutcome ? ` (checks at approval: ${eligibilityOutcomeMeta[attempt.approvalOutcome].label})` : ""}`,
        `Refund attempt: ${attempt.id} (${attempt.status})`,
        `PayPal refund: ${attempt.paypalRefundId ?? "no refund ID"}${attempt.paypalStatus ? `, status ${attempt.paypalStatus}` : ""}${attempt.paypalAmount ? `, ${attempt.paypalAmount.value} ${attempt.paypalAmount.currency_code}` : ""}${attempt.errorCode ? `, error ${attempt.errorCode}` : ""}`,
      )
    }
  } else {
    lines.push("Refund: none issued")
  }
  return lines.join("\n")
}
