import "server-only"

import { randomBytes, randomUUID } from "node:crypto"

import { recordAuditEvent } from "@/lib/audit/events"
import {
  evaluateCapture,
  type CaptureEvaluation,
} from "@/lib/payments/capture-evaluation"
import { findCatalogItem } from "@/lib/payments/catalog"
import { PayPalError } from "@/lib/paypal/errors"
import {
  capturePayPalOrder,
  captureFromOrder,
  createPayPalOrder,
  getPayPalOrder,
  type CaptureResult,
} from "@/lib/paypal/orders"
import { getPayPalCapture } from "@/lib/paypal/payments"
import type { Member } from "@/lib/security/auth"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Tables } from "@/types/database"

export type CheckoutOutcome =
  | { status: "captured"; captureId: string }
  | { status: "pending"; captureId: string }
  | { status: "declined"; message: string }
  | { status: "unknown"; message: string }
  | { status: "error"; message: string }

type Order = Tables<"orders">

const PAYPAL_ID = /^[A-Za-z0-9-]{10,64}$/

function orderReference() {
  return `SBX-${randomBytes(4).toString("hex").toUpperCase()}`
}

/**
 * Starts a sandbox checkout for a catalog item: creates the PayPal order with the
 * server's price, then records the Settlix order with its PayPal order ID.
 * Returns the PayPal ORDER ID for the JS SDK.
 */
export async function startSandboxCheckout(member: Member, itemId: string) {
  const item = findCatalogItem(itemId)
  if (!item) throw new CheckoutError("Unknown item.")
  if (item.currency !== member.workspace.defaultCurrency) {
    throw new CheckoutError("Item currency does not match the workspace.")
  }
  const admin = createAdminClient()
  if (
    !(await consumeRateLimit(admin, member.workspace.id, "checkout.create"))
  ) {
    throw new CheckoutError(
      "This workspace has started many sandbox checkouts in the last 15 minutes. Try again in a few minutes.",
      "rate_limited",
    )
  }

  const settlixOrderId = randomUUID()
  const paypalOrder = await createPayPalOrder({
    settlixOrderId,
    amountMinor: item.amountMinor,
    currency: item.currency,
    requestId: randomUUID(),
    description: item.name,
  })
  if (!PAYPAL_ID.test(paypalOrder.id)) {
    throw new CheckoutError("PayPal returned an unexpected order ID.")
  }

  const { error } = await admin.from("orders").insert({
    id: settlixOrderId,
    merchant_id: member.workspace.id,
    external_order_reference: orderReference(),
    paypal_order_id: paypalOrder.id,
    description: item.name,
    original_amount_minor: item.amountMinor,
    currency_code: item.currency,
    payment_state: "AWAITING_CAPTURE",
    origin: "app",
  })
  if (error) throw new Error("Could not record the order", { cause: error })

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor: { type: "user", id: member.userId },
    eventType: "payment.order_created",
    summary: `Sandbox checkout started for ${item.name}.`,
    metadata: {
      order_id: settlixOrderId,
      paypal_order_id: paypalOrder.id,
      amount_minor: item.amountMinor,
      currency: item.currency,
    },
  })

  return { paypalOrderId: paypalOrder.id }
}

async function loadOrderByPayPalId(member: Member, paypalOrderId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("merchant_id", member.workspace.id)
    .eq("paypal_order_id", paypalOrderId)
    .eq("origin", "app")
    .maybeSingle()
  if (error) throw new Error("Could not load the order", { cause: error })
  return data
}

/** Persists the capture key before the PayPal call; concurrent callers share one key. */
async function ensureCaptureRequestId(order: Order) {
  if (order.paypal_capture_request_id) return order.paypal_capture_request_id
  const admin = createAdminClient()
  const candidate = randomUUID()
  const { data, error } = await admin
    .from("orders")
    .update({ paypal_capture_request_id: candidate })
    .eq("id", order.id)
    .is("paypal_capture_request_id", null)
    .select("paypal_capture_request_id")
    .maybeSingle()
  if (error)
    throw new Error("Could not store the capture key", { cause: error })
  if (data?.paypal_capture_request_id) return data.paypal_capture_request_id

  const { data: current, error: reloadError } = await admin
    .from("orders")
    .select("paypal_capture_request_id")
    .eq("id", order.id)
    .single()
  if (reloadError || !current.paypal_capture_request_id) {
    throw new Error("Could not read the capture key", { cause: reloadError })
  }
  return current.paypal_capture_request_id
}

