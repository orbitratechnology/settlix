import { NextResponse } from "next/server"
import { z } from "zod"

import { investigateCase } from "@/lib/investigations/service"
import { jsonError, requireApiMember } from "@/lib/security/api"

// Claude's own budget is 75 seconds including retries.
export const maxDuration = 90

const statusByCode = {
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  ai_failed: 502,
  save_failed: 500,
} as const

/**
 * Starts an AI investigation (PRD §13 POST /api/cases/[caseId]/investigate).
 * The body is ignored: everything the model sees comes from stored,
 * merchant-scoped records. This route never performs a refund.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/cases/[caseId]/investigate">,
) {
  const auth = await requireApiMember(request)
  if ("response" in auth) return auth.response

  const { caseId } = await params
  if (!z.uuid().safeParse(caseId).success) {
    return jsonError(404, "not_found", "Case not found.")
  }

  const result = await investigateCase(auth.member, caseId)
  if (result.status === "completed") {
    return NextResponse.json(result)
  }
  return NextResponse.json(result, { status: statusByCode[result.code] })
}
