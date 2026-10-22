import "server-only"

import type { CaseStatus } from "@/lib/domain/labels"
import {
  customerStatus,
  type CustomerStatus,
} from "@/lib/intake/customer-status"
import { addCustomerMessage } from "@/lib/intake/service"
import { isStatusToken } from "@/lib/intake/tokens"
import { formatMoney } from "@/lib/money/amounts"
import { consumeVisitorLimit } from "@/lib/security/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Enums } from "@/types/database"

export type StatusPageMessage = {
  id: string
  fromStore: boolean
  body: string
  emailed: boolean
  createdAt: string
}

export type StatusPageView = {
  storeName: string
  storeSlug: string
  caseNumber: string
  customerName: string
  orderReference: string
  item: string
  submittedAt: string
  status: CaseStatus
  view: CustomerStatus
  messages: StatusPageMessage[]
  isDemo: boolean
}

async function loadCase(token: string) {
  if (!isStatusToken(token)) return null
  const { data, error } = await createAdminClient()
    .from("cases")
    .select(
      `id, merchant_id, case_number, status, customer_display_name, customer_message, created_at,
       merchant:merchants!inner(name, slug, is_demo, auto_check_requests),
       order:orders!cases_merchant_id_order_id_fkey(external_order_reference, description),
       refund_attempts:refund_attempts!refund_attempts_merchant_id_case_id_fkey(status, origin, approved_amount_minor, currency_code),
       messages:case_messages!case_messages_merchant_id_case_id_fkey(id, sender, channel, body, created_at)`,
    )
    .eq("status_token", token)
    .order("created_at", { referencedTable: "case_messages", ascending: true })
    .maybeSingle()
  if (error) throw new Error("Could not load the request", { cause: error })
  return data
}

/**
 * Everything the customer's status page shows, found by the token in their
 * link. Only customer-facing facts: no AI suggestion, checks, notes or IDs.
 */
export async function getStatusPage(
  token: string,
): Promise<StatusPageView | null> {
  const row = await loadCase(token)
  if (!row) return null

  // Only refunds PayPal confirmed count, and never demo records.
  const completed = row.refund_attempts.filter(
    (attempt) => attempt.status === "COMPLETED" && attempt.origin === "app",
  )
  const refundedMinor = completed.reduce(
    (sum, attempt) => sum + attempt.approved_amount_minor,
    0,
  )
  const refunded =
    completed.length > 0
      ? { amount: formatMoney(refundedMinor, completed[0].currency_code) }
      : null

  return {
    storeName: row.merchant.name,
    storeSlug: row.merchant.slug,
    caseNumber: row.case_number,
    customerName: row.customer_display_name,
    orderReference: row.order.external_order_reference,
    item: row.order.description,
    submittedAt: row.created_at,
    status: row.status,
    view: customerStatus(
      row.status,
      refunded,
      // A person at the store wrote last (not Settlix's acknowledgement).
      row.messages.at(-1)?.sender === "merchant",
    ),
    messages: row.messages.map((message) => ({
      id: message.id,
      fromStore: message.sender !== "customer",
      body: message.body,
      emailed: message.channel === ("gmail" satisfies Enums<"message_channel">),
      createdAt: message.created_at,
    })),
    isDemo: row.merchant.is_demo,
  }
}

export type StatusReplyResult =
  | { status: "sent" }
  | { status: "closed" }
  | { status: "rate_limited" }
  | { status: "not_found" }

/**
 * A reply from the customer on their status page. It joins the request's
 * conversation and the text Claude reads; when the store was waiting for this
 * information, the caller has Settlix check the request again.
 */
export async function replyOnStatusPage(
  token: string,
  text: string,
  visitor: string,
): Promise<
  StatusReplyResult & { merchantId?: string; caseId?: string; check?: boolean }
> {
  const row = await loadCase(token)
  if (!row) return { status: "not_found" }
  if (!customerStatus(row.status, null).canAddInfo) return { status: "closed" }

  const admin = createAdminClient()
  if (!(await consumeVisitorLimit(admin, "status.reply", visitor))) {
    return { status: "rate_limited" }
  }
  await addCustomerMessage(admin, row.merchant_id, row, {
    body: text,
    channel: "status_page",
    source: "the status page",
  })
  return {
    status: "sent",
    merchantId: row.merchant_id,
    caseId: row.id,
    // Settlix checks again only when the store asked for this information.
    check: row.merchant.auto_check_requests && row.status === "NEEDS_EVIDENCE",
  }
}
