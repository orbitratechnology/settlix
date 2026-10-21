import "server-only"

import type { CaseDetail } from "@/lib/data/cases"
import { contextHash } from "@/lib/investigations/context"
import { loadInvestigationContext } from "@/lib/investigations/load"
import {
  parseInvestigation,
  type InvestigationRecord,
} from "@/lib/investigations/records"
import {
  evaluateEligibility,
  type EligibilityResult,
} from "@/lib/policy/eligibility"
import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

export type InvestigationView = {
  latest: InvestigationRecord | null
  earlier: InvestigationRecord[]
  /** Rows that didn't match the stored format and are not shown. */
  unreadable: number
  /**
   * The latest recommendation re-checked against the current records, so a
   * refund, policy change, or edit since the investigation is reflected.
   */
  current: EligibilityResult | null
  stale: boolean
}

export async function getInvestigationView(
  detail: CaseDetail,
): Promise<InvestigationView> {
  const records = detail.investigations.map(parseInvestigation)
  const readable = records.filter(
    (record): record is InvestigationRecord => record !== null,
  )
  const [latest = null, ...earlier] = readable
  const unreadable = records.length - readable.length
  if (!latest) {
    return { latest, earlier, unreadable, current: null, stale: false }
  }

  const member = await requireMember()
  const supabase = await createClient()
  const context = await loadInvestigationContext(
    supabase,
    member.workspace.id,
    detail,
  )
  const currentHash = contextHash(context)
  const current = evaluateEligibility({
    context,
    caseStatus: detail.status,
    recommendation: latest.stored.recommendation,
    citations: latest.stored.citations,
    freshness: {
      recommendationHash: latest.contextHash,
      currentHash,
    },
  })

  return {
    latest,
    earlier,
    unreadable,
    current,
    stale: currentHash !== latest.contextHash,
  }
}
