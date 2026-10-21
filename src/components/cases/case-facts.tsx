import { DatabaseIcon, LinkIcon, MessageSquareQuoteIcon } from "lucide-react"

import { FactList } from "@/components/fact-list"
import { ReconcileRefundButton } from "@/components/refunds/reconcile-refund-button"
import { OriginBadge, RefundStatusBadge } from "@/components/status-badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { CaseDetail } from "@/lib/data/cases"
import {
  paymentStateLabels,
  requestCategoryLabels,
  type RefundAttemptStatus,
} from "@/lib/domain/labels"
import { formatDate, formatDateTime } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>
}

export function RequestFactsCard({ detail }: { detail: CaseDetail }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Customer request</CardTitle>
        <CardDescription>
          What the customer is asking for, as recorded on the case.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FactList
          facts={[
            { label: "Customer", value: detail.customer_display_name },
            ...(detail.customer_email
              ? [{ label: "Email", value: detail.customer_email }]
              : []),
            {
              label: "Category",
              value: requestCategoryLabels[detail.request_category],
            },
            { label: "Claimed issue", value: detail.claimed_issue },
            {
              label: "Requested amount",
              value:
                detail.requested_amount_minor === null
                  ? "Not stated"
                  : formatMoney(
                      detail.requested_amount_minor,
                      detail.currency_code,
                    ),
            },
            { label: "Opened", value: formatDateTime(detail.created_at) },
          ]}
        />
        <Separator />
        <figure className="flex flex-col gap-2">
          <figcaption className="flex items-center gap-1.5 text-sm font-medium">
            <MessageSquareQuoteIcon className="size-4 text-muted-foreground" />
            Customer message
            <Badge variant="outline">Untrusted input</Badge>
          </figcaption>
          <blockquote className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">
            {detail.customer_message}
          </blockquote>
        </figure>
        {detail.supporting_details ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Merchant notes</span>
            <p className="text-sm text-muted-foreground">
              {detail.supporting_details}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function PaymentFactsCard({ detail }: { detail: CaseDetail }) {
  const order = detail.order
  const linked = Boolean(order.paypal_capture_id)

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Order &amp; payment</CardTitle>
        <CardDescription>
          The mapped order and its PayPal capture, from stored records.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {order.origin === "seed" ? (
          <Alert>
            <DatabaseIcon />
            <AlertTitle>Demo order metadata</AlertTitle>
            <AlertDescription>
              Seeded for the demo. It is not linked to a PayPal Sandbox capture,
              so it can be investigated but not refunded.
            </AlertDescription>
          </Alert>
        ) : null}
        <FactList
          facts={[
            { label: "Order", value: order.external_order_reference },
            { label: "Item", value: order.description },
            {
              label: "Captured amount",
              value: formatMoney(
                order.original_amount_minor,
                order.currency_code,
              ),
            },
            { label: "Currency", value: order.currency_code },
            {
              label: "Payment state",
              value: paymentStateLabels[order.payment_state],
            },
            {
              label: "Captured",
              value: order.captured_at
                ? formatDate(order.captured_at)
                : "Not captured",
            },
            {
              label: "PayPal order ID",
              value: order.paypal_order_id ? (
                <Mono>{order.paypal_order_id}</Mono>
              ) : (
                <span className="text-muted-foreground">None</span>
              ),
            },
            {
              label: "PayPal capture ID",
              value: linked ? (
                <span className="inline-flex items-center gap-1">
                  <LinkIcon className="size-3.5 text-muted-foreground" />
                  <Mono>{order.paypal_capture_id}</Mono>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Not linked to a capture
                </span>
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  )
}

const attemptNotes: Partial<Record<RefundAttemptStatus, string>> = {
  REQUESTED: "Approved and sent to PayPal. Waiting for PayPal's answer.",
  PENDING:
    "PayPal accepted it but hasn't completed it. No money is confirmed yet.",
  RECOVERY_REQUIRED:
    "PayPal's answer couldn't be confirmed. Reconcile before any new refund.",
  COMPLETED: "PayPal confirmed the refund.",
  FAILED: "No money was returned.",
}

const UNRESOLVED = new Set<RefundAttemptStatus>([
  "REQUESTED",
  "PENDING",
  "RECOVERY_REQUIRED",
])

export function RefundHistoryCard({
  detail,
  canReconcile,
}: {
  detail: CaseDetail
  canReconcile: boolean
}) {
  const attempts = detail.refund_attempts

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Refund history</CardTitle>
        <CardDescription>
          Every attempt is recorded, including failed and demo attempts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No refund attempts for this case.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {formatMoney(
                      attempt.approved_amount_minor,
                      attempt.currency_code,
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <RefundStatusBadge status={attempt.status} />
                    <OriginBadge origin={attempt.origin} />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  Approved {formatDateTime(attempt.approved_at)}
                </span>
                {attempt.paypal_refund_id ? (
                  <span className="text-xs">
                    PayPal refund <Mono>{attempt.paypal_refund_id}</Mono>
                  </span>
                ) : attempt.origin === "seed" ? (
                  <span className="text-xs text-muted-foreground">
                    Demo record. No PayPal refund was executed.
                  </span>
                ) : null}
                {attempt.error_code ? (
                  <span className="text-xs text-destructive">
                    Error: <Mono>{attempt.error_code}</Mono>
                  </span>
                ) : null}
                {attempt.origin === "app" && attemptNotes[attempt.status] ? (
                  <span className="text-xs text-muted-foreground">
                    {attemptNotes[attempt.status]}
                  </span>
                ) : null}
                {attempt.origin === "app" &&
                UNRESOLVED.has(attempt.status) &&
                canReconcile ? (
                  <ReconcileRefundButton caseId={detail.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
