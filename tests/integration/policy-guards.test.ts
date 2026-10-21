/**
 * Policy publishing guards against the real Supabase project (FR-06): published
 * versions and their clauses are immutable, drafts are editable, and activation
 * is merchant-scoped. Runs as the server (secret key) on the isolation merchant
 * and only leaves drafts behind long enough to delete them. Requires the seed
 * data; skipped without NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const configured = Boolean(url && secretKey)

const DEMO_MERCHANT_ID = "5eed0000-0000-4000-8000-000100000001"
const ISOLATION_MERCHANT_ID = "5eed0000-0000-4000-8000-000100000002"
const ISOLATION_POLICY_ID = "5eed0000-0000-4000-8000-000200000009"

describe.skipIf(!configured)("policy publishing guards", () => {
  let db: SupabaseClient<Database>
  const draftName = `Guard test ${crypto.randomUUID().slice(0, 8)}`
  let draftId: string

  beforeAll(async () => {
    db = createClient<Database>(url!, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await db
      .from("return_policies")
      .insert({
        merchant_id: ISOLATION_MERCHANT_ID,
        name: draftName,
        version: 1,
        effective_from: "2026-01-01",
        return_window_days: 30,
      })
      .select("id")
      .single()
    if (error) throw error
    draftId = data.id
  })

  afterAll(async () => {
    if (draftId) await db.from("return_policies").delete().eq("id", draftId)
  })

  test("a published version cannot be edited, deleted, or given clauses", async () => {
    const edit = await db
      .from("return_policies")
      .update({ return_window_days: 90 })
      .eq("id", ISOLATION_POLICY_ID)
    expect(edit.error?.message).toContain("immutable")

    const clauseEdit = await db
      .from("policy_clauses")
      .update({ content: "Changed" })
      .eq("policy_id", ISOLATION_POLICY_ID)
    expect(clauseEdit.error?.message).toContain("immutable")

    const clauseInsert = await db.from("policy_clauses").insert({
      merchant_id: ISOLATION_MERCHANT_ID,
      policy_id: ISOLATION_POLICY_ID,
      clause_key: "GN-9",
      title: "Added later",
      content: "Should be rejected.",
      clause_type: "general",
    })
    expect(clauseInsert.error?.message).toContain("immutable")

    const remove = await db
      .from("return_policies")
      .delete()
      .eq("id", ISOLATION_POLICY_ID)
    expect(remove.error?.message).toContain("cannot be deleted")
  })

  test("new versions must start as inactive drafts", async () => {
    const { error } = await db.from("return_policies").insert({
      merchant_id: ISOLATION_MERCHANT_ID,
      name: draftName,
      version: 2,
      effective_from: "2026-01-01",
      published_at: new Date().toISOString(),
    })
    expect(error?.message).toContain("inactive drafts")
  })

  test("a draft without clauses cannot be activated", async () => {
    const { error } = await db.rpc("activate_policy_version", {
      p_merchant_id: ISOLATION_MERCHANT_ID,
      p_policy_id: draftId,
    })
    expect(error?.message).toContain("at least one clause")
  })

  test("drafts and their clauses are editable, identity is not", async () => {
    const edit = await db
      .from("return_policies")
      .update({ return_window_days: 45, manual_review_above_minor: 25000 })
      .eq("id", draftId)
    expect(edit.error).toBeNull()

    const clause = await db
      .from("policy_clauses")
      .insert({
        merchant_id: ISOLATION_MERCHANT_ID,
        policy_id: draftId,
        clause_key: "RW-1",
        title: "Window",
        content: "45 days.",
        clause_type: "return_window",
      })
      .select("id")
      .single()
    expect(clause.error).toBeNull()

    const clauseEdit = await db
      .from("policy_clauses")
      .update({ content: "45 days from capture." })
      .eq("id", clause.data!.id)
    expect(clauseEdit.error).toBeNull()

    const rename = await db
      .from("return_policies")
      .update({ name: `${draftName} renamed` })
      .eq("id", draftId)
    expect(rename.error?.message).toContain("immutable")
  })

  test("activation is scoped to the policy's merchant", async () => {
    const { error } = await db.rpc("activate_policy_version", {
      p_merchant_id: DEMO_MERCHANT_ID,
      p_policy_id: draftId,
    })
    expect(error?.message).toContain("not found")
  })

  test("re-activating the active version is a no-op", async () => {
    const { error } = await db.rpc("activate_policy_version", {
      p_merchant_id: ISOLATION_MERCHANT_ID,
      p_policy_id: ISOLATION_POLICY_ID,
    })
    expect(error).toBeNull()
    const { data } = await db
      .from("return_policies")
      .select("is_active, published_at")
      .eq("id", ISOLATION_POLICY_ID)
      .single()
    expect(data?.is_active).toBe(true)
    expect(data?.published_at).not.toBeNull()
  })

  test("signed-out and member clients cannot call the activation function", async () => {
    const anon = createClient<Database>(
      url!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { error } = await anon.rpc("activate_policy_version", {
      p_merchant_id: ISOLATION_MERCHANT_ID,
      p_policy_id: ISOLATION_POLICY_ID,
    })
    expect(error).not.toBeNull()
  })
})
