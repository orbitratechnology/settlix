import type { ClauseType } from "@/lib/domain/labels"

type PolicyShape = {
  returnWindowDays: number | null
  manualReviewAboveMinor: number | null
  clauses: Array<{ clauseType: ClauseType; title: string }>
}

/**
 * Gaps in one policy version that weaken investigations (PRD §9.2 Screen E).
 * Warnings, not errors: a merchant may publish anyway.
 */
export function policyWarnings(policy: PolicyShape): string[] {
  const warnings: string[] = []
  const types = new Set(policy.clauses.map((clause) => clause.clauseType))

  if (policy.clauses.length === 0) {
    return [
      "Add at least one clause. A policy without clauses can't be published.",
    ]
  }
  if (policy.returnWindowDays === null) {
    warnings.push(
      "No return window is set, so the deterministic window check is skipped.",
    )
  }
  if (!types.has("return_window")) {
    warnings.push("No return-window clause for investigations to cite.")
  }
  if (!types.has("evidence_requirement")) {
    warnings.push(
      "No evidence requirements, so investigations can't ask for evidence based on policy.",
    )
  }
  if (!types.has("manual_review") && policy.manualReviewAboveMinor === null) {
    warnings.push("No manual-review clause or review threshold.")
  }
  const titles = policy.clauses.map((clause) =>
    clause.title.trim().toLowerCase(),
  )
  if (new Set(titles).size !== titles.length) {
    warnings.push("Two clauses share a title, which makes citations ambiguous.")
  }
  return warnings
}

/** Conflicts across the merchant's active policies. */
export function activePolicyWarnings(
  active: Array<{ name: string; returnWindowDays: number | null }>,
): string[] {
  if (active.length === 0) {
    return [
      "No policy is active. Every investigation will need a merchant review.",
    ]
  }
  const windows = [
    ...new Set(
      active
        .map((policy) => policy.returnWindowDays)
        .filter((days): days is number => days !== null),
    ),
  ].sort((a, b) => a - b)
  if (windows.length > 1) {
    return [
      `Active policies set different return windows (${windows.join(" and ")} days). Investigations will flag the conflict for review.`,
    ]
  }
  return []
}
