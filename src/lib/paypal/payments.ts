import "server-only"

import { paypalRequest } from "./client"
import { minorToPayPal } from "./money"
import type { PayPalCapture, PayPalRefund } from "./types"

export async function getPayPalCapture(
  captureId: string,
): Promise<PayPalCapture> {
  const { data } = await paypalRequest<PayPalCapture>(
    "GET",
    `/v2/payments/captures/${encodeURIComponent(captureId)}`,
  )
  return data
}

/**
 * POST /v2/payments/captures/{capture_id}/refund.
 *
 * The caller must persist the refund intent and `requestId` BEFORE calling, and
 * reuse the same `requestId` verbatim on any retry. An explicit amount is always
 * sent (also for full refunds) so replays and reconciliation are deterministic.
 * Only `refund.status === "COMPLETED"` means money was returned.
 */
export async function refundPayPalCapture(input: {
  captureId: string
  requestId: string
  amountMinor: number
  currency: string
  settlixRefundId: string
  noteToPayer?: string
}): Promise<{ httpStatus: number; refund: PayPalRefund }> {
  const { status, data } = await paypalRequest<PayPalRefund>(
    "POST",
    `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
    {
      requestId: input.requestId,
      representation: true,
      body: {
        amount: minorToPayPal(input.amountMinor, input.currency),
        custom_id: input.settlixRefundId,
        ...(input.noteToPayer
          ? { note_to_payer: input.noteToPayer.slice(0, 255) }
          : {}),
      },
    },
  )
  return { httpStatus: status, refund: data }
}

export async function getPayPalRefund(refundId: string): Promise<PayPalRefund> {
  const { data } = await paypalRequest<PayPalRefund>(
    "GET",
    `/v2/payments/refunds/${encodeURIComponent(refundId)}`,
  )
  return data
}
