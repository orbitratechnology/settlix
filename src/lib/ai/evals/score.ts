import type { EvalFixture } from "@/lib/ai/evals/fixtures"
import type { ResolutionRecommendation } from "@/lib/ai/schemas"
import { validateCitations } from "@/lib/policy/citations"
import { evaluateEligibility } from "@/lib/policy/eligibility"

export type RecommendationScore = {
  action: ResolutionRecommendation["proposedAction"]
  outcome: ReturnType<typeof evaluateEligibility>["outcome"]
  /** Each expectation that applies to the fixture, and whether it held. */
  checks: Record<string, boolean>
  invalidCitations: number
  totalCitations: number
  approvableMinor: number | null
}

/**
 * Scores one recommendation against a fixture's expectations, using the same
 * citation validation and eligibility engine as the app (PRD §10.8 metrics).
 */
export function scoreRecommendation(
  fixture: EvalFixture,
  recommendation: ResolutionRecommendation,
): RecommendationScore {
  const citations = validateCitations(
    recommendation.policyCitations,
    fixture.context.policies,
  )
  const eligibility = evaluateEligibility({
    context: fixture.context,
    caseStatus: fixture.caseStatus,
    recommendation,
    citations,
  })
  const { expected } = fixture
  const valid = citations.filter((c) => c.valid)

  const checks: Record<string, boolean> = {
    action: expected.actions.includes(recommendation.proposedAction),
    outcome: expected.outcomes.includes(eligibility.outcome),
    citationsValid: valid.length === citations.length,
    // Never approvable when the fixture says it mustn't be.
    escalation:
      expected.outcomes.includes("eligible_for_approval") ||
      eligibility.outcome !== "eligible_for_approval",
  }
  if (expected.citeAnyOf) {
    checks.cites = valid.some((c) => expected.citeAnyOf!.includes(c.clauseKey))
  }
  if (expected.flags) {
    checks.flags = expected.flags.every((code) =>
      recommendation.riskFlags.some((flag) => flag.code === code),
    )
  }
  if (expected.reportsMissingEvidence) {
    checks.missingEvidence = recommendation.evidenceMissing.length > 0
  }
  if (expected.reportsContradictions) {
    checks.contradictions = recommendation.contradictions.length > 0
  }
  if (expected.maxApprovableMinor !== undefined) {
    checks.amountBound =
      (eligibility.approvableAmountMinor ?? 0) <= expected.maxApprovableMinor
  }

  return {
    action: recommendation.proposedAction,
    outcome: eligibility.outcome,
    checks,
    invalidCitations: citations.length - valid.length,
    totalCitations: citations.length,
    approvableMinor: eligibility.approvableAmountMinor,
  }
}
