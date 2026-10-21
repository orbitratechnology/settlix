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
    description: "Not investigated yet.",
    needsAttention: false,
    open: true,
  },
  INVESTIGATING: {
    label: "Investigating",
    tone: "info",
    description: "An AI investigation is running.",
    needsAttention: false,
    open: true,
  },
  NEEDS_EVIDENCE: {
    label: "Needs evidence",
    tone: "warning",
    description: "Waiting on information from the customer.",
    needsAttention: true,
    open: true,
  },
  NEEDS_REVIEW: {
    label: "Needs review",
    tone: "warning",
    description: "A merchant must review this case manually.",
    needsAttention: true,
    open: true,
  },
  READY_FOR_APPROVAL: {
    label: "Ready for approval",
    tone: "info",
    description: "Passed all checks; waiting for merchant approval.",
    needsAttention: true,
    open: true,
  },
  REFUND_PENDING: {
    label: "Refund pending",
    tone: "info",
    description: "Sent to PayPal; not completed yet.",
    needsAttention: true,
    open: true,
  },
  REFUNDED: {
    label: "Refunded",
    tone: "success",
    description: "PayPal reported the refund as completed.",
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
    description: "PayPal rejected the refund. No money was returned.",
    needsAttention: true,
    open: true,
  },
  RECOVERY_REQUIRED: {
    label: "Recovery required",
    tone: "destructive",
    description: "The refund outcome is unknown and must be reconciled.",
    needsAttention: true,
    open: true,
  },
}

export const refundAttemptStatusMeta: Record<
  RefundAttemptStatus,
  { label: string; tone: BadgeTone }
> = {
  REQUESTED: { label: "Requested", tone: "secondary" },
  PENDING: { label: "Pending", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "destructive" },
  RECOVERY_REQUIRED: { label: "Recovery required", tone: "destructive" },
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
  AWAITING_CAPTURE: "Not captured",
  CAPTURE_PENDING: "Capture pending",
  CAPTURED: "Captured",
  CAPTURE_DECLINED: "Capture declined",
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
  exclusion: "Exclusion",
  evidence_requirement: "Evidence requirement",
  manual_review: "Manual review",
  general: "General",
}
