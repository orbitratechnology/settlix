import "server-only"

import type { LanguageModel } from "ai"

import { recordAuditEvent } from "@/lib/audit/events"
import { investigationModel, MODEL_PROVIDER } from "@/lib/ai/client"
import {
  InvestigationAiError,
  runInvestigationModel,
  type AiFailureKind,
} from "@/lib/ai/investigate"
import { PROMPT_VERSION } from "@/lib/ai/prompts"
import { caseStatusMeta, type CaseStatus } from "@/lib/domain/labels"
import { contextHash } from "@/lib/investigations/context"
import {
  CASE_CONTEXT_COLUMNS,
  loadInvestigationContext,
} from "@/lib/investigations/load"
import type { StoredRecommendation } from "@/lib/investigations/records"
import { formatMoney } from "@/lib/money/amounts"
import { validateCitations } from "@/lib/policy/citations"
import {
  caseStatusForOutcome,
  evaluateEligibility,
  type EligibilityOutcome,
} from "@/lib/policy/eligibility"
import { can, type Member } from "@/lib/security/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"

/** Statuses an investigation may start from (they can move to INVESTIGATING). */
const INVESTIGABLE: ReadonlySet<CaseStatus> = new Set([
  "NEW",
  "NEEDS_EVIDENCE",
  "NEEDS_REVIEW",
  "READY_FOR_APPROVAL",
  "NOT_ELIGIBLE",
  "REFUND_FAILED",
])

/** Where a failed run may return to directly from INVESTIGATING. */
const RESTORABLE: ReadonlySet<CaseStatus> = new Set([
  "NEW",
  "NEEDS_EVIDENCE",
  "NEEDS_REVIEW",
  "READY_FOR_APPROVAL",
  "NOT_ELIGIBLE",
])

/** A run older than this was interrupted (e.g. a crashed function) and can be retaken. */
const STALE_RUN_MS = 3 * 60 * 1000

/** Why an investigation can't start from this case state, or null if it can. */
export function investigationUnavailableReason(row: {
  status: CaseStatus
  updated_at: string
}): string | null {
  if (INVESTIGABLE.has(row.status)) return null
  if (row.status === "INVESTIGATING") {
    return Date.parse(row.updated_at) < Date.now() - STALE_RUN_MS
      ? null
      : "An investigation is already running for this case."
  }
  return `A case that is "${caseStatusMeta[row.status].label}" can't be investigated.`
}

/** Per-merchant budget for investigations (PRD §14.5). */
export const RATE_LIMIT = { max: 20, windowMs: 15 * 60 * 1000 }

export type InvestigationErrorCode =
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "ai_failed"
  | "save_failed"

export type InvestigationResponse =
  | {
      status: "completed"
      investigationId: string
      outcome: EligibilityOutcome
      caseStatus: CaseStatus
    }
  | {
      status: "error"
      code: InvestigationErrorCode
      aiFailure?: AiFailureKind
      message: string
    }

type ModelHandle = { model: LanguageModel; modelId: string }

const error = (
  code: InvestigationErrorCode,
  message: string,
  aiFailure?: AiFailureKind,
): InvestigationResponse => ({ status: "error", code, message, aiFailure })

/**
 * PRD §13 POST /api/cases/[caseId]/investigate. Runs Claude on the case's
 * merchant-scoped evidence, validates citations, applies the deterministic
 * eligibility engine, and appends the investigation. It never creates a refund
 * attempt. An AI or storage failure restores the case and is audited.
 */
