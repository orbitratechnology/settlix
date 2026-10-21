import "server-only"

import { z } from "zod"

import { getCaseDetail } from "@/lib/data/cases"
import {
  parseInvestigation,
  type InvestigationRecord,
} from "@/lib/investigations/records"
import { eligibilityOutcomes } from "@/lib/policy/eligibility"
import type { Receipt, ReceiptAttempt } from "@/lib/receipts/receipt"
import { requireMember } from "@/lib/security/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const responseSummarySchema = z
  .object({
    status: z.string().nullable().optional(),
    amount: z
      .object({ value: z.string(), currency_code: z.string() })
      .nullable()
      .optional(),
  })
  .nullable()

const approvalSnapshotSchema = z
  .object({ outcome: z.enum(eligibilityOutcomes) })
  .nullable()

/**
 * The Resolution Receipt for a case (receipt ID = case ID), built only from
 * merchant-scoped stored records. Nothing from the request is taken as proof.
 */
export async function getReceipt(receiptId: string) {
  const detail = await getCaseDetail(receiptId)
  if (!detail) return null
  const member = await requireMember()

  const latestAttempt = detail.refund_attempts[0] ?? null
  let attempt: ReceiptAttempt | null = null
  let investigation: InvestigationRecord | null = null

  if (latestAttempt) {
    const supabase = await createClient()
    const { data: full, error } = await supabase
      .from("refund_attempts")
      .select(
        "id, origin, status, approved_amount_minor, currency_code, approved_at, approved_by, paypal_refund_id, response_code, response_summary, error_code, paypal_debug_id, approval_snapshot, investigation_id",
      )
      .eq("merchant_id", member.workspace.id)
      .eq("id", latestAttempt.id)
      .single()
    if (error) throw new Error("Could not load the refund", { cause: error })

    // Approver email: auth users aren't readable through RLS. Server-only lookup.
    let approvedBy: string | null = null
    if (full.approved_by) {
      const { data } = await createAdminClient().auth.admin.getUserById(
        full.approved_by,
      )
      approvedBy = data.user?.email ?? null
    }

    const summary = responseSummarySchema.safeParse(full.response_summary)
    const snapshot = approvalSnapshotSchema.safeParse(full.approval_snapshot)
    attempt = {
      id: full.id,
      origin: full.origin,
      status: full.status,
      approvedMinor: full.approved_amount_minor,
      currency: full.currency_code,
      approvedAt: full.approved_at,
      approvedBy,
      paypalRefundId: full.paypal_refund_id,
      paypalStatus: summary.success ? (summary.data?.status ?? null) : null,
      paypalAmount: summary.success ? (summary.data?.amount ?? null) : null,
      responseCode: full.response_code,
      errorCode: full.error_code,
      debugId: full.paypal_debug_id,
      approvalOutcome: snapshot.success
        ? (snapshot.data?.outcome ?? null)
        : null,
    }

    if (full.investigation_id) {
      const { data: row, error: invError } = await supabase
        .from("investigations")
        .select(
          "id, model_provider, model_id, prompt_version, input_context_hash, recommendation_json, eligibility_result, policy_version_snapshot, created_at",
        )
        .eq("merchant_id", member.workspace.id)
        .eq("id", full.investigation_id)
        .maybeSingle()
      if (invError) {
        throw new Error("Could not load the investigation", { cause: invError })
      }
      investigation = row ? parseInvestigation(row) : null
    }
  }

  investigation ??=
    detail.investigations
      .map(parseInvestigation)
      .find((record) => record !== null) ?? null

  const receipt: Receipt = {
    caseId: detail.id,
    caseNumber: detail.case_number,
    caseStatus: detail.status,
    origin: detail.origin,
    merchantName: member.workspace.name,
    customerName: detail.customer_display_name,
    customerMessage: detail.customer_message,
    claimedIssue: detail.claimed_issue,
    category: detail.request_category,
    requestedMinor: detail.requested_amount_minor,
    currency: detail.currency_code,
    openedAt: detail.created_at,
    order: {
      reference: detail.order.external_order_reference,
      description: detail.order.description,
      capturedMinor: detail.order.original_amount_minor,
      currency: detail.order.currency_code,
      paymentState: detail.order.payment_state,
      paypalOrderId: detail.order.paypal_order_id,
      paypalCaptureId: detail.order.paypal_capture_id,
      origin: detail.order.origin,
    },
    investigation,
    attempt,
  }
  return { receipt, events: detail.audit_events }
}
