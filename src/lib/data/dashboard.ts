import "server-only"

import { caseStatusMeta, type CaseStatus } from "@/lib/domain/labels"
import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

const attentionStatuses = (Object.keys(caseStatusMeta) as CaseStatus[]).filter(
  (status) => caseStatusMeta[status].needsAttention,
)

/** Operational metrics computed from persisted records only (FR-17). */
export async function getDashboardData() {
  const member = await requireMember()
  const merchantId = member.workspace.id
  const supabase = await createClient()

  const [statusRows, completedRefunds, attention, recentRefunds] =
    await Promise.all([
      supabase.from("cases").select("status").eq("merchant_id", merchantId),
      supabase
        .from("refund_attempts")
        .select("approved_amount_minor, currency_code, origin")
        .eq("merchant_id", merchantId)
        .eq("status", "COMPLETED"),
      supabase
        .from("cases")
        .select(
          "id, case_number, customer_display_name, claimed_issue, status, origin, updated_at",
        )
        .eq("merchant_id", merchantId)
        .in("status", attentionStatuses)
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("refund_attempts")
        .select(
          `id, status, approved_amount_minor, currency_code, paypal_refund_id,
         origin, created_at,
         case:cases!refund_attempts_merchant_id_case_id_fkey(id, case_number)`,
        )
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(5),
    ])

  for (const result of [
    statusRows,
    completedRefunds,
    attention,
    recentRefunds,
  ]) {
    if (result.error) {
      throw new Error("Could not load dashboard", { cause: result.error })
    }
  }

  const counts = Object.fromEntries(
    (Object.keys(caseStatusMeta) as CaseStatus[]).map((status) => [status, 0]),
  ) as Record<CaseStatus, number>
  for (const row of statusRows.data ?? []) counts[row.status] += 1

  // Only refunds executed through PayPal count as confirmed money returned.
  const currency = member.workspace.defaultCurrency
  let confirmedRefundedMinor = 0
  let demoCompletedCount = 0
  for (const refund of completedRefunds.data ?? []) {
    if (refund.origin === "seed") {
      demoCompletedCount += 1
    } else if (refund.currency_code === currency) {
      confirmedRefundedMinor += refund.approved_amount_minor
    }
  }

  const openCount = (Object.keys(counts) as CaseStatus[])
    .filter((status) => caseStatusMeta[status].open)
    .reduce((sum, status) => sum + counts[status], 0)

  return {
    currency,
    counts,
    openCount,
    totalCases: statusRows.data?.length ?? 0,
    confirmedRefundedMinor,
    demoCompletedCount,
    attention: attention.data ?? [],
    recentRefunds: recentRefunds.data ?? [],
  }
}
