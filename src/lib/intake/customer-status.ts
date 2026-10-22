import type { CaseStatus } from "@/lib/domain/labels"

/**
 * What the customer sees on their status page. It never shows Claude's
 * suggestion or the store's internal checks, and only says "refunded" once
 * PayPal confirmed a completed refund.
 */
export type CustomerStage = "received" | "reviewing" | "decided" | "refunded"

export type CustomerStatus = {
  /** The step the request is on, for the tracker. */
  stage: CustomerStage
  title: string
  detail: string
  tone: "progress" | "attention" | "success" | "closed"
  /** The customer may add details or reply on the status page. */
  canAddInfo: boolean
}

export const customerStages: { stage: CustomerStage; label: string }[] = [
  { stage: "received", label: "Received" },
  { stage: "reviewing", label: "Being reviewed" },
  { stage: "decided", label: "Decision" },
  { stage: "refunded", label: "Refunded" },
]

/**
 * `storeAsked`: the store's latest message came after the customer's last one.
 * A request only waits on the customer once the store actually asked; a status
 * set by Claude's check alone is not a question to the customer.
 */
export function customerStatus(
  status: CaseStatus,
  refunded: { amount: string } | null,
  storeAsked = false,
): CustomerStatus {
  if (status === "NEEDS_EVIDENCE" && !storeAsked) status = "NEEDS_REVIEW"
  switch (status) {
    case "NEW":
      return {
        stage: "received",
        title: "We have your request",
        detail:
          "The store will look at it soon. You can add details below in the meantime.",
        tone: "progress",
        canAddInfo: true,
      }
    case "INVESTIGATING":
    case "NEEDS_REVIEW":
    case "READY_FOR_APPROVAL":
    case "REFUND_FAILED":
      return {
        stage: "reviewing",
        title: "The store is reviewing your request",
        detail:
          "Nothing is needed from you right now. This page updates as soon as there's news.",
        tone: "progress",
        canAddInfo: true,
      }
    case "NEEDS_EVIDENCE":
      return {
        stage: "reviewing",
        title: "The store needs a little more information",
        detail:
          "Read the store's message below and reply here. Your request continues as soon as you do.",
        tone: "attention",
        canAddInfo: true,
      }
    case "REFUND_PENDING":
    case "RECOVERY_REQUIRED":
      return {
        stage: "decided",
        title: "Your refund was approved",
        detail:
          "The store sent it to PayPal. This page will say when PayPal has completed it.",
        tone: "progress",
        canAddInfo: false,
      }
    case "REFUNDED":
      return {
        stage: "refunded",
        title: refunded ? `${refunded.amount} refunded` : "Refunded",
        detail:
          "PayPal completed the refund to the account you paid with. It usually shows there within a few days.",
        tone: "success",
        canAddInfo: false,
      }
    case "NOT_ELIGIBLE":
      return {
        stage: "decided",
        title: "The store couldn't offer a refund",
        detail: "Read the store's message below for the reason.",
        tone: "closed",
        canAddInfo: true,
      }
  }
}
