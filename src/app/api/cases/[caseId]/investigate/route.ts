import { NextResponse } from "next/server"
import { z } from "zod"

import { investigateCase } from "@/lib/investigations/service"
import { jsonError, requireApiMember } from "@/lib/security/api"
import { requestedTestFault, TEST_FAULT_HEADER } from "@/lib/testing/faults"

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

  // Test faults swap in a model that fails; it never produces a recommendation.
  const fault = requestedTestFault(request)
  const aiFault =
    fault === "ai_timeout" || fault === "ai_invalid_output" ? fault : null
  try {
    const result = await investigateCase(
      auth.member,
      caseId,
      aiFault
        ? {
            model: (await import("@/lib/testing/fault-models")).faultModel(
              aiFault,
            ),
          }
        : {},
    )
    const response =
      result.status === "completed"
        ? NextResponse.json(result)
        : NextResponse.json(result, { status: statusByCode[result.code] })
    if (aiFault) response.headers.set(TEST_FAULT_HEADER, aiFault)
    return response
  } catch (error) {
    // Thrown only before the case is claimed, so nothing changed.
    console.error("investigation_failed", {
      caseId,
      reason: error instanceof Error ? error.message : "unknown",
    })
    return jsonError(
      503,
      "unavailable",
      "Settlix couldn't start the investigation. The case is unchanged; try again shortly.",
    )
  }
}
