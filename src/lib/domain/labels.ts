import type {
  factSources,
  ProposedAction,
  RiskFlagCode,
} from "@/lib/ai/schemas"
import type { EligibilityOutcome } from "@/lib/policy/eligibility"
import type { Enums } from "@/types/database"

export type CaseStatus = Enums<"case_status">
export type RefundAttemptStatus = Enums<"refund_attempt_status">
export type RequestCategory = Enums<"request_category">
export type PaymentState = Enums<"order_payment_state">
export type ClauseType = Enums<"clause_type">

type BadgeTone =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"

type StatusMeta = {
  label: string
  tone: BadgeTone
  description: string
  /** Shown in "Cases needing attention" (FR-03). */
  needsAttention: boolean
  /** Counts as an open case on the dashboard. */
  open: boolean
}

export const caseStatusMeta: Record<CaseStatus, StatusMeta> = {
  NEW: {
    label: "New",
    tone: "secondary",
    description: "Waiting to be checked.",
    needsAttention: false,
    open: true,
  },
  INVESTIGATING: {
    label: "Checking",
    tone: "info",
    description: "Claude is reading the request and your return policy.",
    needsAttention: false,
    open: true,
  },
  NEEDS_EVIDENCE: {
    label: "Waiting on customer",
    tone: "warning",
    description: "Needs more information from the customer, such as a photo.",
    needsAttention: true,
    open: true,
  },
  NEEDS_REVIEW: {
    label: "Needs your review",
    tone: "warning",
    description: "A person needs to look at this before any refund.",
    needsAttention: true,
    open: true,
  },
  READY_FOR_APPROVAL: {
    label: "Ready to approve",
    tone: "info",
    description: "Every check passed. It's waiting for your approval.",
    needsAttention: true,
    open: true,
  },
  REFUND_PENDING: {
    label: "Refund in progress",
    tone: "info",
    description: "Sent to PayPal and not finished yet.",
    needsAttention: true,
    open: true,
  },
  REFUNDED: {
    label: "Refunded",
    tone: "success",
    description: "PayPal confirmed the money went back to the customer.",
    needsAttention: false,
    open: false,
  },
  NOT_ELIGIBLE: {
    label: "Not eligible",
    tone: "outline",
    description: "Closed without a refund.",
    needsAttention: false,
    open: false,
  },
  REFUND_FAILED: {
    label: "Refund failed",
    tone: "destructive",
    description: "PayPal turned the refund down. No money was returned.",
    needsAttention: true,
    open: true,
  },
  RECOVERY_REQUIRED: {
    label: "Check refund status",
    tone: "destructive",
    description:
      "PayPal hasn't confirmed whether the refund went through. Check its status before doing anything else.",
    needsAttention: true,
    open: true,
  },
}

export const refundAttemptStatusMeta: Record<
  RefundAttemptStatus,
  { label: string; tone: BadgeTone }
> = {
  REQUESTED: { label: "Sending to PayPal", tone: "secondary" },
  PENDING: { label: "In progress", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "destructive" },
  RECOVERY_REQUIRED: { label: "Status unknown", tone: "destructive" },
}

export const requestCategoryLabels: Record<RequestCategory, string> = {
  damaged_item: "Damaged item",
  not_as_described: "Not as described",
  not_received: "Not received",
  wrong_item: "Wrong item",
  missing_parts: "Missing parts",
  changed_mind: "Changed mind",
  other: "Other",
}

export const paymentStateLabels: Record<PaymentState, string> = {
  AWAITING_CAPTURE: "Not paid yet",
  CAPTURE_PENDING: "Payment pending",
  CAPTURED: "Paid",
  CAPTURE_DECLINED: "Payment declined",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
}

export const paymentStateTones: Record<PaymentState, BadgeTone> = {
  AWAITING_CAPTURE: "outline",
  CAPTURE_PENDING: "warning",
  CAPTURED: "success",
  CAPTURE_DECLINED: "destructive",
  PARTIALLY_REFUNDED: "info",
  REFUNDED: "secondary",
}

export const clauseTypeLabels: Record<ClauseType, string> = {
  return_window: "Return window",
  full_refund: "Full refund",
  partial_refund: "Partial refund",
  exclusion: "Not covered",
  evidence_requirement: "Proof needed",
  manual_review: "Needs a person",
  general: "General",
}

export const eligibilityOutcomeMeta: Record<
  EligibilityOutcome,
  { label: string; tone: BadgeTone; description: string }
> = {
  eligible_for_approval: {
    label: "Ready to approve",
    tone: "success",
    description: "Every check passed. You can approve the refund.",
  },
  requires_evidence: {
    label: "Needs more information",
    tone: "warning",
    description: "Something the policy asks for is missing, such as a photo.",
  },
  requires_review: {
    label: "Needs your review",
    tone: "warning",
    description: "A person needs to look at this before any refund.",
  },
  not_eligible: {
    label: "Not eligible",
    tone: "outline",
    description: "Your return policy doesn't allow a refund for this request.",
  },
  blocked_by_payment_state: {
    label: "Payment can't be refunded",
    tone: "destructive",
    description:
      "The payment isn't in a state PayPal can refund, or nothing is left to refund.",
  },
}

export const proposedActionMeta: Record<
  ProposedAction,
  { label: string; tone: BadgeTone }
> = {
  full_refund: { label: "Full refund", tone: "info" },
  partial_refund: { label: "Partial refund", tone: "info" },
  request_evidence: { label: "Ask for more information", tone: "warning" },
  manual_review: { label: "Have a person review it", tone: "warning" },
  not_eligible: { label: "No refund", tone: "outline" },
}

export const factSourceLabels: Record<(typeof factSources)[number], string> = {
  customer_message: "Customer message",
  merchant_notes: "Your notes",
  order_record: "Order",
  payment_record: "Payment",
  refund_history: "Earlier refunds",
  policy: "Return policy",
}

export const riskFlagLabels: Record<RiskFlagCode, string> = {
  prompt_injection: "Message tries to instruct the AI",
  contradictory_claims: "Details don't match",
  possible_fraud: "Possible fraud",
  policy_conflict: "Policy is unclear here",
  repeat_requester: "Has asked before",
  high_value: "High amount",
  unverified_evidence: "Proof not verified",
  other: "Other",
}
