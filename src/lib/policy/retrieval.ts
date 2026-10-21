import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { PolicySnapshot } from "@/lib/investigations/context"
import type { Database } from "@/types/database"

/**
 * Merchant-scoped policy retrieval (PRD §10.6): the active, published versions
 * with their clauses, in a stable order so snapshots hash deterministically.
 */
export async function getApplicablePolicies(
  db: SupabaseClient<Database>,
  merchantId: string,
): Promise<PolicySnapshot[]> {
  const { data, error } = await db
    .from("return_policies")
    .select(
      `id, name, version, effective_from, effective_until, return_window_days,
       manual_review_above_minor,
       clauses:policy_clauses!policy_clauses_merchant_id_policy_id_fkey(
         id, clause_key, title, clause_type, content, position
       )`,
    )
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .order("name", { ascending: true })
    .order("version", { ascending: true })

  if (error) throw new Error("Could not load policies", { cause: error })

  return data.map((policy) => ({
    policyId: policy.id,
    name: policy.name,
    version: policy.version,
    effectiveFrom: policy.effective_from,
    effectiveUntil: policy.effective_until,
    returnWindowDays: policy.return_window_days,
    manualReviewAboveMinor: policy.manual_review_above_minor,
    clauses: [...policy.clauses]
      .sort(
        (a, b) =>
          a.position - b.position || a.clause_key.localeCompare(b.clause_key),
      )
      .map((clause) => ({
        clauseId: clause.id,
        clauseKey: clause.clause_key,
        title: clause.title,
        clauseType: clause.clause_type,
        content: clause.content,
      })),
  }))
}
