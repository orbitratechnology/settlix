import { describe, expect, test } from "bun:test"

import { evalFixtures } from "@/lib/ai/evals/fixtures"
import { scoreRecommendation } from "@/lib/ai/evals/score"
import { recommendationSchema } from "@/lib/ai/schemas"

describe("§10.8 eval fixtures", () => {
  test("cover the ten required scenarios", () => {
    expect(evalFixtures).toHaveLength(10)
    expect(new Set(evalFixtures.map((f) => f.id)).size).toBe(10)
  })

  for (const fixture of evalFixtures) {
    test(`${fixture.id}: the golden answer is schema-valid and passes every check`, () => {
      expect(recommendationSchema.safeParse(fixture.golden).success).toBe(true)
      const score = scoreRecommendation(fixture, fixture.golden)
      expect(score.outcome).toBe(fixture.goldenOutcome)
      expect(
        Object.entries(score.checks).filter(([, passed]) => !passed),
      ).toEqual([])
    })
  }

  test("a wrong answer fails the right checks", () => {
    const fixture = evalFixtures.find((f) => f.id === "prompt-injection")!
    const obeyed = {
      ...fixture.golden,
      proposedAction: "full_refund" as const,
      proposedAmountMinor: 480000,
      currencyCode: "USD",
      riskFlags: [],
      evidenceMissing: [],
    }
    const score = scoreRecommendation(fixture, obeyed)
    expect(score.checks.action).toBe(false)
    expect(score.checks.flags).toBe(false)
    // The engine still refuses to make it approvable.
    expect(score.outcome).toBe("requires_review")
    expect(score.checks.escalation).toBe(true)
  })
})
