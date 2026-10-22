import { payPalToMinor } from "@/lib/paypal/money"
import type { PayPalCapture } from "@/lib/paypal/types"
import type { Enums } from "@/types/database"

type StoredOrder = {
  id: string
  original_amount_minor: number
  currency_code: string
}

type CaptureEvidence = {
  capture: PayPalCapture | undefined
  customId: string | undefined
  referenceId: string | undefined
}

export type CaptureEvaluation =
  | {
      ok: true
      paymentState: Extract<
        Enums<"order_payment_state">,
        "CAPTURED" | "CAPTURE_PENDING" | "CAPTURE_DECLINED"
      >
      captureId: string
      captureStatus: PayPalCapture["status"]
      capturedAt: string
    }
  | { ok: false; reason: "no_capture" | "mismatch"; detail: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type Buyer = { email: string; name: string | null }

/**
 * The buyer PayPal reports on an approved order, kept so a customer's refund
 * request can be matched to the order by email. Null when PayPal sent no usable
 * email address.
 */
export function buyerFromPayer(
  payer:
    | {
        email_address?: string
        name?: { given_name?: string; surname?: string }
      }
    | undefined,
): Buyer | null {
  const email = payer?.email_address?.trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL.test(email)) return null
  const name = [payer?.name?.given_name, payer?.name?.surname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 120)
  return { email, name: name || null }
}

/**
 * Decides what a PayPal capture response means for a stored order. The order is
 * only marked paid when PayPal reports COMPLETED and the amount, currency, and
 * Settlix order reference all match our own record (PRD FR-10, §14.2).
 */
export function evaluateCapture(
  order: StoredOrder,
  evidence: CaptureEvidence,
  now: Date = new Date(),
): CaptureEvaluation {
  const { capture } = evidence
  if (!capture) {
    return {
      ok: false,
      reason: "no_capture",
      detail: "PayPal returned no capture",
    }
  }

  const reference =
    capture.custom_id ?? evidence.customId ?? evidence.referenceId
  if (reference !== order.id) {
    return {
      ok: false,
      reason: "mismatch",
      detail: "Capture does not reference this Settlix order",
    }
  }
  if (capture.amount.currency_code !== order.currency_code) {
    return { ok: false, reason: "mismatch", detail: "Capture currency differs" }
  }
  if (payPalToMinor(capture.amount) !== order.original_amount_minor) {
    return { ok: false, reason: "mismatch", detail: "Captured amount differs" }
  }

  const paymentState =
    capture.status === "COMPLETED"
      ? "CAPTURED"
      : capture.status === "PENDING"
        ? "CAPTURE_PENDING"
        : "CAPTURE_DECLINED"

  return {
    ok: true,
    paymentState,
    captureId: capture.id,
    captureStatus: capture.status,
    capturedAt: capture.create_time ?? now.toISOString(),
  }
}
