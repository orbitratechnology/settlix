import "server-only"

import { caseStatusMeta, type CaseStatus } from "@/lib/domain/labels"
import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

const attentionStatuses = (Object.keys(caseStatusMeta) as CaseStatus[]).filter(
  (status) => caseStatusMeta[status].needsAttention,
)

/** The last `count` calendar days (UTC) as YYYY-MM-DD, oldest first. */
function lastDays(count: number) {
  const today = new Date()
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today)
    day.setUTCDate(today.getUTCDate() - (count - 1 - index))
    return day.toISOString().slice(0, 10)
  })
}

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
        .select("approved_amount_minor, currency_code, origin, updated_at")
        .eq("merchant_id", merchantId)
        .eq("status", "COMPLETED"),
      supabase
        .from("cases")
        .select(
          "id, case_number, customer_display_name, claimed_issue, status, origin, updated_at, requested_amount_minor, currency_code",
        )
        .eq("merchant_id", merchantId)
        .in("status", attentionStatuses)
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("refund_attempts")
        .select(
          `id, status, approved_amount_minor, currency_code, paypal_refund_id,
         origin, created_at,
         case:cases!refund_attempts_merchant_id_case_id_fkey(id, case_number, customer_display_name)`,
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
  const refundsByDay = lastDays(14).map((day) => ({ day, minor: 0 }))
  let confirmedRefundedMinor = 0
  let demoCompletedCount = 0
  for (const refund of completedRefunds.data ?? []) {
    if (refund.origin === "seed") {
      demoCompletedCount += 1
    } else if (refund.currency_code === currency) {
      confirmedRefundedMinor += refund.approved_amount_minor
      const bucket = refundsByDay.find(
        (entry) => entry.day === refund.updated_at.slice(0, 10),
      )
      if (bucket) bucket.minor += refund.approved_amount_minor
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
    refundsByDay,
    demoCompletedCount,
    attention: attention.data ?? [],
    recentRefunds: recentRefunds.data ?? [],
  }
}

/** How many requests are waiting on someone, for the sidebar's count. */
export async function getAttentionCount() {
  const member = await requireMember()
  const supabase = await createClient()
  const { count, error } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", member.workspace.id)
    .in("status", attentionStatuses)
  if (error) throw new Error("Could not count cases", { cause: error })
  return count ?? 0
}
