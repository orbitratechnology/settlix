import { isRefundAction, type ResolutionRecommendation } from "@/lib/ai/schemas"
import type { CaseStatus } from "@/lib/domain/labels"
import {
  derivePaymentFacts,
  LOCKED_CASE_STATUSES,
  type InvestigationContext,
  type PaymentFacts,
} from "@/lib/investigations/context"
import { formatMoney } from "@/lib/money/amounts"
import type { CheckedCitation } from "@/lib/policy/citations"

/**
 * Deterministic eligibility engine (PRD FR-08). It runs outside the model and
 * can only make an outcome stricter than the AI recommendation: the AI can
 * never override a failed rule. The same function runs again at approval time.
 */

export const ELIGIBILITY_ENGINE_VERSION = "eligibility-v1"

export const eligibilityOutcomes = [
  "eligible_for_approval",
  "requires_evidence",
  "requires_review",
  "not_eligible",
  "blocked_by_payment_state",
] as const
export type EligibilityOutcome = (typeof eligibilityOutcomes)[number]

export const reasonCodes = [
  "CASE_LOCKED",
  "NO_CAPTURE_MAPPING",
  "PAYMENT_NOT_CAPTURED",
  "CURRENCY_MISMATCH",
  "ALREADY_FULLY_REFUNDED",
  "NO_REFUNDABLE_BALANCE",
  "REFUND_IN_PROGRESS",
  "REQUESTED_EXCEEDS_CAPTURE",
  "NO_APPLICABLE_POLICY",
  "OUTSIDE_RETURN_WINDOW",
  "ABOVE_REVIEW_THRESHOLD",
  "AI_REQUESTS_EVIDENCE",
  "AI_REQUESTS_REVIEW",
  "AI_NOT_ELIGIBLE",
  "INVALID_CITATION",
  "MISSING_CITATION",
  "EVIDENCE_MISSING",
  "CONTRADICTIONS_FOUND",
  "PROMPT_INJECTION_FLAGGED",
  "RISK_FLAGGED",
  "AMOUNT_CURRENCY_MISMATCH",
  "AMOUNT_MISSING",
  "AMOUNT_EXCEEDS_BALANCE",
  "AMOUNT_EXCEEDS_REQUEST",
  "STALE_RECOMMENDATION",
] as const
export type ReasonCode = (typeof reasonCodes)[number]

export type CheckKey =
  | "case_state"
  | "capture_mapping"
  | "payment_state"
  | "currency"
  | "refund_balance"
  | "unresolved_attempts"
  | "requested_amount"
  | "policy"
  | "return_window"
  | "review_threshold"
  | "ai_recommendation"
  | "citations"
  | "evidence"
  | "contradictions"
  | "risk_flags"
  | "refund_amount"
  | "freshness"

/** "fail" means the check stops the case from being approved. */
export type CheckStatus = "pass" | "fail" | "warning" | "not_applicable"

export type EligibilityCheck = {
  key: CheckKey
  label: string
  status: CheckStatus
  detail: string
  code: ReasonCode | null
  /** The outcome a failed check forces. */
  effect: EligibilityOutcome | null
}

export type EligibilityResult = {
  engineVersion: typeof ELIGIBILITY_ENGINE_VERSION
  outcome: EligibilityOutcome
  reasonCodes: ReasonCode[]
  checks: EligibilityCheck[]
  amounts: PaymentFacts & {
    currencyCode: string
    requestedMinor: number | null
    /** Server-computed refund amount for a refund recommendation. */
    proposedMinor: number | null
  }
  /** What a merchant could approve; null unless the outcome is eligible. */
  approvableAmountMinor: number | null
  summary: string
}

export type EligibilityInput = {
  context: InvestigationContext
  caseStatus: CaseStatus
  recommendation: ResolutionRecommendation
  citations: CheckedCitation[]
  /** Set at approval time to detect a recommendation made on older records. */
  freshness?: { recommendationHash: string; currentHash: string }
}

// Higher wins when checks disagree.
const severity: Record<EligibilityOutcome, number> = {
  eligible_for_approval: 0,
  requires_evidence: 1,
  not_eligible: 2,
  requires_review: 3,
  blocked_by_payment_state: 4,
}

