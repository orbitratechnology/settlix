/**
 * Merchant isolation and write protection against the real Supabase project
 * (PRD FR-02, E2E-08). Requires the seeded demo data (`bun run db:seed`) and
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Skipped when
 * those are not configured.
 */
import { beforeAll, describe, expect, test } from "bun:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { DEMO_ACCOUNT } from "@/lib/demo"
import type { Database } from "@/types/database"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const configured = Boolean(url && publishableKey)

const DEMO_MERCHANT_ID = "5eed0000-0000-4000-8000-000100000001"
const ISOLATION_MERCHANT_ID = "5eed0000-0000-4000-8000-000100000002"
const ISOLATION_CASE_ID = "5eed0000-0000-4000-8000-000500000901"
const DEMO_CASE_ID = "5eed0000-0000-4000-8000-000500000001"

function newClient() {
  return createClient<Database>(url!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

describe.skipIf(!configured)("row level security", () => {
  let member: SupabaseClient<Database>
  let anonymous: SupabaseClient<Database>

  beforeAll(async () => {
    anonymous = newClient()
    member = newClient()
    const { error } = await member.auth.signInWithPassword(DEMO_ACCOUNT)
    if (error) throw error
  })

  test("a member sees only their own merchant", async () => {
    const { data, error } = await member.from("merchants").select("id")
    expect(error).toBeNull()
    expect(data?.map((row) => row.id)).toEqual([DEMO_MERCHANT_ID])
  })

  test("every visible case belongs to the member's merchant", async () => {
    const { data, error } = await member.from("cases").select("merchant_id")
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    expect(data?.every((row) => row.merchant_id === DEMO_MERCHANT_ID)).toBe(
      true,
    )
  })

  test("another merchant's records are invisible even by ID", async () => {
    const tables = [
      member.from("cases").select("id").eq("id", ISOLATION_CASE_ID),
      member
        .from("orders")
        .select("id")
        .eq("merchant_id", ISOLATION_MERCHANT_ID),
      member
        .from("return_policies")
        .select("id")
        .eq("merchant_id", ISOLATION_MERCHANT_ID),
      member
        .from("policy_clauses")
        .select("id")
        .eq("merchant_id", ISOLATION_MERCHANT_ID),
    ]
    for (const query of tables) {
      const { data, error } = await query
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
  })

  test("members cannot write directly, even to their own merchant", async () => {
    const update = await member
      .from("cases")
      .update({ status: "READY_FOR_APPROVAL" })
      .eq("id", DEMO_CASE_ID)
    expect(update.error?.code).toBe("42501")

    const insertAudit = await member.from("audit_events").insert({
      merchant_id: DEMO_MERCHANT_ID,
      actor_type: "system",
      event_type: "case.created",
      event_summary: "forged",
      origin: "app",
    })
    expect(insertAudit.error?.code).toBe("42501")

    const insertRefund = await member.from("refund_attempts").insert({
      merchant_id: DEMO_MERCHANT_ID,
      case_id: DEMO_CASE_ID,
      order_id: "5eed0000-0000-4000-8000-000400000001",
      approved_at: new Date().toISOString(),
      approved_amount_minor: 100,
      currency_code: "USD",
      idempotency_key: crypto.randomUUID(),
      request_hash: "a".repeat(64),
      origin: "app",
    })
    expect(insertRefund.error?.code).toBe("42501")
  })

  test("signed-out requests cannot read any business table", async () => {
    for (const table of [
      "merchants",
      "cases",
      "orders",
      "audit_events",
    ] as const) {
      const { data, error } = await anonymous.from(table).select("id").limit(1)
      expect(data ?? []).toEqual([])
      expect(error?.code).toBe("42501")
    }
  })
})
