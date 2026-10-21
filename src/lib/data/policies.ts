import "server-only"

import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

/** Return policies with their clauses, newest version first within each name. */
export async function listPolicies() {
  const member = await requireMember()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("return_policies")
    .select(
      `id, name, version, description, return_window_days, effective_from,
       effective_until, is_active, updated_at,
       clauses:policy_clauses!policy_clauses_merchant_id_policy_id_fkey(
         id, clause_key, title, content, clause_type, position
       )`,
    )
    .eq("merchant_id", member.workspace.id)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true })
    .order("version", { ascending: false })
    .order("position", { referencedTable: "policy_clauses", ascending: true })

  if (error) throw new Error("Could not load policies", { cause: error })
  return data
}

export type PolicyWithClauses = Awaited<ReturnType<typeof listPolicies>>[number]
