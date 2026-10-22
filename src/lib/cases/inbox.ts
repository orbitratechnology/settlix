import type { ProposedAction } from "@/lib/ai/schemas"
import {
  caseStatusMeta,
  type CaseStatus,
  type RequestCategory,
} from "@/lib/domain/labels"
import type { EligibilityOutcome } from "@/lib/policy/eligibility"
import type { Enums } from "@/types/database"

/** One Resolution Inbox row (FR-03), serializable for the client table. */
export type InboxRow = {
  id: string
  caseNumber: string
  customer: string
  claimedIssue: string
  category: RequestCategory
  requestedMinor: number | null
  currency: string
  status: CaseStatus
  priority: Enums<"case_priority">
  origin: Enums<"data_origin">
  /** How the request arrived: added in the dashboard, the form, or Gmail. */
  channel: Enums<"case_channel">
  createdAt: string
  orderReference: string
  latestAction: ProposedAction | null
  latestOutcome: EligibilityOutcome | null
}

export type InboxView = "all" | "attention" | "open" | CaseStatus
export type InboxSort = "newest" | "oldest" | "amount_desc" | "amount_asc"

export type InboxFilters = {
  query: string
  view: InboxView
  category: RequestCategory | "all"
  sort: InboxSort
}

export const defaultInboxFilters: InboxFilters = {
  query: "",
  view: "all",
  category: "all",
  sort: "newest",
}

export function needsAttention(row: InboxRow) {
  return (
    caseStatusMeta[row.status].needsAttention ||
    row.priority === "high" ||
    row.priority === "urgent"
  )
}

function matchesView(row: InboxRow, view: InboxView) {
  if (view === "all") return true
  if (view === "attention") return needsAttention(row)
  if (view === "open") return caseStatusMeta[row.status].open
  return row.status === view
}

/** Search, filter, and sort stored rows. Amounts compare in minor units. */
export function filterInbox(rows: InboxRow[], filters: InboxFilters) {
  const query = filters.query.trim().toLowerCase()
  const filtered = rows.filter(
    (row) =>
      matchesView(row, filters.view) &&
      (filters.category === "all" || row.category === filters.category) &&
      (!query ||
        [row.caseNumber, row.customer, row.orderReference, row.claimedIssue]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  )
  const byDate = (a: InboxRow, b: InboxRow) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt)
  const byAmount = (a: InboxRow, b: InboxRow, direction: 1 | -1) => {
    // Cases without a requested amount always sort last.
    if (a.requestedMinor === null) return b.requestedMinor === null ? 0 : 1
    if (b.requestedMinor === null) return -1
    return (a.requestedMinor - b.requestedMinor) * direction
  }
  switch (filters.sort) {
    case "newest":
      return filtered.sort((a, b) => byDate(b, a))
    case "oldest":
      return filtered.sort(byDate)
    case "amount_desc":
      return filtered.sort((a, b) => byAmount(a, b, -1) || byDate(b, a))
    case "amount_asc":
      return filtered.sort((a, b) => byAmount(a, b, 1) || byDate(b, a))
  }
}

export function inboxCounts(rows: InboxRow[]) {
  const byStatus = {} as Record<CaseStatus, number>
  for (const status of Object.keys(caseStatusMeta) as CaseStatus[]) {
    byStatus[status] = 0
  }
  for (const row of rows) byStatus[row.status] += 1
  return {
    all: rows.length,
    attention: rows.filter(needsAttention).length,
    open: rows.filter((row) => caseStatusMeta[row.status].open).length,
    byStatus,
  }
}

/** Reads a `?view=` value from the URL; anything unknown shows all requests. */
export function parseInboxView(
  value: string | string[] | undefined,
): InboxView {
  const view = Array.isArray(value) ? value[0] : value
  if (view === "attention" || view === "open") return view
  if (view && Object.hasOwn(caseStatusMeta, view)) return view as CaseStatus
  return "all"
}
