import { NextResponse } from "next/server"
import { z } from "zod"

import { approveAndRefund, blockedHttpStatus } from "@/lib/refunds/service"
import { jsonError, requireApiMember } from "@/lib/security/api"
import { requestedTestFault, TEST_FAULT_HEADER } from "@/lib/testing/faults"

// PayPal calls time out after 30 seconds.
export const maxDuration = 60

/**
 * The browser confirms what the merchant saw; nothing in it is trusted. The
 * server re-checks eligibility and the amount before claiming the refund.
 */
const confirmationSchema = z.object({
  investigationId: z.uuid(),
  amountMinor: z.number().int().positive(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
})

/** PRD §13 POST /api/cases/[caseId]/approve-and-refund. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/cases/[caseId]/approve-and-refund">,
) {
  const auth = await requireApiMember(request)
  if ("response" in auth) return auth.response

  const { caseId } = await params
  if (!z.uuid().safeParse(caseId).success) {
    return jsonError(404, "not_found", "Case not found.")
  }
  const parsed = confirmationSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "Invalid approval request.")
  }

  const testFault = requestedTestFault(request)
  try {
    const result = await approveAndRefund(auth.member, caseId, parsed.data, {
      testFault,
    })
    const response = NextResponse.json(result, {
      status:
        result.status === "blocked" ? blockedHttpStatus[result.code] : 200,
    })
    if (testFault) response.headers.set(TEST_FAULT_HEADER, testFault)
    return response
  } catch (error) {
    console.error("approve_and_refund_failed", {
      caseId,
      reason: error instanceof Error ? error.message : "unknown",
    })
    // The refund may or may not have reached PayPal: never claim either way.
    return jsonError(
      500,
      "internal_error",
      "Something went wrong while processing the approval. Refresh the case to see its current state before doing anything else.",
    )
  }
}
