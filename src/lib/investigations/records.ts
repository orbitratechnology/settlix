import { z } from "zod"

import { recommendationSchema } from "@/lib/ai/schemas"
import { Constants } from "@/types/database"
import type { CheckedCitation } from "@/lib/policy/citations"
import {
  eligibilityOutcomes,
  reasonCodes,
  type EligibilityResult,
} from "@/lib/policy/eligibility"
import type { PolicySnapshot } from "@/lib/investigations/context"

/** Shape of investigations.recommendation_json. */
export type StoredRecommendation = {
  recommendation: z.infer<typeof recommendationSchema>
  citations: CheckedCitation[]
  usage: { inputTokens: number | null; outputTokens: number | null }
}

const checkedCitationSchema =
  recommendationSchema.shape.policyCitations.element.extend({
    valid: z.boolean(),
    problem: z
      .enum([
        "unknown_policy",
        "version_mismatch",
        "unknown_clause",
        "quote_not_found",
      ])
      .nullable(),
    clauseId: z.string().nullable(),
    clauseTitle: z.string().nullable(),
    policyName: z.string().nullable(),
  })

const storedRecommendationSchema = z.object({
  recommendation: recommendationSchema,
  citations: z.array(checkedCitationSchema),
  usage: z.object({
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
  }),
})

const eligibilityResultSchema = z.object({
  engineVersion: z.literal("eligibility-v1"),
  outcome: z.enum(eligibilityOutcomes),
  reasonCodes: z.array(z.enum(reasonCodes)),
  checks: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      status: z.enum(["pass", "fail", "warning", "not_applicable"]),
      detail: z.string(),
      code: z.enum(reasonCodes).nullable(),
      effect: z.enum(eligibilityOutcomes).nullable(),
    }),
  ),
  amounts: z.object({
    capturedMinor: z.number(),
    confirmedRefundedMinor: z.number(),
    unresolvedMinor: z.number(),
    remainingMinor: z.number(),
    hasUnresolvedAttempt: z.boolean(),
    daysFromCaptureToRequest: z.number().nullable(),
    currencyCode: z.string(),
    requestedMinor: z.number().nullable(),
    proposedMinor: z.number().nullable(),
  }),
  approvableAmountMinor: z.number().nullable(),
  summary: z.string(),
})

const policySnapshotSchema = z.array(
  z.object({
    policyId: z.string(),
    name: z.string(),
    version: z.number(),
    effectiveFrom: z.string(),
    effectiveUntil: z.string().nullable(),
    returnWindowDays: z.number().nullable(),
    manualReviewAboveMinor: z.number().nullable(),
    clauses: z.array(
      z.object({
        clauseId: z.string(),
        clauseKey: z.string(),
        title: z.string(),
        clauseType: z.enum(Constants.public.Enums.clause_type),
        content: z.string(),
      }),
    ),
  }),
)

export type InvestigationRow = {
  id: string
  model_provider: string
  model_id: string
  prompt_version: string
  input_context_hash: string
  recommendation_json: unknown
  eligibility_result: unknown
  policy_version_snapshot: unknown
  created_at: string
}

export type InvestigationRecord = {
  id: string
  modelProvider: string
  modelId: string
  promptVersion: string
  contextHash: string
  createdAt: string
  stored: StoredRecommendation
  eligibility: EligibilityResult
  policies: PolicySnapshot[]
}

/**
 * Validates a stored investigation before it is displayed. Returns null for a
 * row that doesn't match the current format rather than trusting it.
 */
export function parseInvestigation(
  row: InvestigationRow,
): InvestigationRecord | null {
  const stored = storedRecommendationSchema.safeParse(row.recommendation_json)
  const eligibility = eligibilityResultSchema.safeParse(row.eligibility_result)
  const policies = policySnapshotSchema.safeParse(row.policy_version_snapshot)
  if (!stored.success || !eligibility.success || !policies.success) return null
  return {
    id: row.id,
    modelProvider: row.model_provider,
    modelId: row.model_id,
    promptVersion: row.prompt_version,
    contextHash: row.input_context_hash,
    createdAt: row.created_at,
    stored: stored.data,
    eligibility: eligibility.data as EligibilityResult,
    policies: policies.data,
  }
}