// Blocks approval, but the case can still be investigated and worked
// (seeded demo orders have no PayPal capture).
const APPROVAL_ONLY_CODES: ReadonlySet<ReasonCode> = new Set([
  "NO_CAPTURE_MAPPING",
])

const REVIEW_RISK_FLAGS = new Set([
  "prompt_injection",
  "possible_fraud",
  "policy_conflict",
])

const actionLabels: Record<ResolutionRecommendation["proposedAction"], string> =
  {
    full_refund: "a full refund",
    partial_refund: "a partial refund",
    request_evidence: "requesting evidence",
    manual_review: "a manual review",
    not_eligible: "no refund (not eligible)",
  }

export const caseStatusForOutcome: Record<EligibilityOutcome, CaseStatus> = {
  eligible_for_approval: "READY_FOR_APPROVAL",
  requires_evidence: "NEEDS_EVIDENCE",
  requires_review: "NEEDS_REVIEW",
  not_eligible: "NOT_ELIGIBLE",
  blocked_by_payment_state: "NEEDS_REVIEW",
}

export function evaluateEligibility(
  input: EligibilityInput,
): EligibilityResult {
  const { context, recommendation } = input
  const { order } = context
  const currency = order.currencyCode
  const money = (minor: number) => formatMoney(minor, currency)
  const facts = derivePaymentFacts(context)
  const requested = context.case.requestedAmountMinor
  const refundAction = isRefundAction(recommendation.proposedAction)

  const checks: EligibilityCheck[] = []
  const pass = (key: CheckKey, label: string, detail: string) =>
    checks.push({
      key,
      label,
      status: "pass",
      detail,
      code: null,
      effect: null,
    })
  const fail = (
    key: CheckKey,
    label: string,
    code: ReasonCode,
    effect: EligibilityOutcome,
    detail: string,
  ) => checks.push({ key, label, status: "fail", detail, code, effect })
  const warn = (
    key: CheckKey,
    label: string,
    detail: string,
    code: ReasonCode | null = null,
  ) =>
    checks.push({ key, label, status: "warning", detail, code, effect: null })
  const skip = (key: CheckKey, label: string, detail: string) =>
    checks.push({
      key,
      label,
      status: "not_applicable",
      detail,
      code: null,
      effect: null,
    })

  // 1. Case state
  if (LOCKED_CASE_STATUSES.has(input.caseStatus)) {
    fail(
      "case_state",
      "Case state",
      "CASE_LOCKED",
      "blocked_by_payment_state",
      "A refund for this case is already underway or complete.",
    )
  } else {
    pass("case_state", "Case state", "The case is open for a decision.")
  }

  // 2. Mapped order and capture
  if (order.origin === "seed") {
    fail(
      "capture_mapping",
      "PayPal capture",
      "NO_CAPTURE_MAPPING",
      "blocked_by_payment_state",
      "Demo order: not linked to a PayPal Sandbox capture, so it can't be refunded.",
    )
  } else if (!order.paypalCaptureId) {
    fail(
      "capture_mapping",
      "PayPal capture",
      "NO_CAPTURE_MAPPING",
      "blocked_by_payment_state",
      "No PayPal capture is linked to this order.",
    )
  } else {
    pass(
      "capture_mapping",
      "PayPal capture",
      `Linked to PayPal capture ${order.paypalCaptureId}.`,
    )
  }

  // 3. Payment and capture state
  if (order.paymentState === "REFUNDED") {
    fail(
      "payment_state",
      "Payment state",
      "ALREADY_FULLY_REFUNDED",
      "blocked_by_payment_state",
      "The payment has already been fully refunded.",
    )
  } else if (
    order.paymentState === "CAPTURED" ||
    order.paymentState === "PARTIALLY_REFUNDED"
  ) {
    pass("payment_state", "Payment state", "The payment was captured.")
  } else {
    fail(
      "payment_state",
      "Payment state",
      "PAYMENT_NOT_CAPTURED",
      "blocked_by_payment_state",
      "The payment was never captured, so there is nothing to refund.",
    )
  }

  // 4. Currency consistency
  if (context.case.currencyCode !== currency) {
    fail(
      "currency",
      "Currency",
      "CURRENCY_MISMATCH",
      "blocked_by_payment_state",
      `The case is in ${context.case.currencyCode} but the payment is in ${currency}.`,
    )
  } else {
    pass("currency", "Currency", `Case and payment are both in ${currency}.`)
  }

  // 5 & 7. Remaining refundable balance and prior refunds
  if (facts.remainingMinor > 0) {
    pass(
      "refund_balance",
      "Refundable balance",
      `${money(facts.remainingMinor)} of ${money(facts.capturedMinor)} can still be refunded.`,
    )
  } else if (facts.confirmedRefundedMinor >= facts.capturedMinor) {
    fail(
      "refund_balance",
      "Refundable balance",
      "ALREADY_FULLY_REFUNDED",
      "blocked_by_payment_state",
      `${money(facts.confirmedRefundedMinor)} has already been refunded. Nothing is left to refund.`,
    )
  } else {
    fail(
      "refund_balance",
      "Refundable balance",
      "NO_REFUNDABLE_BALANCE",
      "blocked_by_payment_state",
      "Unresolved refund attempts cover the whole remaining balance.",
    )
  }

  // 8. Pending or uncertain attempts
  if (facts.hasUnresolvedAttempt) {
    fail(
      "unresolved_attempts",
      "Refunds in progress",
      "REFUND_IN_PROGRESS",
      "blocked_by_payment_state",
      "An earlier refund attempt is still pending or needs reconciliation.",
    )
  } else {
    pass(
      "unresolved_attempts",
      "Refunds in progress",
      "No refund attempt is pending or unresolved.",
    )
  }

  // 6. Requested amount
  if (requested === null) {
    skip(
      "requested_amount",
      "Requested amount",
      "The customer didn't state an amount.",
    )
  } else if (requested > facts.capturedMinor) {
    fail(
      "requested_amount",
      "Requested amount",
      "REQUESTED_EXCEEDS_CAPTURE",
      "requires_review",
      `The customer asked for ${money(requested)}, more than the ${money(facts.capturedMinor)} captured.`,
    )
  } else {
    pass(
      "requested_amount",
      "Requested amount",
      `${money(requested)} requested, within the captured amount.`,
    )
  }

  // 9. Applicable policy, return window, review threshold
  const policies = context.policies
  if (policies.length === 0) {
    fail(
      "policy",
      "Applicable policy",
      "NO_APPLICABLE_POLICY",
      "requires_review",
      "No active return policy applies, so a merchant must decide.",
    )
  } else {
    pass(
      "policy",
      "Applicable policy",
      policies.map((p) => `${p.name} v${p.version}`).join(", "),
    )
  }

  const windows = policies
    .map((p) => p.returnWindowDays)
    .filter((days): days is number => days !== null)
  const days = facts.daysFromCaptureToRequest
  if (windows.length === 0 || days === null) {
    skip(
      "return_window",
      "Return window",
      days === null
        ? "No capture date to measure the window from."
        : "The policy sets no return window.",
    )
  } else {
    // The most generous active window: a stricter clause is the AI's call.
    const window = Math.max(...windows)
    const elapsed = Math.max(0, days)
    if (elapsed > window) {
      fail(
        "return_window",
        "Return window",
        "OUTSIDE_RETURN_WINDOW",
        "not_eligible",
        `Requested ${elapsed} days after capture; the window is ${window} days.`,
      )
    } else {
      pass(
        "return_window",
        "Return window",
        `Requested ${elapsed} days after capture, within the ${window}-day window.`,
      )
    }
  }

  // Server-side refund amount for a refund recommendation.
  let refundAmount: number | null = null
  if (refundAction && facts.remainingMinor > 0) {
    refundAmount =
      recommendation.proposedAction === "full_refund"
        ? facts.remainingMinor
        : recommendation.proposedAmountMinor
  }

  const thresholds = policies
    .map((p) => p.manualReviewAboveMinor)
    .filter((value): value is number => value !== null)
  if (thresholds.length === 0) {
    skip(
      "review_threshold",
      "Review threshold",
      "The policy sets no review threshold.",
    )
  } else {
    const threshold = Math.min(...thresholds)
    const amount = Math.max(requested ?? 0, refundAmount ?? 0)
    if (amount > threshold) {
      fail(
        "review_threshold",
        "Review threshold",
        "ABOVE_REVIEW_THRESHOLD",
        "requires_review",
        `${money(amount)} is above the ${money(threshold)} manual-review threshold.`,
      )
    } else {
      pass(
        "review_threshold",
        "Review threshold",
        `Below the ${money(threshold)} manual-review threshold.`,
      )
    }
  }

  // 10. Recommendation, citations, evidence, consistency, risk
  const action = recommendation.proposedAction
  const recommended = `Claude recommends ${actionLabels[action]}.`
  if (action === "request_evidence") {
    fail(
      "ai_recommendation",
      "AI recommendation",
      "AI_REQUESTS_EVIDENCE",
      "requires_evidence",
      recommended,
    )
  } else if (action === "manual_review") {
    fail(
      "ai_recommendation",
      "AI recommendation",
      "AI_REQUESTS_REVIEW",
      "requires_review",
      recommended,
    )
  } else if (action === "not_eligible") {
    fail(
      "ai_recommendation",
      "AI recommendation",
      "AI_NOT_ELIGIBLE",
      "not_eligible",
      recommended,
    )
  } else {
    pass("ai_recommendation", "AI recommendation", recommended)
  }

  const invalid = input.citations.filter((c) => !c.valid)
  const valid = input.citations.length - invalid.length
  if (invalid.length > 0) {
    fail(
      "citations",
      "Policy citations",
      "INVALID_CITATION",
      "requires_review",
      `${invalid.length} citation${invalid.length === 1 ? "" : "s"} could not be matched to stored policy text.`,
    )
  } else if (valid === 0 && refundAction) {
    fail(
      "citations",
      "Policy citations",
      "MISSING_CITATION",
      "requires_review",
      "A refund recommendation must cite the policy clauses it relies on.",
    )
  } else if (valid === 0) {
    warn(
      "citations",
      "Policy citations",
      "No policy clause was cited.",
      "MISSING_CITATION",
    )
  } else {
    pass(
      "citations",
      "Policy citations",
      `${valid} cited clause${valid === 1 ? "" : "s"} verified against stored policy text.`,
    )
  }

  const missing = recommendation.evidenceMissing.length
  if (missing > 0 && refundAction) {
    fail(
      "evidence",
      "Required evidence",
      "EVIDENCE_MISSING",
      "requires_evidence",
      `${missing} required item${missing === 1 ? " is" : "s are"} missing.`,
    )
  } else if (missing > 0) {
    warn(
      "evidence",
      "Required evidence",
      `${missing} required item${missing === 1 ? " is" : "s are"} missing.`,
      "EVIDENCE_MISSING",
    )
  } else {
    pass("evidence", "Required evidence", "No required evidence is missing.")
  }

  const contradictions = recommendation.contradictions.length
  if (contradictions > 0) {
    fail(
      "contradictions",
      "Consistent facts",
      "CONTRADICTIONS_FOUND",
      "requires_review",
      `${contradictions} contradiction${contradictions === 1 ? "" : "s"} found in the case facts.`,
    )
  } else {
    pass("contradictions", "Consistent facts", "No contradictions found.")
  }

  const flags = recommendation.riskFlags
  const reviewFlags = flags.filter((flag) => REVIEW_RISK_FLAGS.has(flag.code))
  if (reviewFlags.length > 0) {
    const injection = reviewFlags.some((f) => f.code === "prompt_injection")
    fail(
      "risk_flags",
      "Risk flags",
      injection ? "PROMPT_INJECTION_FLAGGED" : "RISK_FLAGGED",
      "requires_review",
      injection
        ? "The customer text tries to instruct the AI. It was treated as data."
        : "A risk flag requires a merchant review.",
    )
  } else if (flags.length > 0) {
    warn(
      "risk_flags",
      "Risk flags",
      `${flags.length} risk note${flags.length === 1 ? "" : "s"} to consider.`,
    )
  } else {
    pass("risk_flags", "Risk flags", "No risk flags.")
  }

  // 5. Refund amount
  if (!refundAction) {
    skip("refund_amount", "Refund amount", "No refund is recommended.")
  } else if (facts.remainingMinor === 0) {
    skip("refund_amount", "Refund amount", "There is no refundable balance.")
  } else if (
    recommendation.currencyCode !== null &&
    recommendation.currencyCode !== currency
  ) {
    fail(
      "refund_amount",
      "Refund amount",
      "AMOUNT_CURRENCY_MISMATCH",
      "requires_review",
      `The recommendation is in ${recommendation.currencyCode}, not ${currency}.`,
    )
  } else if (refundAmount === null || refundAmount <= 0) {
    fail(
      "refund_amount",
      "Refund amount",
      "AMOUNT_MISSING",
      "requires_review",
      "The partial refund has no valid amount.",
    )
  } else if (refundAmount > facts.remainingMinor) {
    fail(
      "refund_amount",
      "Refund amount",
      "AMOUNT_EXCEEDS_BALANCE",
      "requires_review",
      `${money(refundAmount)} is more than the ${money(facts.remainingMinor)} refundable balance.`,
    )
  } else if (requested !== null && refundAmount > requested) {
    fail(
      "refund_amount",
      "Refund amount",
      "AMOUNT_EXCEEDS_REQUEST",
      "requires_review",
      `${money(refundAmount)} is more than the ${money(requested)} the customer asked for.`,
    )
  } else {
    const note =
      action === "full_refund" &&
      recommendation.proposedAmountMinor !== null &&
      recommendation.proposedAmountMinor !== refundAmount
        ? ` (Claude suggested ${money(recommendation.proposedAmountMinor)}; a full refund is the remaining balance.)`
        : ""
    pass(
      "refund_amount",
      "Refund amount",
      `${money(refundAmount)} of ${money(facts.remainingMinor)} refundable.${note}`,
    )
  }

  // 12. Recommendation still based on current records
  if (
    input.freshness &&
    input.freshness.recommendationHash !== input.freshness.currentHash
  ) {
    fail(
      "freshness",
      "Current records",
      "STALE_RECOMMENDATION",
      "requires_review",
      "The case, payment, or policy changed after this investigation. Run it again.",
    )
  } else {
    pass(
      "freshness",
      "Current records",
      "Based on the current case, payment, and policy records.",
    )
  }

  let outcome: EligibilityOutcome = "eligible_for_approval"
  let approvalBlocked = false
  for (const check of checks) {
    if (check.status !== "fail" || !check.effect) continue
    if (check.code && APPROVAL_ONLY_CODES.has(check.code)) {
      approvalBlocked = true
    } else if (severity[check.effect] > severity[outcome]) {
      outcome = check.effect
    }
  }
  if (outcome === "eligible_for_approval" && approvalBlocked) {
    outcome = "blocked_by_payment_state"
  }

  const failed = checks.filter((check) => check.status === "fail")
  const approvableAmountMinor =
    outcome === "eligible_for_approval" ? refundAmount : null

  return {
    engineVersion: ELIGIBILITY_ENGINE_VERSION,
    outcome,
    reasonCodes: [...new Set(failed.flatMap((check) => check.code ?? []))],
    checks,
    amounts: {
      ...facts,
      currencyCode: currency,
      requestedMinor: requested,
      proposedMinor: refundAmount,
    },
    approvableAmountMinor,
    summary: summarize(outcome, failed, approvableAmountMinor, money),
  }
}

function summarize(
  outcome: EligibilityOutcome,
  failed: EligibilityCheck[],
  amount: number | null,
  money: (minor: number) => string,
) {
  const first = failed.find((check) => check.effect === outcome) ?? failed[0]
  switch (outcome) {
    case "eligible_for_approval":
      return `Eligible for approval: refund ${money(amount ?? 0)}.`
    case "requires_evidence":
      return "Evidence is needed before a refund can be considered."
    case "requires_review":
      return `A merchant must review this case. ${first?.detail ?? ""}`.trim()
    case "not_eligible":
      return `Not eligible for a refund. ${first?.detail ?? ""}`.trim()
    case "blocked_by_payment_state":
      return `Refund blocked by the payment state. ${first?.detail ?? ""}`.trim()
  }
}
