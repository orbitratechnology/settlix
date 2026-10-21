/**
 * Investigation service against the real Supabase project with a mock model
 * (no Claude call): the claim, the append-only investigation row, case status
 * transitions, audit events, failure recovery, and merchant scoping.
 *
 * Runs on the isolation merchant's case so demo data is untouched. Investigations
 * and audit events are append-only, so each run adds a few rows there. Requires
 * the seed data; skipped without NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { MockLanguageModelV4 } from "ai/test"

import type { ResolutionRecommendation } from "@/lib/ai/schemas"
import type { Member } from "@/lib/security/auth"
import type { Database } from "@/types/database"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const configured = Boolean(url && secretKey)

const ISOLATION_MERCHANT_ID = "5eed0000-0000-4000-8000-000100000002"
const ISOLATION_POLICY_ID = "5eed0000-0000-4000-8000-000200000009"
const ISOLATION_CASE_ID = "5eed0000-0000-4000-8000-000500000901"
const DEMO_CASE_ID = "5eed0000-0000-4000-8000-000500000001"

const member: Member = {
  userId: crypto.randomUUID(),
  email: null,
  role: "admin",
  workspace: {
    id: ISOLATION_MERCHANT_ID,
    name: "Isolation Test Merchant",
    slug: "isolation-test",
    isDemo: true,
    defaultCurrency: "USD",
  },
}

const recommendation: ResolutionRecommendation = {
  summary: "Isolation check case with no clear claim.",
  extractedFacts: [],
  proposedAction: "manual_review",
  proposedAmountMinor: null,
  currencyCode: null,
  policyCitations: [
    {
      policyId: ISOLATION_POLICY_ID,
      policyVersion: 1,
      clauseKey: "RW-1",
      supportingQuote: "Isolation merchant clause.",
      explanation: "The only clause available.",
    },
  ],
  evidenceFor: [],
  evidenceMissing: [],
  contradictions: [],
  riskFlags: [],
  explanation: "Nothing in the case supports a refund decision.",
  suggestedCustomerReply: "Thanks for your message. We're looking into it.",
}

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

describe.skipIf(!configured)("investigation service", () => {
  let db: SupabaseClient<Database>
  let investigateCase: typeof import("@/lib/investigations/service").investigateCase

  beforeAll(async () => {
    db = createClient<Database>(url!, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    ;({ investigateCase } = await import("@/lib/investigations/service"))
  })

  const caseStatus = async () =>
    (
      await db
        .from("cases")
        .select("status")
        .eq("id", ISOLATION_CASE_ID)
        .single()
    ).data?.status

  test("stores a validated investigation and moves the case to its outcome", async () => {
    const started = new Date().toISOString()
    const result = await investigateCase(member, ISOLATION_CASE_ID, {
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
    expect(row?.merchant_id).toBe(ISOLATION_MERCHANT_ID)
    expect(row?.prompt_version).toBe("investigation-v1")
    expect(row?.model_id).toBe("mock-model")
    expect(row?.input_context_hash).toMatch(/^[a-f0-9]{64}$/)
    const stored = row?.recommendation_json as {
      citations: Array<{ valid: boolean }>
    }
    expect(stored.citations[0].valid).toBe(true)
    expect(await caseStatus()).toBe("NEEDS_REVIEW")

    const { data: events } = await db
      .from("audit_events")
      .select("event_type, actor_type")
      .eq("case_id", ISOLATION_CASE_ID)
      .gte("created_at", started)
      .order("created_at")
    expect(events?.map((e) => e.event_type)).toEqual([
      "investigation.started",
      "investigation.completed",
    ])
    expect(events?.[1].actor_type).toBe("ai")
  })

  test("an invalid model answer is discarded and the case is restored", async () => {
    const before = await caseStatus()
    const started = new Date().toISOString()
    const result = await investigateCase(member, ISOLATION_CASE_ID, {
      model: mockModel('{"proposedAction":"full_refund"}'),
    })
    expect(result).toMatchObject({
      status: "error",
      code: "ai_failed",
      aiFailure: "invalid_output",
    })
    expect(await caseStatus()).toBe(before)

    const { data: events } = await db
      .from("audit_events")
      .select("event_type")
      .eq("case_id", ISOLATION_CASE_ID)
      .gte("created_at", started)
      .order("created_at")
    expect(events?.map((e) => e.event_type)).toEqual([
      "investigation.started",
      "investigation.failed",
    ])
    const { count } = await db
      .from("refund_attempts")
      .select("id", { count: "exact", head: true })
      .eq("case_id", ISOLATION_CASE_ID)
    expect(count).toBe(0)
  })

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
