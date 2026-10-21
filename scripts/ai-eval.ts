/**
 * Live AI evaluation over the PRD §10.8 fixtures (src/lib/ai/evals/fixtures.ts).
 *
 *   bun run ai:eval                 # every fixture once
 *   bun run ai:eval --runs 3        # repeat to see variance
 *   bun run ai:eval --only prompt-injection
 *
 * Calls the real model from ANTHROPIC_MODEL with ANTHROPIC_API_KEY, runs the
 * same citation validation and eligibility engine as the app, and writes the
 * results to evals/results/. It writes nothing to the database.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { investigationModel } from "../src/lib/ai/client"
import { evalFixtures, type EvalFixture } from "../src/lib/ai/evals/fixtures"
import { scoreRecommendation } from "../src/lib/ai/evals/score"
import {
  InvestigationAiError,
  runInvestigationModel,
} from "../src/lib/ai/investigate"
import { PROMPT_VERSION } from "../src/lib/ai/prompts"

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "1" },
    only: { type: "string" },
  },
})

const handle = investigationModel()
if (!handle) {
  console.error(
    "ANTHROPIC_API_KEY and ANTHROPIC_MODEL must be set to run the live eval.",
  )
  process.exit(1)
}

const runs = Math.max(1, Number.parseInt(values.runs ?? "1", 10) || 1)
const fixtures = values.only
  ? evalFixtures.filter((fixture) => fixture.id === values.only)
  : evalFixtures
if (fixtures.length === 0) {
  console.error(`No fixture named ${values.only}`)
  process.exit(1)
}

type Score = {
  fixture: string
  run: number
  ok: boolean
  failure?: string
  action?: string
  outcome?: string
  checks: Record<string, boolean>
  invalidCitations: number
  totalCitations: number
  approvableMinor: number | null
  latencyMs: number
  usage?: { inputTokens: number | null; outputTokens: number | null }
  recommendation?: unknown
}

async function score(fixture: EvalFixture, run: number): Promise<Score> {
  const started = performance.now()
  try {
    const result = await runInvestigationModel({
      model: handle!.model,
      context: fixture.context,
      caseStatus: fixture.caseStatus,
    })
    const scored = scoreRecommendation(fixture, result.recommendation)
    return {
      fixture: fixture.id,
      run,
      ok: true,
      ...scored,
      latencyMs: Math.round(performance.now() - started),
      usage: result.usage,
      recommendation: result.recommendation,
    }
  } catch (error) {
    return {
      fixture: fixture.id,
      run,
      ok: false,
      failure:
        error instanceof InvestigationAiError ? error.kind : "unexpected_error",
      checks: { schemaValid: false },
      invalidCitations: 0,
      totalCitations: 0,
      approvableMinor: null,
      latencyMs: Math.round(performance.now() - started),
    }
  }
}

const scores: Score[] = []
for (let run = 1; run <= runs; run++) {
  for (const fixture of fixtures) {
    const result = await score(fixture, run)
    scores.push(result)
    const failed = Object.entries(result.checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)
    console.log(
      `${result.ok && failed.length === 0 ? "PASS" : "FAIL"}  ${fixture.id.padEnd(28)} ${
        result.ok
          ? `${result.action} → ${result.outcome}${failed.length ? ` (failed: ${failed.join(", ")})` : ""}`
          : `model call failed: ${result.failure}`
      }  ${result.latencyMs} ms`,
    )
  }
}

const completed = scores.filter((s) => s.ok)
const rate = (part: number, whole: number) =>
  whole === 0
    ? "n/a"
    : `${part}/${whole} (${Math.round((part / whole) * 100)}%)`
const metric = (name: string) => {
  const applicable = completed.filter((s) => name in s.checks)
  return rate(
    applicable.filter((s) => s.checks[name]).length,
    applicable.length,
  )
}
const totalCitations = completed.reduce((sum, s) => sum + s.totalCitations, 0)
const invalidCitations = completed.reduce(
  (sum, s) => sum + s.invalidCitations,
  0,
)

const summary = {
  model: handle.modelId,
  promptVersion: PROMPT_VERSION,
  runAt: new Date().toISOString(),
  fixtures: fixtures.length,
  runs,
  schemaValid: rate(completed.length, scores.length),
  correctAction: metric("action"),
  correctOutcome: metric("outcome"),
  citationValidity: rate(totalCitations - invalidCitations, totalCitations),
  // Citations that don't resolve to stored clause text: our measurable proxy
  // for unsupported claims.
  unsupportedCitationRate: rate(invalidCitations, totalCitations),
  expectedCitation: metric("cites"),
  missingEvidenceDetection: metric("missingEvidence"),
  contradictionDetection: metric("contradictions"),
  injectionFlagged: metric("flags"),
  amountBound: metric("amountBound"),
  // A fixture that must not be approvable never came out eligible.
  escalation: metric("escalation"),
}

console.log("\nSummary")
for (const [key, value] of Object.entries(summary)) {
  console.log(`  ${key.padEnd(26)} ${value}`)
}

mkdirSync("evals/results", { recursive: true })
const file = `evals/results/${summary.runAt.replace(/[:.]/g, "-")}-${handle.modelId}.json`
writeFileSync(file, `${JSON.stringify({ summary, scores }, null, 2)}\n`)
console.log(`\nWrote ${file}`)
