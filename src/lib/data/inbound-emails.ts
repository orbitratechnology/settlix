import "server-only"

import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

/** Emails from Gmail that Settlix couldn't match to an order on its own. */
export async function listEmailsToSort() {
  const member = await requireMember()
  const supabase = await createClient()
  const [emails, orders] = await Promise.all([
    supabase
      .from("inbound_emails")
      .select(
        `id, from_email, from_name, subject, body_text, received_at, sender_authenticated,
         suggested_order_id`,
      )
      .eq("merchant_id", member.workspace.id)
      .eq("status", "to_sort")
      .order("received_at", { ascending: false })
      .limit(50),
    supabase
      .from("orders")
      .select(
        "id, external_order_reference, description, customer_email, original_amount_minor, currency_code",
      )
      .eq("merchant_id", member.workspace.id)
      .in("payment_state", ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"])
      .order("created_at", { ascending: false })
      .limit(100),
  ])
  if (emails.error) {
    throw new Error("Could not load emails", { cause: emails.error })
  }
  if (orders.error) {
    throw new Error("Could not load orders", { cause: orders.error })
  }
  return { member, emails: emails.data, orders: orders.data }
}

export type EmailToSort = Awaited<
  ReturnType<typeof listEmailsToSort>
>["emails"][number]
export type OrderOption = Awaited<
  ReturnType<typeof listEmailsToSort>
>["orders"][number]