export async function investigateCase(
  member: Member,
  caseId: string,
  options: { model?: ModelHandle } = {},
): Promise<InvestigationResponse> {
  if (!can.investigate(member.role)) {
    return error("forbidden", "Your role can't run investigations.")
  }

  const handle = options.model ?? investigationModel()
  if (!handle) {
    return error(
      "ai_failed",
      new InvestigationAiError("not_configured").message,
      "not_configured",
    )
  }

  const merchantId = member.workspace.id
  const admin = createAdminClient()
  const { data: row, error: loadError } = await admin
    .from("cases")
    .select(CASE_CONTEXT_COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .maybeSingle()
  if (loadError)
    throw new Error("Could not load the case", { cause: loadError })
  if (!row) return error("not_found", "Case not found.")

  const unavailable = investigationUnavailableReason(row)
  if (unavailable) return error("conflict", unavailable)
  const staleCutoff = new Date(Date.now() - STALE_RUN_MS).toISOString()
  const staleRun = row.status === "INVESTIGATING"

  const windowStart = new Date(Date.now() - RATE_LIMIT.windowMs).toISOString()
  const { count, error: countError } = await admin
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("event_type", "investigation.started")
    .gte("created_at", windowStart)
  if (countError) {
    throw new Error("Could not check the rate limit", { cause: countError })
  }
  if ((count ?? 0) >= RATE_LIMIT.max) {
    return error(
      "rate_limited",
      "This workspace has run many investigations in the last 15 minutes. Try again shortly.",
    )
  }

  // Claim the case: only one investigation may run at a time.
  let claim = admin
    .from("cases")
    .update({ status: "INVESTIGATING" })
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .eq("status", row.status)
  if (staleRun) claim = claim.lt("updated_at", staleCutoff)
  const { data: claimed, error: claimError } = await claim
    .select("id")
    .maybeSingle()
  if (claimError) {
    throw new Error("Could not start the investigation", { cause: claimError })
  }
  if (!claimed) {
    return error(
      "conflict",
      "The case changed or another investigation started. Refresh and try again.",
    )
  }

  const previousStatus: CaseStatus = staleRun ? "NEEDS_REVIEW" : row.status
  const actor = { type: "user" as const, id: member.userId }

  // Everything after the claim restores the case if it fails.
  try {
    await recordAuditEvent(admin, {
      merchantId,
      caseId,
      actor,
      eventType: "investigation.started",
      summary: `Investigation started for ${row.case_number}.`,
      metadata: { prompt_version: PROMPT_VERSION, model_id: handle.modelId },
    })
    const context = await loadInvestigationContext(admin, merchantId, row)
    const run = await runInvestigationModel({
      model: handle.model,
      context,
      caseStatus: previousStatus,
    })
    const citations = validateCitations(
      run.recommendation.policyCitations,
      context.policies,
    )
    const eligibility = evaluateEligibility({
      context,
      caseStatus: previousStatus,
      recommendation: run.recommendation,
      citations,
    })
    const nextStatus = caseStatusForOutcome[eligibility.outcome]

    const stored: StoredRecommendation = {
      recommendation: run.recommendation,
      citations,
      usage: run.usage,
    }
    const { data: investigation, error: insertError } = await admin
      .from("investigations")
      .insert({
        merchant_id: merchantId,
        case_id: caseId,
        model_provider: MODEL_PROVIDER,
        model_id: run.modelId || handle.modelId,
        prompt_version: PROMPT_VERSION,
        policy_version_snapshot: context.policies as unknown as Json,
        input_context_hash: contextHash(context),
        recommendation_json: stored as unknown as Json,
        eligibility_result: eligibility as unknown as Json,
        created_by: member.userId,
      })
      .select("id")
      .single()
    if (insertError) {
      throw new Error("Could not save the investigation", {
        cause: insertError,
      })
    }

    const { error: statusError } = await admin
      .from("cases")
      .update({ status: nextStatus })
      .eq("merchant_id", merchantId)
      .eq("id", caseId)
      .eq("status", "INVESTIGATING")
    if (statusError) {
      throw new Error("Could not update the case", { cause: statusError })
    }

    const amount =
      eligibility.amounts.proposedMinor !== null
        ? ` (${formatMoney(eligibility.amounts.proposedMinor, eligibility.amounts.currencyCode)})`
        : ""
    await recordAuditEvent(admin, {
      merchantId,
      caseId,
      actor: { type: "ai" },
      eventType: "investigation.completed",
      summary: `Claude recommended ${run.recommendation.proposedAction.replaceAll("_", " ")}${amount}. Checks: ${eligibility.summary}`,
      metadata: {
        investigation_id: investigation.id,
        proposed_action: run.recommendation.proposedAction,
        outcome: eligibility.outcome,
        reason_codes: eligibility.reasonCodes,
        invalid_citations: citations.filter((c) => !c.valid).length,
        case_status: nextStatus,
      },
    })

    return {
      status: "completed",
      investigationId: investigation.id,
      outcome: eligibility.outcome,
      caseStatus: nextStatus,
    }
  } catch (cause) {
    const aiError = cause instanceof InvestigationAiError ? cause : null
    if (!aiError) {
      console.error("Investigation failed", {
        caseId,
        error: cause instanceof Error ? cause.message : "unknown",
      })
    }

    const restoreTo = RESTORABLE.has(previousStatus)
      ? previousStatus
      : "NEEDS_REVIEW"
    const { error: restoreError } = await admin
      .from("cases")
      .update({ status: restoreTo })
      .eq("merchant_id", merchantId)
      .eq("id", caseId)
      .eq("status", "INVESTIGATING")
    if (restoreError) {
      console.error("Could not restore case status", { caseId })
    }

    await recordAuditEvent(admin, {
      merchantId,
      caseId,
      actor: { type: "system" },
      eventType: "investigation.failed",
      summary: aiError
        ? `Investigation failed: ${aiError.message}`
        : "Investigation failed: the result could not be saved. No recommendation was recorded.",
      metadata: {
        failure: aiError?.kind ?? "save_failed",
        provider_status: aiError?.statusCode ?? null,
        case_status: restoreTo,
      },
    }).catch(() => {
      console.error("Could not record the investigation failure", { caseId })
    })

    return aiError
      ? error("ai_failed", aiError.message, aiError.kind)
      : error(
          "save_failed",
          "The investigation couldn't be saved. The case is unchanged; try again.",
        )
  }
}
