import "server-only"

import { z } from "zod"

import { proposedActions } from "@/lib/ai/schemas"
import type { InboxRow } from "@/lib/cases/inbox"
import { eligibilityOutcomes } from "@/lib/policy/eligibility"
import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

const caseIdSchema = z.uuid()

/** Most recent investigations shown on a case. */
const INVESTIGATION_HISTORY = 6

/**
 * Inbox rows for the signed-in member's merchant. RLS already limits rows to the
 * member's merchants; the explicit merchant filter is a second, server-side check.
 */
export async function listCases(): Promise<InboxRow[]> {
  const member = await requireMember()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("cases")
    .select(
      `id, case_number, customer_display_name, claimed_issue, request_category,
       requested_amount_minor, currency_code, status, priority, origin, created_at,
       order:orders!cases_merchant_id_order_id_fkey(external_order_reference),
       investigations:investigations!investigations_merchant_id_case_id_fkey(
         action:recommendation_json->recommendation->>proposedAction,
         outcome:eligibility_result->>outcome
       )`,
    )
    .eq("merchant_id", member.workspace.id)
    .order("created_at", { ascending: false })
    .order("created_at", {
      referencedTable: "investigations",
      ascending: false,
    })
    .limit(1, { referencedTable: "investigations" })
    .limit(200)

  if (error) throw new Error("Could not load cases", { cause: error })

  return data.map((row) => {
    const latest = row.investigations[0]
    const action = proposedActions.find((value) => value === latest?.action)
    const outcome = eligibilityOutcomes.find(
      (value) => value === latest?.outcome,
    )
    return {
      id: row.id,
      caseNumber: row.case_number,
      customer: row.customer_display_name,
      claimedIssue: row.claimed_issue,
      category: row.request_category,
      requestedMinor: row.requested_amount_minor,
      currency: row.currency_code,
      status: row.status,
      priority: row.priority,
      origin: row.origin,
      createdAt: row.created_at,
      orderReference: row.order.external_order_reference,
      latestAction: action ?? null,
      latestOutcome: outcome ?? null,
    }
  })
}

/** Full case record with its order, refund attempts, and audit timeline. */
export async function getCaseDetail(caseId: string) {
  const parsed = caseIdSchema.safeParse(caseId)
  if (!parsed.success) return null

  const member = await requireMember()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("cases")
    .select(
      `*,
       order:orders!cases_merchant_id_order_id_fkey(*),
       refund_attempts:refund_attempts!refund_attempts_merchant_id_case_id_fkey(
         id, status, approved_amount_minor, currency_code, approved_at, paypal_refund_id,
         error_code, origin, created_at
       ),
       audit_events:audit_events!audit_events_merchant_id_case_id_fkey(
         id, actor_type, event_type, event_summary, origin, created_at
       ),
       investigations:investigations!investigations_merchant_id_case_id_fkey(
         id, model_provider, model_id, prompt_version, input_context_hash,
         recommendation_json, eligibility_result, policy_version_snapshot,
         created_at
       )`,
    )
    .eq("merchant_id", member.workspace.id)
    .eq("id", parsed.data)
    .order("created_at", {
      referencedTable: "refund_attempts",
      ascending: false,
    })
    .order("created_at", { referencedTable: "audit_events", ascending: true })
    .order("created_at", {
      referencedTable: "investigations",
      ascending: false,
    })
    .limit(INVESTIGATION_HISTORY, { referencedTable: "investigations" })
    .maybeSingle()

  if (error) throw new Error("Could not load case", { cause: error })
  return data
}

export type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>
