import { describe, expect, test } from "bun:test"

import { standardPolicy } from "@/lib/ai/evals/fixtures"
import { activePolicyWarnings, policyWarnings } from "@/lib/policy/warnings"

describe("policyWarnings", () => {
  test("the seeded standard policy has no gaps", () => {
    expect(policyWarnings(standardPolicy)).toEqual([])
  })

  test("an empty draft only asks for clauses", () => {
    expect(
      policyWarnings({
        returnWindowDays: null,
        manualReviewAboveMinor: null,
        clauses: [],
      }),
    ).toEqual([
      "Add at least one clause. A policy without clauses can't be published.",
    ])
  })

  test("reports missing structure and ambiguous titles", () => {
    const warnings = policyWarnings({
      returnWindowDays: null,
      manualReviewAboveMinor: null,
      clauses: [
        { clauseType: "full_refund", title: "Damaged" },
        { clauseType: "partial_refund", title: "damaged " },
      ],
    })
    expect(warnings).toHaveLength(5)
    expect(warnings.join(" ")).toContain("No return window is set")
    expect(warnings.join(" ")).toContain("share a title")
  })

  test("a review threshold stands in for a manual-review clause", () => {
    const warnings = policyWarnings({
      ...standardPolicy,
      clauses: standardPolicy.clauses.filter(
        (clause) => clause.clauseType !== "manual_review",
      ),
    })
    expect(warnings).toEqual([])
  })
})

describe("activePolicyWarnings", () => {
  test("no active policy", () => {
    expect(activePolicyWarnings([])[0]).toContain("No policy is active")
  })

  test("different return windows conflict", () => {
    expect(
      activePolicyWarnings([
        { name: "Holiday", returnWindowDays: 60 },
        { name: "Standard", returnWindowDays: 30 },
      ]),
    ).toEqual([
      "Active policies set different return windows (30 and 60 days). Investigations will flag the conflict for review.",
    ])
    expect(
      activePolicyWarnings([
        { name: "A", returnWindowDays: 30 },
        { name: "B", returnWindowDays: null },
      ]),
    ).toEqual([])
  })
})
