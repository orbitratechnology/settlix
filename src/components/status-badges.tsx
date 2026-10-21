import { DatabaseIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  caseStatusMeta,
  refundAttemptStatusMeta,
  type CaseStatus,
  type RefundAttemptStatus,
} from "@/lib/domain/labels"
import type { Enums } from "@/types/database"

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const meta = caseStatusMeta[status]
  return (
    <Badge variant={meta.tone} title={meta.description}>
      {meta.label}
    </Badge>
  )
}

export function RefundStatusBadge({ status }: { status: RefundAttemptStatus }) {
  const meta = refundAttemptStatusMeta[status]
  return <Badge variant={meta.tone}>{meta.label}</Badge>
}

/** Marks seeded demo records so they are never mistaken for live PayPal data. */
export function OriginBadge({ origin }: { origin: Enums<"data_origin"> }) {
  if (origin !== "seed") return null
  return (
    <Badge variant="outline" title="Seeded demo record, not live PayPal data">
      <DatabaseIcon data-icon="inline-start" />
      Demo data
    </Badge>
  )
}
