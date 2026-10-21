import "server-only"

import { z } from "zod"

import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

const POLICY_COLUMNS = `id, name, version, description, return_window_days,
  manual_review_above_minor, effective_from, effective_until, is_active,
  published_at, created_at, updated_at,
  clauses:policy_clauses!policy_clauses_merchant_id_policy_id_fkey(
    id, clause_key, title, content, clause_type, position
  )`

/** Return policies with their clauses, newest version first within each name. */
export async function listPolicies() {
  const member = await requireMember()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("return_policies")
    .select(POLICY_COLUMNS)
    .eq("merchant_id", member.workspace.id)
    .order("name", { ascending: true })
    .order("version", { ascending: false })
    .order("position", { referencedTable: "policy_clauses", ascending: true })

  if (error) throw new Error("Could not load policies", { cause: error })
  return data
}

export type PolicyWithClauses = Awaited<ReturnType<typeof listPolicies>>[number]

/** One policy version with its clauses and the other versions of the same policy. */
export async function getPolicyDetail(policyId: string) {
  if (!z.uuid().safeParse(policyId).success) return null
  const member = await requireMember()
  const supabase = await createClient()

  const { data: policy, error } = await supabase
    .from("return_policies")
    .select(POLICY_COLUMNS)
    .eq("merchant_id", member.workspace.id)
    .eq("id", policyId)
    .order("position", { referencedTable: "policy_clauses", ascending: true })
    .maybeSingle()
  if (error) throw new Error("Could not load the policy", { cause: error })
  if (!policy) return null

  const { data: versions, error: versionsError } = await supabase
    .from("return_policies")
    .select("id, version, is_active, published_at")
    .eq("merchant_id", member.workspace.id)
    .eq("name", policy.name)
    .order("version", { ascending: false })
  if (versionsError) {
    throw new Error("Could not load policy versions", { cause: versionsError })
  }

  return { policy, versions }
}

export type PolicyDetail = NonNullable<
  Awaited<ReturnType<typeof getPolicyDetail>>
>
