import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { InvestigationContext } from "@/lib/investigations/context"
import { getApplicablePolicies } from "@/lib/policy/retrieval"
import type { Database, Tables } from "@/types/database"

export const CASE_CONTEXT_COLUMNS =
  "id, case_number, origin, customer_display_name, customer_message, claimed_issue, request_category, requested_amount_minor, currency_code, supporting_details, created_at, status, order_id, updated_at" as const

export type CaseContextRow = Pick<
  Tables<"cases">,
  | "id"
  | "case_number"
  | "origin"
  | "customer_display_name"
  | "customer_message"
  | "claimed_issue"
  | "request_category"
  | "requested_amount_minor"
  | "currency_code"
  | "supporting_details"
  | "created_at"
  | "status"
  | "order_id"
  | "updated_at"
>

/**
 * Builds the evidence an investigation may see, scoped to one merchant. Works
 * with the admin client (investigations, approvals) and with the signed-in
 * member's RLS client (pages checking whether a recommendation is current).
 */
export async function loadInvestigationContext(
  db: SupabaseClient<Database>,
  merchantId: string,
  row: CaseContextRow,
): Promise<InvestigationContext> {
  const [orderResult, attemptsResult, policies] = await Promise.all([
    db
      .from("orders")
      .select(
        "id, external_order_reference, description, original_amount_minor, currency_code, payment_state, captured_at, paypal_order_id, paypal_capture_id, origin",
      )
      .eq("merchant_id", merchantId)
      .eq("id", row.order_id)
      .single(),
    db
      .from("refund_attempts")
      .select(
        "id, case_id, status, approved_amount_minor, currency_code, origin, paypal_refund_id, created_at",
      )
      .eq("merchant_id", merchantId)
      .eq("order_id", row.order_id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    getApplicablePolicies(db, merchantId),
  ])

  if (orderResult.error) {
    throw new Error("Could not load the order", { cause: orderResult.error })
  }
  if (attemptsResult.error) {
    throw new Error("Could not load refund attempts", {
      cause: attemptsResult.error,
    })
  }
  const order = orderResult.data

  return {
    case: {
      caseId: row.id,
      caseNumber: row.case_number,
      origin: row.origin,
      customerDisplayName: row.customer_display_name,
      customerMessage: row.customer_message,
      claimedIssue: row.claimed_issue,
      requestCategory: row.request_category,
      requestedAmountMinor: row.requested_amount_minor,
      currencyCode: row.currency_code,
      merchantNotes: row.supporting_details,
      requestReceivedAt: new Date(row.created_at).toISOString(),
    },
    order: {
      orderId: order.id,
      externalReference: order.external_order_reference,
      description: order.description,
      originalAmountMinor: order.original_amount_minor,
      currencyCode: order.currency_code,
      paymentState: order.payment_state,
      capturedAt: order.captured_at
        ? new Date(order.captured_at).toISOString()
        : null,
      paypalOrderId: order.paypal_order_id,
      paypalCaptureId: order.paypal_capture_id,
      origin: order.origin,
    },
    refundHistory: attemptsResult.data.map((attempt) => ({
      attemptId: attempt.id,
      caseId: attempt.case_id,
      status: attempt.status,
      amountMinor: attempt.approved_amount_minor,
      currencyCode: attempt.currency_code,
      origin: attempt.origin,
      paypalRefundId: attempt.paypal_refund_id,
      createdAt: new Date(attempt.created_at).toISOString(),
    })),
    policies,
  }
}
