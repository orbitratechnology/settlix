import { createHash } from "node:crypto"

import type {
  CaseStatus,
  ClauseType,
  PaymentState,
  RefundAttemptStatus,
  RequestCategory,
} from "@/lib/domain/labels"
import type { Enums } from "@/types/database"

/**
 * Everything an investigation is allowed to see, built from merchant-scoped
 * records on the server. It deliberately leaves out the customer's email, the
 * case status (which changes while investigating), and anything time-of-day
 * dependent, so the same evidence always hashes to the same value.
 */
export type InvestigationContext = {
  case: {
    caseId: string
    caseNumber: string
    origin: Enums<"data_origin">
    customerDisplayName: string
    customerMessage: string
    claimedIssue: string
    requestCategory: RequestCategory
    requestedAmountMinor: number | null
    currencyCode: string
    merchantNotes: string | null
    requestReceivedAt: string
  }
  order: {
    orderId: string
    externalReference: string
    description: string
    originalAmountMinor: number
    currencyCode: string
    paymentState: PaymentState
    capturedAt: string | null
    paypalOrderId: string | null
    paypalCaptureId: string | null
    origin: Enums<"data_origin">
  }
  /** Every refund attempt against the order, from any case. */
  refundHistory: RefundAttemptFact[]
  /** Active, published policy versions of the merchant. */
  policies: PolicySnapshot[]
}

export type RefundAttemptFact = {
  attemptId: string
  caseId: string
  status: RefundAttemptStatus
  amountMinor: number
  currencyCode: string
  origin: Enums<"data_origin">
  paypalRefundId: string | null
  createdAt: string
}

export type PolicySnapshot = {
  policyId: string
  name: string
  version: number
  effectiveFrom: string
  effectiveUntil: string | null
  returnWindowDays: number | null
  manualReviewAboveMinor: number | null
  clauses: Array<{
    clauseId: string
    clauseKey: string
    title: string
    clauseType: ClauseType
    content: string
  }>
}

const UNRESOLVED: ReadonlySet<RefundAttemptStatus> = new Set([
  "REQUESTED",
  "PENDING",
  "RECOVERY_REQUIRED",
])

/** Case states in which a refund is underway or done, so nothing may change. */
export const LOCKED_CASE_STATUSES: ReadonlySet<CaseStatus> = new Set([
  "REFUND_PENDING",
  "REFUNDED",
  "RECOVERY_REQUIRED",
])

export type PaymentFacts = {
  capturedMinor: number
  /** Sum of COMPLETED attempts. */
  confirmedRefundedMinor: number
  /** Sum of REQUESTED, PENDING, and RECOVERY_REQUIRED attempts. */
  unresolvedMinor: number
  /** Captured minus confirmed and unresolved amounts, never below zero. */
  remainingMinor: number
  hasUnresolvedAttempt: boolean
  /** Whole days from capture to the refund request; null when not captured. */
  daysFromCaptureToRequest: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Deterministic money and timing facts derived from stored records. */
export function derivePaymentFacts(
  context: InvestigationContext,
): PaymentFacts {
  const { order } = context
  let confirmedRefundedMinor = 0
  let unresolvedMinor = 0
  for (const attempt of context.refundHistory) {
    if (attempt.currencyCode !== order.currencyCode) continue
    if (attempt.status === "COMPLETED") {
      confirmedRefundedMinor += attempt.amountMinor
    } else if (UNRESOLVED.has(attempt.status)) {
      unresolvedMinor += attempt.amountMinor
    }
  }

  const capturedMinor = order.originalAmountMinor
  const daysFromCaptureToRequest = order.capturedAt
    ? Math.floor(
        (Date.parse(context.case.requestReceivedAt) -
          Date.parse(order.capturedAt)) /
          DAY_MS,
      )
    : null

  return {
    capturedMinor,
    confirmedRefundedMinor,
    unresolvedMinor,
    remainingMinor: Math.max(
      0,
      capturedMinor - confirmedRefundedMinor - unresolvedMinor,
    ),
    hasUnresolvedAttempt: context.refundHistory.some((attempt) =>
      UNRESOLVED.has(attempt.status),
    ),
    daysFromCaptureToRequest,
  }
}

/** JSON with object keys sorted at every level, for stable hashing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return Object.fromEntries(
        Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      )
    }
    return nested
  })
}

/**
 * SHA-256 of the evidence an investigation used. A different hash at approval
 * time means the recommendation was made on information that has since changed.
 */
export function contextHash(context: InvestigationContext): string {
  return createHash("sha256").update(canonicalJson(context)).digest("hex")
}
