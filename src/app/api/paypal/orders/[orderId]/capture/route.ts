import { NextResponse } from "next/server"

import { captureSandboxCheckout } from "@/lib/payments/checkout"
import { requireApiMember, jsonError } from "@/lib/security/api"
import { can } from "@/lib/security/auth"

/**
 * Captures an approved sandbox order (PRD §13 POST /api/paypal/orders/[orderId]/capture).
 * `orderId` is the PayPal order ID. The response reports the authoritative state;
 * the UI never assumes success.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/paypal/orders/[orderId]/capture">,
) {
  const auth = await requireApiMember(request)
  if ("response" in auth) return auth.response
  const { member } = auth
  if (!can.runSandboxCheckout(member.role)) {
    return jsonError(403, "forbidden", "Your role can't run sandbox checkouts.")
  }

  const { orderId } = await params
  const outcome = await captureSandboxCheckout(member, orderId)
  const status =
    outcome.status === "captured" || outcome.status === "pending"
      ? 200
      : outcome.status === "unknown"
        ? 202
        : 422
  return NextResponse.json(outcome, { status })
}
