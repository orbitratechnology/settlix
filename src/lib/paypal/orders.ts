import "server-only"

import { paypalRequest } from "./client"
import { minorToPayPal } from "./money"
import type { PayPalCapture, PayPalOrder } from "./types"

/**
 * POST /v2/checkout/orders. The amount always comes from Settlix's own records,
 * never from the browser. reference_id and custom_id carry the Settlix order ID.
 */
export async function createPayPalOrder(input: {
  settlixOrderId: string
  amountMinor: number
  currency: string
  requestId: string
  description: string
  returnUrl?: string
  cancelUrl?: string
}): Promise<PayPalOrder> {
  const { data } = await paypalRequest<PayPalOrder>(
    "POST",
    "/v2/checkout/orders",
    {
      requestId: input.requestId,
      representation: true,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.settlixOrderId,
            custom_id: input.settlixOrderId,
            description: input.description.slice(0, 127),
            amount: minorToPayPal(input.amountMinor, input.currency),
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "Settlix Sandbox Store",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
              ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
            },
          },
        },
      },
    },
  )
  return data // data.id is the PayPal ORDER ID (not a capture ID)
}

export async function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  const { data } = await paypalRequest<PayPalOrder>(
    "GET",
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
  )
  return data
}

export type CaptureResult = {
  httpStatus: number
  orderId: string
  orderStatus: PayPalOrder["status"]
  capture: PayPalCapture | undefined
  customId: string | undefined
  referenceId: string | undefined
}

/** Reads the first capture of the first purchase unit; order COMPLETED does not mean paid. */
export function captureFromOrder(
  order: PayPalOrder,
  httpStatus = 200,
): CaptureResult {
  const unit = order.purchase_units?.[0]
  return {
    httpStatus,
    orderId: order.id,
    orderStatus: order.status,
    capture: unit?.payments?.captures?.[0],
    customId: unit?.custom_id,
    referenceId: unit?.reference_id,
  }
}

/** POST /v2/checkout/orders/{id}/capture with a persisted PayPal-Request-Id. */
export async function capturePayPalOrder(
  orderId: string,
  requestId: string,
): Promise<CaptureResult> {
  const { status, data } = await paypalRequest<PayPalOrder>(
    "POST",
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    { requestId, representation: true, body: {} },
  )
  return captureFromOrder(data, status)
}
