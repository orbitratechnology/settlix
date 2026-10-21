import { describe, expect, test } from "bun:test"

import { standardPolicy } from "@/lib/ai/evals/fixtures"
import { quoteAppearsIn, validateCitations } from "@/lib/policy/citations"

const fr1 = standardPolicy.clauses.find((c) => c.clauseKey === "FR-1")!

describe("quoteAppearsIn", () => {
  test("accepts verbatim text regardless of case, spacing, and curly quotes", () => {
    expect(
      quoteAppearsIn(
        "Damaged items valued under $100 do not need to be returned.",
        fr1.content,
      ),
    ).toBe(true)
    expect(
      quoteAppearsIn(
        "  the CUSTOMER is eligible   for a full refund ",
        fr1.content,
      ),
    ).toBe(true)
    expect(
      quoteAppearsIn(
        "“the customer’s statements conflict with order or tracking records”",
        "Any request where the customer's statements conflict with order or tracking records.",
      ),
    ).toBe(true)
  })

  test("accepts fragments joined by an ellipsis, in order", () => {
    expect(
      quoteAppearsIn(
        "If an item arrives damaged … do not need to be returned",
        fr1.content,
      ),
    ).toBe(true)
    expect(
      quoteAppearsIn(
        "do not need to be returned ... If an item arrives damaged",
        fr1.content,
      ),
    ).toBe(false)
  })

  test("rejects paraphrases and trivially short quotes", () => {
    expect(
      quoteAppearsIn("Damaged items always get a full refund.", fr1.content),
    ).toBe(false)
    expect(quoteAppearsIn("refund", fr1.content)).toBe(false)
    expect(quoteAppearsIn("…", fr1.content)).toBe(false)
  })
})

describe("validateCitations", () => {
  const base = {
    policyId: standardPolicy.policyId,
    policyVersion: 2,
    clauseKey: "FR-1",
    supportingQuote:
      "Damaged items valued under $100 do not need to be returned.",
    explanation: "Applies.",
  }

  test("resolves a valid citation to its stored clause", () => {
    const [checked] = validateCitations([base], [standardPolicy])
    expect(checked.valid).toBe(true)
    expect(checked.problem).toBeNull()
    expect(checked.clauseId).toBe(fr1.clauseId)
    expect(checked.clauseTitle).toBe(fr1.title)
    expect(checked.policyName).toBe("Standard Return Policy")
  })

  test("flags unknown policies, versions, clauses, and quotes", () => {
    const problems = validateCitations(
      [
        { ...base, policyId: "00000000-0000-4000-8000-00000000dead" },
        { ...base, policyVersion: 1 },
        { ...base, clauseKey: "FR-9" },
        { ...base, supportingQuote: "Refunds are always issued in full." },
      ],
      [standardPolicy],
    ).map((c) => [c.valid, c.problem])
    expect(problems).toEqual([
      [false, "unknown_policy"],
      [false, "version_mismatch"],
      [false, "unknown_clause"],
      [false, "quote_not_found"],
    ])
  })

  test("a quote from a different clause of the same policy is rejected", () => {
    const [checked] = validateCitations(
      [
        {
          ...base,
          clauseKey: "RW-1",
          supportingQuote:
            "Damaged items valued under $100 do not need to be returned.",
        },
      ],
      [standardPolicy],
    )
    expect(checked.problem).toBe("quote_not_found")
  })
})
