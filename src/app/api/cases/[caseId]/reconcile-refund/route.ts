import { NextResponse } from "next/server"
import { z } from "zod"

import { blockedHttpStatus, reconcileRefund } from "@/lib/refunds/service"
import { jsonError, requireApiMember } from "@/lib/security/api"

export const maxDuration = 60

/**
 * Checks an unresolved refund with PayPal: reads it by refund ID, or replays
 * the stored request with its original PayPal-Request-Id. Never a new refund.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/cases/[caseId]/reconcile-refund">,
) {
  const auth = await requireApiMember(request)
  if ("response" in auth) return auth.response

  const { caseId } = await params
  if (!z.uuid().safeParse(caseId).success) {
    return jsonError(404, "not_found", "Case not found.")
  }

  const result = await reconcileRefund(auth.member, caseId)
  return NextResponse.json(result, {
    status: result.status === "blocked" ? blockedHttpStatus[result.code] : 200,
  })
}
