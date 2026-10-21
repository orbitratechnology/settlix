/**
 * End-to-end proof of the server-side PayPal adapter against the real Sandbox
 * (PRD §20 Phase 1 exit criterion). It writes nothing to the Settlix database.
 *
 *   bun run paypal:smoke create          # creates a $1.00 order, prints the approval URL
 *   # approve it in a browser with the sandbox PERSONAL (buyer) account
 *   bun run paypal:smoke finish <ORDER>  # capture, partial refund, idempotent replay,
 *                                        # refund the remainder, read everything back
 */
import { randomUUID } from "node:crypto"

import { checkPayPalConnection } from "../src/lib/paypal/client"
import { PayPalError } from "../src/lib/paypal/errors"
import { payPalToMinor } from "../src/lib/paypal/money"
import {
  capturePayPalOrder,
  createPayPalOrder,
  getPayPalOrder,
} from "../src/lib/paypal/orders"
import {
  getPayPalCapture,
  getPayPalRefund,
  refundPayPalCapture,
} from "../src/lib/paypal/payments"

const AMOUNT_MINOR = 100 // $1.00
const PARTIAL_MINOR = 40 // $0.40

function step(label: string, detail: Record<string, unknown> = {}) {
  console.log(`✓ ${label}`, Object.keys(detail).length ? detail : "")
}

async function create() {
  const connection = await checkPayPalConnection()
  if (!connection.ok) throw new Error(connection.reason)
  step("OAuth token (sandbox)", { appId: connection.appId })

  const smokeId = `smoke-${randomUUID()}`
  const order = await createPayPalOrder({
    settlixOrderId: smokeId,
    amountMinor: AMOUNT_MINOR,
    currency: "USD",
    requestId: randomUUID(),
    description: "Settlix adapter smoke test",
    returnUrl: "https://example.com/settlix-smoke/return",
    cancelUrl: "https://example.com/settlix-smoke/cancel",
  })
  const approve = order.links?.find(
    (link) => link.rel === "payer-action" || link.rel === "approve",
  )
  step("Order created", { orderId: order.id, status: order.status })
  console.log(`\nApprove with the sandbox buyer account:\n${approve?.href}\n`)
  console.log(`Then run: bun run paypal:smoke finish ${order.id}`)
}

async function finish(orderId: string) {
  const before = await getPayPalOrder(orderId)
  step("Order fetched", { orderId: before.id, status: before.status })
  if (before.status !== "APPROVED") {
    throw new Error(
      `Order is ${before.status}; approve it with the buyer account first`,
    )
  }

  const captured = await capturePayPalOrder(orderId, randomUUID())
  const capture = captured.capture
  if (!capture || capture.status !== "COMPLETED") {
    throw new Error(`Capture not completed: ${capture?.status ?? "missing"}`)
  }
  if (capture.id === orderId)
    throw new Error("Capture ID must differ from order ID")
  step("Captured", {
    orderId,
    captureId: capture.id,
    status: capture.status,
    amountMinor: payPalToMinor(capture.amount),
  })

  const partialRequestId = randomUUID()
  const partial = await refundPayPalCapture({
    captureId: capture.id,
    requestId: partialRequestId,
    amountMinor: PARTIAL_MINOR,
    currency: "USD",
    settlixRefundId: `smoke-refund-1`,
  })
  step("Partial refund", {
    refundId: partial.refund.id,
    status: partial.refund.status,
    httpStatus: partial.httpStatus,
  })

  // Same PayPal-Request-Id again: PayPal must return the SAME refund, not a second one.
  const replay = await refundPayPalCapture({
    captureId: capture.id,
    requestId: partialRequestId,
    amountMinor: PARTIAL_MINOR,
    currency: "USD",
    settlixRefundId: `smoke-refund-1`,
  })
  if (replay.refund.id !== partial.refund.id) {
    throw new Error("Idempotent replay created a different refund")
  }
  step("Idempotent replay returned the same refund", {
    refundId: replay.refund.id,
    httpStatus: replay.httpStatus,
  })

  const afterPartial = await getPayPalCapture(capture.id)
  step("Capture after partial refund", { status: afterPartial.status })

  const remainder = await refundPayPalCapture({
    captureId: capture.id,
    requestId: randomUUID(),
    amountMinor: AMOUNT_MINOR - PARTIAL_MINOR,
    currency: "USD",
    settlixRefundId: `smoke-refund-2`,
  })
  step("Remaining refund", {
    refundId: remainder.refund.id,
    status: remainder.refund.status,
  })

  try {
    await refundPayPalCapture({
      captureId: capture.id,
      requestId: randomUUID(),
      amountMinor: 1,
      currency: "USD",
      settlixRefundId: `smoke-refund-3`,
    })
    throw new Error("PayPal accepted a refund beyond the captured amount")
  } catch (error) {
    if (!(error instanceof PayPalError) || error.kind !== "rejected")
      throw error
    step("Over-refund rejected by PayPal", {
      issue: error.issue,
      debugId: error.debugId,
    })
  }

  const fetchedRefund = await getPayPalRefund(partial.refund.id)
  const finalCapture = await getPayPalCapture(capture.id)
  step("Read back from PayPal", {
    partialRefundStatus: fetchedRefund.status,
    partialRefundMinor: fetchedRefund.amount
      ? payPalToMinor(fetchedRefund.amount)
      : null,
    captureStatus: finalCapture.status,
  })
  if (finalCapture.status !== "REFUNDED") {
    throw new Error(`Expected REFUNDED capture, got ${finalCapture.status}`)
  }
  console.log("\nSandbox smoke test passed.")
}

const [command, orderId] = process.argv.slice(2)
const run =
  command === "create"
    ? create()
    : command === "finish" && orderId
      ? finish(orderId)
      : Promise.reject(
          new Error("Usage: paypal:smoke create | finish <ORDER_ID>"),
        )

run.catch((error: unknown) => {
  if (error instanceof PayPalError) {
    console.error("PayPal error", error.toLogObject())
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exit(1)
})
