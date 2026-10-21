import { NextResponse } from "next/server"
import { z } from "zod"

import { CheckoutError, startSandboxCheckout } from "@/lib/payments/checkout"
import { PayPalError } from "@/lib/paypal/errors"
import { jsonError, requireApiMember } from "@/lib/security/api"
import { can } from "@/lib/security/auth"

const bodySchema = z.object({ itemId: z.string().min(1).max(64) })

/** Creates a sandbox PayPal order for a catalog item (PRD §13 POST /api/paypal/orders). */
export async function POST(request: Request) {
  const auth = await requireApiMember(request)
  if ("response" in auth) return auth.response
  const { member } = auth
  if (!can.runSandboxCheckout(member.role)) {
    return jsonError(403, "forbidden", "Your role can't run sandbox checkouts.")
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "Choose an item to check out.")
  }

  try {
    const { paypalOrderId } = await startSandboxCheckout(
      member,
      parsed.data.itemId,
    )
    return NextResponse.json({ orderId: paypalOrderId }, { status: 201 })
  } catch (error) {
    if (error instanceof CheckoutError) {
      return jsonError(400, "invalid_request", error.message)
    }
    if (error instanceof PayPalError) {
      console.error("paypal_create_order_failed", error.toLogObject())
      return jsonError(
        502,
        "paypal_error",
        "PayPal couldn't start the checkout.",
      )
    }
    throw error
  }
}
