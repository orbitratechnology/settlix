/**
 * Investigation service against the real Supabase project with a mock model
 * (no Claude call): the claim, the append-only investigation row, case status
 * transitions, audit events, failure recovery (PRD §15 Claude timeout and
 * invalid structure, E2E-06), and merchant scoping.
 *
 * Runs on a per-run test merchant (see ./fixtures), so demo data is untouched
 * and runs don't share the investigation rate limit. Investigations and audit
 * events are append-only, so each run leaves a few rows there. Skipped without
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { MockLanguageModelV4 } from "ai/test"

import { PROMPT_VERSION } from "@/lib/ai/prompts"
import type { ResolutionRecommendation } from "@/lib/ai/schemas"
import type { Member } from "@/lib/security/auth"

import {
  adminClient,
  createTestCase,
  createTestMerchant,
  DEMO_CASE_ID,
  FULL_REFUND_CLAUSE,
  integrationConfigured,
  type TestDb,
} from "./fixtures"

function mockModel(text: string) {
  return {
    modelId: "mock-model",
    model: new MockLanguageModelV4({
      modelId: "mock-model",
      doGenerate: async () => ({
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      }),
    }),
  }
}

describe.skipIf(!integrationConfigured)("investigation service", () => {
  let db: TestDb
  let investigateCase: typeof import("@/lib/investigations/service").investigateCase
  let faultModel: typeof import("@/lib/testing/fault-models").faultModel
  let member: Member
  let merchantId: string
  let recommendation: ResolutionRecommendation

  beforeAll(async () => {
    db = adminClient()
    ;({ investigateCase } = await import("@/lib/investigations/service"))
    ;({ faultModel } = await import("@/lib/testing/fault-models"))
    const merchant = await createTestMerchant(db)
    ;({ member, merchantId } = merchant)
    recommendation = {
      summary: "Test case with no clear claim.",
      extractedFacts: [],
      proposedAction: "manual_review",
      proposedAmountMinor: null,
      currencyCode: null,
      policyCitations: [
        {
          policyId: merchant.policyId,
          policyVersion: 1,
          clauseKey: "RF-1",
          supportingQuote: FULL_REFUND_CLAUSE,
          explanation: "The only refund clause available.",
        },
      ],
      evidenceFor: [],
      evidenceMissing: [],
      contradictions: [],
      riskFlags: [],
      explanation: "Nothing in the case supports a refund decision yet.",
      suggestedCustomerReply: "Thanks for your message. We're looking into it.",
    }
  })

  const caseStatus = async (caseId: string) =>
    (await db.from("cases").select("status").eq("id", caseId).single()).data
      ?.status

  const eventsSince = async (caseId: string, since: string) =>
    (
      await db
        .from("audit_events")
        .select("event_type, actor_type")
        .eq("case_id", caseId)
        .gte("created_at", since)
        .order("created_at")
    ).data!

  test("stores a validated investigation and moves the case to its outcome", async () => {
    const { caseId } = await createTestCase(db, merchantId)
    const started = new Date().toISOString()
    const result = await investigateCase(member, caseId, {
      model: mockModel(JSON.stringify(recommendation)),
    })
    expect(result).toMatchObject({
      status: "completed",
      outcome: "requires_review",
      caseStatus: "NEEDS_REVIEW",
    })
    if (result.status !== "completed") return

    const { data: row } = await db
      .from("investigations")
      .select("*")
      .eq("id", result.investigationId)
      .single()
    expect(row?.merchant_id).toBe(merchantId)
    expect(row?.prompt_version).toBe(PROMPT_VERSION)
    expect(row?.model_id).toBe("mock-model")
    expect(row?.input_context_hash).toMatch(/^[a-f0-9]{64}$/)
    const stored = row?.recommendation_json as {
      citations: Array<{ valid: boolean }>
    }
    expect(stored.citations[0].valid).toBe(true)
    expect(await caseStatus(caseId)).toBe("NEEDS_REVIEW")

    const events = await eventsSince(caseId, started)
    expect(events.map((e) => e.event_type)).toEqual([
      "investigation.started",
      "investigation.completed",
    ])
    expect(events[1].actor_type).toBe("ai")
  })

  // §15 "Invalid AI structure" and "Claude timeout"; E2E-06 uses the same
  // fault models through the API.
  for (const failure of [
    {
      name: "an invalid model answer",
      model: () => mockModel('{"proposedAction":"full_refund"}'),
      kind: "invalid_output",
    },
    {
      name: "the ai_invalid_output test fault",
      model: () => faultModel("ai_invalid_output"),
      kind: "invalid_output",
    },
    {
      name: "the ai_timeout test fault",
      model: () => faultModel("ai_timeout"),
      kind: "timeout",
    },
  ]) {
    test(`${failure.name} is discarded and the case is restored`, async () => {
      const { caseId } = await createTestCase(db, merchantId)
      const started = new Date().toISOString()
      const result = await investigateCase(member, caseId, {
        model: failure.model(),
      })
      expect(result).toMatchObject({
        status: "error",
        code: "ai_failed",
        aiFailure: failure.kind,
      })
      expect(await caseStatus(caseId)).toBe("NEW")
      expect(
        (await eventsSince(caseId, started)).map((e) => e.event_type),
      ).toEqual(["investigation.started", "investigation.failed"])

      const { count: investigations } = await db
        .from("investigations")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
      const { count: attempts } = await db
        .from("refund_attempts")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId)
      expect([investigations, attempts]).toEqual([0, 0])
    })
  }

  test("another merchant's case is not found", async () => {
    const result = await investigateCase(member, DEMO_CASE_ID, {
      model: mockModel(JSON.stringify(recommendation)),
    })
    expect(result).toMatchObject({ status: "error", code: "not_found" })
  })

  test("support members pass the role check; unknown IDs are not found", async () => {
    const result = await investigateCase(
      { ...member, role: "support" },
      "00000000-0000-4000-8000-000000000000",
      { model: mockModel("{}") },
    )
    expect(result).toMatchObject({ status: "error", code: "not_found" })
  })
})
