import {
  ChevronDownIcon,
  DatabaseIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { FactList } from "@/components/fact-list"
import { ReconcileRefundButton } from "@/components/refunds/reconcile-refund-button"
import {
  OriginBadge,
  PaymentStateBadge,
  RefundStatusBadge,
} from "@/components/status-badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { CaseDetail } from "@/lib/data/cases"
import {
  requestCategoryLabels,
  type RefundAttemptStatus,
} from "@/lib/domain/labels"
import { formatDate, formatDateTime } from "@/lib/format"
import { channelLabel } from "@/lib/intake/sources"
import { formatMoney } from "@/lib/money/amounts"

function Reference({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-sm break-all">{children}</span>
}

/** A "Show …" disclosure for details most people never need. */
export function Disclosure({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="group -ml-3 w-fit text-muted-foreground"
          />
        }
      >
        {label}
        <ChevronDownIcon
          data-icon="inline-end"
          className="transition-transform group-data-[panel-open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function RequestFactsCard({ detail }: { detail: CaseDetail }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>What the customer asked</CardTitle>
        <CardDescription>
          {detail.customer_display_name}
          {detail.customer_email ? `, ${detail.customer_email}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <figure className="flex flex-col gap-2">
          <blockquote className="rounded-xl bg-muted px-4 py-3 text-base leading-relaxed whitespace-pre-line">
            {detail.customer_message}
          </blockquote>
          <figcaption className="text-sm text-muted-foreground">
            In the customer&apos;s own words. Claude reads it as information,
            never as instructions.
          </figcaption>
        </figure>
        <FactList
          facts={[
            {
              label: "Reason",
              value: requestCategoryLabels[detail.request_category],
            },
            { label: "Problem", value: detail.claimed_issue },
            {
              label: "Asks for",
              value:
                detail.requested_amount_minor === null
                  ? "No amount given"
                  : formatMoney(
                      detail.requested_amount_minor,
                      detail.currency_code,
                    ),
            },
            { label: "Received", value: formatDate(detail.created_at) },
            {
              label: "Came in",
              value: channelLabel(detail.channel, detail.channel_source),
            },
          ]}
        />
        {detail.channel !== "dashboard" ? (
          detail.customer_verified ? (
            <p className="flex items-start gap-2 text-[0.9375rem]">
              <ShieldCheckIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-success"
              />
              The order number and the customer&apos;s email match this order.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-[0.9375rem]">
              <ShieldAlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
              />
              The sender isn&apos;t confirmed as this order&apos;s buyer. Check
              before refunding.
            </p>
          )
        ) : null}
        {detail.supporting_details ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.9375rem] font-semibold">Your notes</span>
            <p className="text-[0.9375rem] text-muted-foreground">
              {detail.supporting_details}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Paid, refunded, and left, as one bar with the figures under it. */
function MoneyBar({
  paidMinor,
  refundedMinor,
  currency,
}: {
  paidMinor: number
  refundedMinor: number
  currency: string
}) {
  const leftMinor = Math.max(0, paidMinor - refundedMinor)
  const share = paidMinor > 0 ? Math.min(1, refundedMinor / paidMinor) : 0
  const money = (minor: number) => formatMoney(minor, currency)
  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={`${money(refundedMinor)} refunded of ${money(paidMinor)} paid`}
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <span className="bg-primary" style={{ width: `${share * 100}%` }} />
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: "Paid", value: money(paidMinor) },
          { label: "Refunded", value: money(refundedMinor) },
          { label: "Left", value: money(leftMinor) },
        ].map((item) => (
          <div key={item.label} className="flex flex-col">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-base font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function PaymentFactsCard({ detail }: { detail: CaseDetail }) {
  const order = detail.order
  const refundedMinor = detail.refund_attempts
    .filter(
      (attempt) =>
        attempt.status === "COMPLETED" &&
        attempt.origin === "app" &&
        attempt.currency_code === order.currency_code,
    )
    .reduce((sum, attempt) => sum + attempt.approved_amount_minor, 0)

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Order and payment</CardTitle>
        <CardDescription>{order.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {order.origin === "seed" ? (
          <Alert>
            <DatabaseIcon />
            <AlertTitle>Demo order</AlertTitle>
            <AlertDescription>
              It isn&apos;t linked to a real PayPal Sandbox payment, so it can
              be checked but not refunded.
            </AlertDescription>
          </Alert>
        ) : null}
        <MoneyBar
          paidMinor={order.original_amount_minor}
          refundedMinor={refundedMinor}
          currency={order.currency_code}
        />
        <FactList
          facts={[
            { label: "Order", value: order.external_order_reference },
            {
              label: "Payment",
              value: <PaymentStateBadge state={order.payment_state} />,
            },
            {
              label: "Paid on",
              value: order.captured_at
                ? formatDate(order.captured_at)
                : "Not paid yet",
            },
          ]}
        />
        <Disclosure label="PayPal references">
          <FactList
            facts={[
              {
                label: "PayPal order",
                value: order.paypal_order_id ? (
                  <Reference>{order.paypal_order_id}</Reference>
                ) : (
                  <span className="text-muted-foreground">None</span>
                ),
              },
              {
                label: "PayPal payment",
                value: order.paypal_capture_id ? (
                  <Reference>{order.paypal_capture_id}</Reference>
                ) : (
                  <span className="text-muted-foreground">
                    Not linked to a payment
                  </span>
                ),
              },
              { label: "Currency", value: order.currency_code },
            ]}
          />
        </Disclosure>
      </CardContent>
    </Card>
  )
}

const attemptNotes: Partial<Record<RefundAttemptStatus, string>> = {
  REQUESTED: "Approved and sent to PayPal. Waiting for PayPal's answer.",
  PENDING:
    "PayPal accepted it but hasn't finished it. No money is confirmed yet.",
  RECOVERY_REQUIRED:
    "PayPal's answer got lost. Check with PayPal before doing anything else.",
  COMPLETED: "PayPal confirmed the money went back to the customer.",
  FAILED: "PayPal turned it down. No money was returned.",
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
  if (attempts.length === 0) return null

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Refunds</CardTitle>
        <CardDescription>
          Every refund you approved for this request, including failed ones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {attempts.map((attempt) => (
            <li
              key={attempt.id}
              className="flex flex-col gap-2 rounded-xl bg-muted/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-semibold">
                  {formatMoney(
                    attempt.approved_amount_minor,
                    attempt.currency_code,
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <RefundStatusBadge status={attempt.status} />
                  <OriginBadge origin={attempt.origin} />
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                Approved {formatDateTime(attempt.approved_at)}
              </span>
              {attempt.origin === "seed" ? (
                <span className="text-sm text-muted-foreground">
                  Demo record. No PayPal refund was made.
                </span>
              ) : attemptNotes[attempt.status] ? (
                <span className="text-[0.9375rem]">
                  {attemptNotes[attempt.status]}
                </span>
              ) : null}
              {attempt.paypal_refund_id || attempt.error_code ? (
                <span className="text-sm text-muted-foreground">
                  {attempt.paypal_refund_id ? (
                    <>
                      PayPal reference{" "}
                      <Reference>{attempt.paypal_refund_id}</Reference>
                    </>
                  ) : null}
                  {attempt.error_code ? (
                    <>
                      PayPal&apos;s reason code{" "}
                      <Reference>{attempt.error_code}</Reference>
                    </>
                  ) : null}
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
      </CardContent>
    </Card>
  )
}
