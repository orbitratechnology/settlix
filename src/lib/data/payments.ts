import "server-only"

import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

/** Sandbox payments created through Settlix (origin = app), newest first, with linked cases. */
export async function listSandboxPayments() {
  const member = await requireMember()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, external_order_reference, description, original_amount_minor, currency_code,
       paypal_order_id, paypal_capture_id, payment_state, captured_at, created_at,
       cases:cases!cases_merchant_id_order_id_fkey(id, case_number, status)`,
    )
    .eq("merchant_id", member.workspace.id)
    .eq("origin", "app")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw new Error("Could not load payments", { cause: error })
  return data
}

export type SandboxPayment = Awaited<
  ReturnType<typeof listSandboxPayments>
>[number]

/** The most recent payment-related audit event, for the integration panel. */
export async function getLastPaymentEvent() {
  const member = await requireMember()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("audit_events")
    .select("event_type, event_summary, created_at")
    .eq("merchant_id", member.workspace.id)
    .eq("origin", "app")
    .like("event_type", "payment.%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error)
    throw new Error("Could not load payment activity", { cause: error })
  return data
}