async function applyEvaluation(
  member: Member,
  order: Order,
  evaluation: CaptureEvaluation,
  paypalOrderId: string,
): Promise<CheckoutOutcome> {
  const admin = createAdminClient()
  const actor = { type: "user" as const, id: member.userId }

  if (!evaluation.ok) {
    await recordAuditEvent(admin, {
      merchantId: member.workspace.id,
      actor,
      eventType:
        evaluation.reason === "mismatch"
          ? "payment.capture_mismatch"
          : "payment.capture_missing",
      summary: `Capture not accepted: ${evaluation.detail}.`,
      metadata: { order_id: order.id, paypal_order_id: paypalOrderId },
    })
    return {
      status: "error",
      message:
        "PayPal's response did not match this order, so it was not marked paid.",
    }
  }

  const { error } = await admin
    .from("orders")
    .update({
      paypal_capture_id:
        evaluation.paymentState === "CAPTURE_DECLINED"
          ? null
          : evaluation.captureId,
      captured_at:
        evaluation.paymentState === "CAPTURED" ? evaluation.capturedAt : null,
      payment_state: evaluation.paymentState,
    })
    .eq("id", order.id)
    .eq("merchant_id", member.workspace.id)
  if (error) throw new Error("Could not record the capture", { cause: error })

  const eventType = {
    CAPTURED: "payment.captured",
    CAPTURE_PENDING: "payment.capture_pending",
    CAPTURE_DECLINED: "payment.capture_declined",
  }[evaluation.paymentState]
  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor,
    eventType,
    summary:
      evaluation.paymentState === "CAPTURED"
        ? `PayPal Sandbox capture ${evaluation.captureId} completed for ${order.external_order_reference}.`
        : `PayPal Sandbox reported capture status ${evaluation.captureStatus} for ${order.external_order_reference}.`,
    metadata: {
      order_id: order.id,
      paypal_order_id: paypalOrderId,
      paypal_capture_id: evaluation.captureId,
      capture_status: evaluation.captureStatus,
      amount_minor: order.original_amount_minor,
    },
  })

  if (evaluation.paymentState === "CAPTURED") {
    return { status: "captured", captureId: evaluation.captureId }
  }
  if (evaluation.paymentState === "CAPTURE_PENDING") {
    return { status: "pending", captureId: evaluation.captureId }
  }
  return { status: "declined", message: "PayPal declined the payment." }
}

/**
 * Captures an approved sandbox order (called from the JS SDK onApprove).
 * Idempotent: repeated calls reuse the stored PayPal-Request-Id and never mark
 * an order paid unless PayPal reports a matching COMPLETED capture.
 */
