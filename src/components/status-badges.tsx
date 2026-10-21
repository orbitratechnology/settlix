import { DatabaseIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  caseStatusMeta,
  paymentStateLabels,
  paymentStateTones,
  refundAttemptStatusMeta,
  type CaseStatus,
  type PaymentState,
  type RefundAttemptStatus,
} from "@/lib/domain/labels"
import type { Enums } from "@/types/database"

export function PaymentStateBadge({ state }: { state: PaymentState }) {
  return (
    <Badge variant={paymentStateTones[state]}>
      {paymentStateLabels[state]}
    </Badge>
  )
}

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

/** Draft versions are editable; published ones are immutable and may be active. */
export function PolicyStatusBadge({
  isActive,
  publishedAt,
}: {
  isActive: boolean
  publishedAt: string | null
}) {
  if (isActive) return <Badge variant="success">Active</Badge>
  if (!publishedAt) return <Badge variant="warning">Draft</Badge>
  return <Badge variant="secondary">Inactive</Badge>
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
