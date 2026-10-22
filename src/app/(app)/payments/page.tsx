import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { FlaskConicalIcon, ReceiptIcon, ShoppingCartIcon } from "lucide-react"

import { Disclosure } from "@/components/cases/case-facts"
import { FactList } from "@/components/fact-list"
import { PageContainer, PageHeader } from "@/components/page-header"
import { CheckStatusButton } from "@/components/payments/check-status-button"
import { CreateCaseDialog } from "@/components/payments/create-case-dialog"
import { SandboxCheckout } from "@/components/payments/sandbox-checkout"
import { PaymentStateBadge } from "@/components/status-badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getLastPaymentEvent, listSandboxPayments } from "@/lib/data/payments"
import { formatDateTime } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"
import { sandboxCatalog } from "@/lib/payments/catalog"
import { checkPayPalConnection, paypalClientId } from "@/lib/paypal/client"
import { can, requireMember } from "@/lib/security/auth"

export const metadata: Metadata = {
  title: "Payments",
}

export default function PaymentsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Payments"
        description="Test payments made with PayPal Sandbox money. Turn a paid one into a refund request."
      />

      <Alert>
        <FlaskConicalIcon />
        <AlertTitle>Sandbox only</AlertTitle>
        <AlertDescription>
          Every checkout, capture, and refund in Settlix uses the PayPal
          Sandbox. No real money moves.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
          <IntegrationCard />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
          <CheckoutCard />
        </Suspense>
      </div>

      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <PaymentsCard />
      </Suspense>
    </PageContainer>
  )
}

async function IntegrationCard() {
  // Authenticate first so the PayPal check only runs for a signed-in member.
  await requireMember()
  const [connection, lastEvent] = await Promise.all([
    checkPayPalConnection(),
    getLastPaymentEvent(),
  ])

  const rows = [
    { label: "Mode", value: "Sandbox (test money only)" },
    {
      label: "Last activity",
      value: lastEvent
        ? `${lastEvent.event_summary} (${formatDateTime(lastEvent.created_at)})`
        : "Nothing yet",
    },
  ]
  const technical = [
    { label: "REST API host", value: "api-m.sandbox.paypal.com" },
    { label: "APIs", value: "Orders v2, Payments v2 (captures, refunds)" },
    ...(connection.ok && connection.appId
      ? [{ label: "REST app", value: connection.appId }]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>PayPal connection</CardTitle>
        <CardDescription>
          Checked just now. Keys never reach your browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.9375rem] font-semibold">Status</span>
          {connection.ok ? (
            <Badge variant="success">Connected</Badge>
          ) : (
            <Badge variant="warning">Not connected</Badge>
          )}
        </div>
        {connection.ok ? null : (
          <p className="text-sm text-muted-foreground">{connection.reason}</p>
        )}
        <Separator />
        <dl className="grid gap-3 text-[0.9375rem]">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"
            >
              <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
              <dd className="font-medium break-words sm:text-right">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <Disclosure label="Technical details">
          <FactList facts={technical} />
        </Disclosure>
      </CardContent>
    </Card>
  )
}

async function CheckoutCard() {
  const member = await requireMember()
  const clientId = paypalClientId()
  const allowed = can.runSandboxCheckout(member.role)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Make a test purchase</CardTitle>
        <CardDescription>
          Pay with a PayPal Sandbox buyer account. Then turn the payment into a
          refund request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clientId && allowed ? (
          <SandboxCheckout clientId={clientId} items={sandboxCatalog} />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingCartIcon />
              </EmptyMedia>
              <EmptyTitle>Test purchases aren&apos;t available</EmptyTitle>
              <EmptyDescription>
                {clientId
                  ? "Your role can't make test purchases. Ask a reviewer or admin."
                  : "PayPal Sandbox isn't set up on the server yet."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

async function PaymentsCard() {
  const member = await requireMember()
  const payments = await listSandboxPayments()
  const canCreate = can.createCases(member.role)
  const canCheck = can.runSandboxCheckout(member.role)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test payments</CardTitle>
        <CardDescription>
          Payments made through Settlix. Only a completed payment can be
          refunded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptIcon />
              </EmptyMedia>
              <EmptyTitle>No test payments yet</EmptyTitle>
              <EmptyDescription>
                Make a test purchase above to create one.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead className="hidden text-right @xl/main:table-cell">
                  Amount
                </TableHead>
                <TableHead className="hidden @xl/main:table-cell">
                  Status
                </TableHead>
                <TableHead className="hidden @4xl/main:table-cell">
                  PayPal references
                </TableHead>
                <TableHead className="hidden @5xl/main:table-cell">
                  Paid on
                </TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const linkedCase = payment.cases[0]
                const refundable =
                  Boolean(payment.paypal_capture_id) &&
                  (payment.payment_state === "CAPTURED" ||
                    payment.payment_state === "PARTIALLY_REFUNDED")
                const checkable =
                  payment.payment_state === "AWAITING_CAPTURE" ||
                  payment.payment_state === "CAPTURE_PENDING"
                const amountLabel = formatMoney(
                  payment.original_amount_minor,
                  payment.currency_code,
                )

                return (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {payment.external_order_reference}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {payment.description}
                        </span>
                        {/* Narrow screens fold amount and state into this cell. */}
                        <div className="mt-1 flex flex-wrap items-center gap-2 @xl/main:hidden">
                          <span className="text-sm tabular-nums">
                            {amountLabel}
                          </span>
                          <PaymentStateBadge state={payment.payment_state} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums @xl/main:table-cell">
                      {amountLabel}
                    </TableCell>
                    <TableCell className="hidden @xl/main:table-cell">
                      <PaymentStateBadge state={payment.payment_state} />
                    </TableCell>
                    <TableCell className="hidden @4xl/main:table-cell">
                      <dl className="grid gap-0.5 text-sm">
                        <div className="flex gap-1.5">
                          <dt className="text-muted-foreground">Order</dt>
                          <dd className="font-mono">
                            {payment.paypal_order_id ?? "—"}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-muted-foreground">Payment</dt>
                          <dd className="font-mono">
                            {payment.paypal_capture_id ?? "—"}
                          </dd>
                        </div>
                      </dl>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground @5xl/main:table-cell">
                      {payment.captured_at
                        ? formatDateTime(payment.captured_at)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        {linkedCase ? (
                          <Link
                            href={`/cases/${linkedCase.id}`}
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                          >
                            Open {linkedCase.case_number}
                          </Link>
                        ) : refundable && canCreate ? (
                          <CreateCaseDialog
                            orderId={payment.id}
                            orderReference={payment.external_order_reference}
                            amountLabel={amountLabel}
                          />
                        ) : checkable && canCheck ? (
                          <CheckStatusButton orderId={payment.id} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
