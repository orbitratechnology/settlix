/**
 * The E2E suite's own workspace: a merchant, an admin account, and an active
 * policy (the demo policy's clauses plus cancellation and price adjustment).
 * Created idempotently by global-setup so the suite never touches the public
 * demo workspace. Live tests add real PayPal Sandbox payments and refunds here.
 *
 * The account's password is derived from SUPABASE_SECRET_KEY, so whoever can
 * run the suite can sign in and nobody else can.
 */
import { createHmac } from "node:crypto"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  cancellationClause,
  priceAdjustmentClause,
  standardPolicyV2Clauses,
} from "../../src/lib/demo-policies"
import type { Database } from "../../src/types/database"

export const E2E_MERCHANT_ID = "e2e00000-0000-4000-8000-000000000001"
export const E2E_POLICY_ID = "e2e00000-0000-4000-8000-000000000002"
const E2E_USER_ID = "e2e00000-0000-4000-8000-000000000003"

/** A demo-merchant case the E2E account must never reach (E2E-08). */
export const DEMO_CASE_ID = "5eed0000-0000-4000-8000-000500000001"

export type E2eDb = SupabaseClient<Database>

export function e2eConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
  )
}

export function e2eAccount() {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error("SUPABASE_SECRET_KEY must be set for E2E")
  return {
    email: "e2e@settlix.example",
    password: createHmac("sha256", secret)
      .update("settlix-e2e-account-v1")
      .digest("base64url")
      .slice(0, 32),
  }
}

export function adminDb(): E2eDb {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** Unwraps a Supabase response; after a successful call the data is present. */
async function must<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

export async function ensureE2eWorkspace(db: E2eDb) {
  const account = e2eAccount()
  const { data: existing } = await db.auth.admin.getUserById(E2E_USER_ID)
  const { error: userError } = existing.user
    ? await db.auth.admin.updateUserById(E2E_USER_ID, {
        password: account.password,
      })
    : await db.auth.admin.createUser({
        id: E2E_USER_ID,
        email: account.email,
        password: account.password,
        email_confirm: true,
        app_metadata: { e2e: true },
      })
  if (userError) throw userError

  await must(
    db.from("merchants").upsert(
      {
        id: E2E_MERCHANT_ID,
        name: "Settlix E2E Store",
        slug: "settlix-e2e",
        default_currency: "USD",
        is_demo: false,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
  )
  await must(
    db
      .from("merchant_members")
      .upsert(
        { merchant_id: E2E_MERCHANT_ID, user_id: E2E_USER_ID, role: "admin" },
        { onConflict: "merchant_id,user_id", ignoreDuplicates: true },
      ),
  )

  const { data: policy, error: policyError } = await db
    .from("return_policies")
    .select("id, is_active")
    .eq("id", E2E_POLICY_ID)
    .maybeSingle()
  if (policyError) throw new Error(policyError.message)
  if (policy?.is_active) return
  if (!policy) {
    // Published versions are immutable: insert a draft, add clauses, publish.
    await must(
      db.from("return_policies").insert({
        id: E2E_POLICY_ID,
        merchant_id: E2E_MERCHANT_ID,
        name: "E2E Return Policy",
        version: 1,
        description:
          "The demo policy's clauses plus cancellation before dispatch and price adjustment.",
        return_window_days: 30,
        manual_review_above_minor: 50000,
        effective_from: "2026-01-01",
      }),
    )
    await must(
      db.from("policy_clauses").insert(
        [
          ...standardPolicyV2Clauses,
          cancellationClause,
          priceAdjustmentClause,
        ].map((clause) => ({
          ...clause,
          merchant_id: E2E_MERCHANT_ID,
          policy_id: E2E_POLICY_ID,
        })),
      ),
    )
  }
  await must(
    db.rpc("activate_policy_version", {
      p_merchant_id: E2E_MERCHANT_ID,
      p_policy_id: E2E_POLICY_ID,
    }),
  )
}

/**
 * A labeled demo-data case with an order captured days ago (no PayPal IDs), for
 * flows that need history a fresh sandbox payment can't have.
 */
export async function createSeedCase(
  db: E2eDb,
  input: {
    description: string
    amountMinor: number
    capturedDaysAgo: number
    case: {
      customer_display_name: string
      request_category: Database["public"]["Enums"]["request_category"]
      claimed_issue: string
      customer_message: string
      requested_amount_minor: number | null
      supporting_details: string | null
    }
  },
) {
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase()
  const day = 24 * 60 * 60 * 1000
  const order = await must(
    db
      .from("orders")
      .insert({
        merchant_id: E2E_MERCHANT_ID,
        external_order_reference: `E2E-${suffix}`,
        description: input.description,
        original_amount_minor: input.amountMinor,
        currency_code: "USD",
        captured_at: new Date(
          Date.now() - input.capturedDaysAgo * day,
        ).toISOString(),
        payment_state: "CAPTURED",
        origin: "seed",
      })
      .select("id")
      .single(),
  )
  const created = await must(
    db
      .from("cases")
      .insert({
        ...input.case,
        merchant_id: E2E_MERCHANT_ID,
        order_id: order.id,
        case_number: `DEMO-${Date.now()}`,
        currency_code: "USD",
        origin: "seed",
      })
      .select("id, case_number")
      .single(),
  )
  return created
}

/**
 * A labeled demo order with a buyer email and no request yet, for the public
 * request form. The email is unique per call.
 */
export async function createBuyerOrder(db: E2eDb, description: string) {
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase()
  const order = await must(
    db
      .from("orders")
      .insert({
        merchant_id: E2E_MERCHANT_ID,
        external_order_reference: `E2E-F${suffix}`,
        description,
        original_amount_minor: 3800,
        currency_code: "USD",
        captured_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        payment_state: "CAPTURED",
        origin: "seed",
        customer_email: `buyer-${suffix.toLowerCase()}@example.com`,
        customer_name: `Form Buyer ${suffix}`,
      })
      .select("id, external_order_reference, customer_email, customer_name")
      .single(),
  )
  return {
    id: order.id,
    reference: order.external_order_reference,
    email: order.customer_email!,
    name: order.customer_name!,
  }
}

type StoreSettings = {
  request_form_enabled: boolean
  auto_check_requests: boolean
}

/** Sets the E2E store's form settings and returns the previous ones. */
export async function setStoreSettings(
  db: E2eDb,
  settings: Partial<StoreSettings>,
): Promise<StoreSettings> {
  const previous = await must(
    db
      .from("merchants")
      .select("request_form_enabled, auto_check_requests")
      .eq("id", E2E_MERCHANT_ID)
      .single(),
  )
  await must(db.from("merchants").update(settings).eq("id", E2E_MERCHANT_ID))
  return previous
}