export async function captureSandboxCheckout(
  member: Member,
  paypalOrderId: string,
): Promise<CheckoutOutcome> {
  if (!PAYPAL_ID.test(paypalOrderId)) {
    return { status: "error", message: "Invalid PayPal order ID." }
  }
  const order = await loadOrderByPayPalId(member, paypalOrderId)
  if (!order) return { status: "error", message: "Order not found." }

  if (order.paypal_capture_id && order.payment_state === "CAPTURED") {
    return { status: "captured", captureId: order.paypal_capture_id }
  }
  if (
    !(await consumeRateLimit(
      createAdminClient(),
      member.workspace.id,
      "checkout.capture",
    ))
  ) {
    return {
      status: "error",
      message:
        "Too many capture attempts in the last 15 minutes. Wait a few minutes, then use Check status on the payment.",
    }
  }

  const requestId = await ensureCaptureRequestId(order)
  let result: CaptureResult
  try {
    result = await capturePayPalOrder(paypalOrderId, requestId)
  } catch (error) {
    if (!(error instanceof PayPalError)) throw error
    const admin = createAdminClient()

    if (error.kind === "rejected" && error.issue === "ORDER_ALREADY_CAPTURED") {
      result = captureFromOrder(await getPayPalOrder(paypalOrderId))
    } else if (error.kind === "rejected") {
      // Definitive failure: clear the key so a new funding attempt gets a new one.
      await admin
        .from("orders")
        .update({ paypal_capture_request_id: null })
        .eq("id", order.id)
      await recordAuditEvent(admin, {
        merchantId: member.workspace.id,
        actor: { type: "user", id: member.userId },
        eventType: "payment.capture_failed",
        summary: `PayPal rejected the capture (${error.issue ?? error.errorName ?? "error"}).`,
        metadata: {
          order_id: order.id,
          paypal_order_id: paypalOrderId,
          issue: error.issue,
          debug_id: error.debugId,
        },
      })
      return {
        status: "declined",
        message:
          error.issue === "INSTRUMENT_DECLINED"
            ? "The buyer's funding source was declined. Try again with another one."
            : "PayPal could not complete the payment.",
      }
    } else {
      // Unknown outcome: keep the key so a retry or status check is idempotent.
      await recordAuditEvent(admin, {
        merchantId: member.workspace.id,
        actor: { type: "user", id: member.userId },
        eventType: "payment.capture_unknown",
        summary: "PayPal did not confirm the capture; status must be checked.",
        metadata: {
          order_id: order.id,
          paypal_order_id: paypalOrderId,
          debug_id: error.debugId,
        },
      })
      return {
        status: "unknown",
        message:
          "PayPal didn't confirm the payment yet. Use Check status before trying again.",
      }
    }
  }

  return applyEvaluation(
    member,
    order,
    evaluateCapture(order, result),
    paypalOrderId,
  )
}

/**
 * Reconciles an order whose capture is pending or unconfirmed by reading the
 * authoritative state from PayPal (no new capture request).
 */
export async function refreshSandboxPayment(
  member: Member,
  settlixOrderId: string,
): Promise<CheckoutOutcome> {
  const admin = createAdminClient()
  const { data: order, error } = await admin
    .from("orders")
    .select("*")
    .eq("merchant_id", member.workspace.id)
    .eq("id", settlixOrderId)
    .eq("origin", "app")
    .maybeSingle()
  if (error) throw new Error("Could not load the order", { cause: error })
  if (!order?.paypal_order_id) {
    return { status: "error", message: "Order not found." }
  }
  if (order.payment_state === "CAPTURED" && order.paypal_capture_id) {
    return { status: "captured", captureId: order.paypal_capture_id }
  }

  try {
    if (order.payment_state === "CAPTURE_PENDING" && order.paypal_capture_id) {
      const capture = await getPayPalCapture(order.paypal_capture_id)
      return applyEvaluation(
        member,
        order,
        evaluateCapture(order, {
          capture,
          customId: undefined,
          referenceId: undefined,
        }),
        order.paypal_order_id,
      )
    }

    const paypalOrder = await getPayPalOrder(order.paypal_order_id)
    const result = captureFromOrder(paypalOrder)
    if (!result.capture) {
      // Approved but never captured (for example, the browser closed before
      // onApprove finished): finish the capture with the stored request ID.
      if (paypalOrder.status === "APPROVED") {
        return captureSandboxCheckout(member, order.paypal_order_id)
      }
      return {
        status: "unknown",
        message:
          paypalOrder.status === "VOIDED"
            ? "PayPal voided this order. Nothing was charged."
            : "Not paid yet: the buyer hasn't approved this order in PayPal.",
      }
    }
    return applyEvaluation(
      member,
      order,
      evaluateCapture(order, result),
      order.paypal_order_id,
    )
  } catch (caught) {
    if (caught instanceof PayPalError) {
      return {
        status: "unknown",
        message: "PayPal could not be reached. Try again shortly.",
      }
    }
    throw caught
  }
}

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_request" | "rate_limited" = "invalid_request",
  ) {
    super(message)
    this.name = "CheckoutError"
  }
}
