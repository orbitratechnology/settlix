import type { CaseStatus } from "@/lib/domain/labels"
import { can, type MemberRole } from "@/lib/security/roles"

export type CaseAction = "note" | "requestEvidence" | "sendToReview" | "decline"

/**
 * Case states each merchant action may start from. They mirror the database's
 * status-transition guard, which has the final say.
 */
export const caseActionSources: Record<CaseAction, ReadonlySet<CaseStatus>> = {
  note: new Set([
    "NEW",
    "NEEDS_EVIDENCE",
    "NEEDS_REVIEW",
    "READY_FOR_APPROVAL",
    "NOT_ELIGIBLE",
    "REFUND_FAILED",
  ]),
  requestEvidence: new Set([
    "NEW",
    "NEEDS_EVIDENCE",
    "NEEDS_REVIEW",
    "READY_FOR_APPROVAL",
  ]),
  sendToReview: new Set([
    "NEW",
    "NEEDS_EVIDENCE",
    "READY_FOR_APPROVAL",
    "NOT_ELIGIBLE",
    "REFUND_FAILED",
  ]),
  decline: new Set([
    "NEW",
    "NEEDS_EVIDENCE",
    "NEEDS_REVIEW",
    "READY_FOR_APPROVAL",
    "REFUND_FAILED",
  ]),
}

export const caseActionTarget: Record<
  Exclude<CaseAction, "note">,
  CaseStatus
> = {
  requestEvidence: "NEEDS_EVIDENCE",
  sendToReview: "NEEDS_REVIEW",
  decline: "NOT_ELIGIBLE",
}

const roleAllows: Record<CaseAction, (role: MemberRole) => boolean> = {
  note: can.investigate,
  requestEvidence: can.investigate,
  sendToReview: can.investigate,
  decline: can.approveRefunds,
}

export function caseActionAllowed(
  action: CaseAction,
  status: CaseStatus,
  role: MemberRole,
) {
  return roleAllows[action](role) && caseActionSources[action].has(status)
}
