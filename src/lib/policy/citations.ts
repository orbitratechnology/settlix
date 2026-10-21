import type { ResolutionRecommendation } from "@/lib/ai/schemas"
import type { PolicySnapshot } from "@/lib/investigations/context"

export type CitationProblem =
  "unknown_policy" | "version_mismatch" | "unknown_clause" | "quote_not_found"

export type CheckedCitation =
  ResolutionRecommendation["policyCitations"][number] & {
    valid: boolean
    problem: CitationProblem | null
    clauseId: string | null
    clauseTitle: string | null
    policyName: string | null
  }

const MIN_QUOTE_LENGTH = 12

/** Lowercase, straight quotes and dashes, single spaces, no edge punctuation. */
export function normalizeQuoteText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'(\s]+|["')\s.,;:]+$/g, "")
    .toLowerCase()
}

/**
 * True when every fragment of the quote (split on ellipses) appears in the
 * clause, in order. Very short quotes only count when they are the whole clause.
 */
export function quoteAppearsIn(quote: string, clauseContent: string) {
  const content = normalizeQuoteText(clauseContent)
  const fragments = quote
    .split(/\.{3}|…/)
    .map(normalizeQuoteText)
    .filter(Boolean)
  if (fragments.length === 0) return false

  const total = fragments.reduce((sum, part) => sum + part.length, 0)
  if (total < MIN_QUOTE_LENGTH && fragments.join(" ") !== content) return false

  let from = 0
  for (const fragment of fragments) {
    const index = content.indexOf(fragment, from)
    if (index === -1) return false
    from = index + fragment.length
  }
  return true
}

/**
 * FR-07 / FR-16: every citation must resolve to a stored clause of a policy
 * version the investigation actually retrieved, and quote it verbatim.
 */
export function validateCitations(
  citations: ResolutionRecommendation["policyCitations"],
  policies: PolicySnapshot[],
): CheckedCitation[] {
  return citations.map((citation) => {
    const policy = policies.find((p) => p.policyId === citation.policyId)
    const clause = policy?.clauses.find(
      (c) => c.clauseKey === citation.clauseKey,
    )

    let problem: CitationProblem | null = null
    if (!policy) problem = "unknown_policy"
    else if (policy.version !== citation.policyVersion)
      problem = "version_mismatch"
    else if (!clause) problem = "unknown_clause"
    else if (!quoteAppearsIn(citation.supportingQuote, clause.content))
      problem = "quote_not_found"

    return {
      ...citation,
      valid: problem === null,
      problem,
      clauseId: clause?.clauseId ?? null,
      clauseTitle: clause?.title ?? null,
      policyName: policy?.name ?? null,
    }
  })
}

export const citationProblemLabels: Record<CitationProblem, string> = {
  unknown_policy: "Cites a policy that wasn't part of this investigation",
  version_mismatch: "Cites a different policy version",
  unknown_clause: "Cites a clause that doesn't exist in the policy",
  quote_not_found: "Quoted text doesn't appear in the clause",
}
