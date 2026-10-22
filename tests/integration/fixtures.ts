/**
 * Shared fixtures for integration tests that write. Each run gets its own
 * merchant ("Integration test run …", is_demo) with one active policy, so
 * runs never touch demo data or share rate limits. Orders use clearly fake
 * TEST… PayPal IDs; nothing here is a real payment or refund.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Member } from "@/lib/security/auth"
import type { Database } from "@/types/database"

export const integrationConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
)

/** A real auth user (FKs need one) that never signs in. */
export const APPROVER_ID = "5eed0000-0000-4000-8000-000900000001"
const APPROVER_EMAIL = "integration-approver@settlix.example"

export const DEMO_CASE_ID = "5eed0000-0000-4000-8000-000500000001"
export const ISOLATION_MERCHANT_ID = "5eed0000-0000-4000-8000-000100000002"

export const FULL_REFUND_CLAUSE =
  "Eligible requests receive a full refund of the amount paid."
export const PARTIAL_REFUND_CLAUSE =
  "A partial refund covers only the affected part of the order."

export type TestDb = SupabaseClient<Database>

export function adminClient(): TestDb {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function ensureApprover(db: TestDb) {
  const { data } = await db.auth.admin.getUserById(APPROVER_ID)
  if (data.user) return
  const { error } = await db.auth.admin.createUser({
    id: APPROVER_ID,
    email: APPROVER_EMAIL,
    email_confirm: true,
    user_metadata: { purpose: "integration tests; never signs in" },
  })
  if (error) throw error
}

/** A fresh merchant with an active published policy and an admin member. */
export async function createTestMerchant(db: TestDb) {
  await ensureApprover(db)
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const { data: merchant, error: merchantError } = await db
    .from("merchants")
    .insert({
      name: `Integration test run ${runId}`,
      slug: `itest-${runId}`,
      is_demo: true,
    })
    .select("id, name, slug")
    .single()
  if (merchantError) throw merchantError

  const { data: policy, error: policyError } = await db
    .from("return_policies")
    .insert({
      merchant_id: merchant.id,
      name: "Integration Test Policy",
      version: 1,
      return_window_days: 30,
      effective_from: "2026-01-01",
    })
    .select("id")
    .single()
  if (policyError) throw policyError
  const { error: clauseError } = await db.from("policy_clauses").insert([
    {
      merchant_id: merchant.id,
      policy_id: policy.id,
      clause_key: "RF-1",
      clause_type: "full_refund",
      title: "Full refund",
      content: FULL_REFUND_CLAUSE,
      position: 1,
    },
    {
      merchant_id: merchant.id,
      policy_id: policy.id,
      clause_key: "PR-1",
      clause_type: "partial_refund",
      title: "Partial refund",
      content: PARTIAL_REFUND_CLAUSE,
      position: 2,
    },
  ])
  if (clauseError) throw clauseError
  const { error: activateError } = await db.rpc("activate_policy_version", {
    p_merchant_id: merchant.id,
    p_policy_id: policy.id,
  })
  if (activateError) throw activateError

  const member: Member = {
    userId: APPROVER_ID,
    email: APPROVER_EMAIL,
    role: "admin",
    workspace: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      isDemo: true,
      defaultCurrency: "USD",
    },
  }
  return { merchantId: merchant.id, policyId: policy.id, member }
}

let caseCount = 0

/** A captured test order (fake TEST… PayPal IDs) and a NEW case for it. */
export async function createTestCase(
  db: TestDb,
  merchantId: string,
  {
    capturedMinor = 2400,
    requestedMinor = capturedMinor as number | null,
  } = {},
) {
  caseCount += 1
  const suffix = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 12)
    .toUpperCase()
  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      merchant_id: merchantId,
      external_order_reference: `TEST-${suffix}`,
      paypal_order_id: `TESTORDER${suffix}`,
      paypal_capture_id: `TESTCAPTURE${suffix}`,
      description: "Integration test order (PayPal test double)",
      original_amount_minor: capturedMinor,
      currency_code: "USD",
      captured_at: new Date().toISOString(),
      payment_state: "CAPTURED",
      origin: "app",
    })
    .select("id, paypal_capture_id")
    .single()
  if (orderError) throw orderError

  const { data: created, error: caseError } = await db
    .from("cases")
    .insert({
      merchant_id: merchantId,
      order_id: order.id,
      case_number: `STX-${caseCount}`,
      customer_display_name: "Test Customer",
      customer_message: "Please refund my order.",
      claimed_issue: "Integration test request",
      request_category: "other",
      requested_amount_minor: requestedMinor,
      currency_code: "USD",
      supporting_details: "Merchant notes confirm the request.",
      origin: "app",
    })
    .select("id")
    .single()
  if (caseError) throw caseError

  return {
    caseId: created.id,
    orderId: order.id,
    captureId: order.paypal_capture_id!,
  }
}
