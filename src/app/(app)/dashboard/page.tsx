import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { CircleAlertIcon, InboxIcon, ReceiptTextIcon } from "lucide-react"

import { RefundLine } from "@/components/dashboard/refund-line"
import { RefundsChart } from "@/components/dashboard/refunds-chart"
import { PageContainer, PageHeader } from "@/components/page-header"
import {
  CaseStatusBadge,
  OriginBadge,
  RefundStatusBadge,
} from "@/components/status-badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardAction,
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
import { Skeleton } from "@/components/ui/skeleton"
import { checkClaudeConnection } from "@/lib/ai/client"
import { getDashboardData } from "@/lib/data/dashboard"
import { integrationConfig } from "@/lib/env/server"
import { formatAge, formatDate } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"
import { checkPayPalConnection } from "@/lib/paypal/client"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Overview",
}

export default function DashboardPage() {
  return (
    <PageContainer>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </PageContainer>
  )
}

const claudeProblems = {
  not_configured: "Not set up",
  key_rejected: "Key rejected",
  model_not_found: "Model not found",
  unreachable: "Can't reach it",
} as const

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  )
}

async function DashboardContent() {
  const data = await getDashboardData()
  const config = integrationConfig()
  const [paypal, claude] = await Promise.all([
    config.paypal ? checkPayPalConnection() : null,
    checkClaudeConnection(),
  ])
  const { counts } = data
  const now = new Date()

  // The screen's finding: what needs a person, in one sentence.
  const review = counts.NEEDS_REVIEW
  const ready = counts.READY_FOR_APPROVAL
  const problems = counts.REFUND_FAILED + counts.RECOVERY_REQUIRED
  const parts = [
    review > 0 &&
      `${plural(review, "request needs", "requests need")} your review`,
    ready > 0 && `${plural(ready, "is", "are")} ready to approve`,
    problems > 0 &&
      `${plural(problems, "refund needs", "refunds need")} a follow-up`,
  ].filter(Boolean)
  const finding =
    parts.length > 0
      ? `${parts.join(", ").replace(/, ([^,]*)$/, " and $1")}.`
      : "Nothing needs you right now."

  const connections = [
    {
      name: "PayPal Sandbox",
      detail: "Payments and refunds",
      ok: Boolean(paypal?.ok),
      label: !paypal ? "Not set up" : paypal.ok ? "Connected" : "Not connected",
    },
    {
      name: "Claude",
      detail: "Checks requests against your policy",
      ok: claude.ok,
      label: claude.ok ? "Connected" : claudeProblems[claude.reason],
    },
    {
      name: "Database",
      detail: "Cases, policies, and receipts",
      ok: true,
      label: "Connected",
    },
  ]

  return (
    <>
      <PageHeader
        title="Overview"
        description={finding}
        actions={
          <Link href="/cases" className={buttonVariants({ size: "lg" })}>
            Open refund requests
          </Link>
        }
      />

      {problems > 0 ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>
            {plural(problems, "refund needs", "refunds need")} a follow-up
          </AlertTitle>
          <AlertDescription>
            <p>
              {counts.RECOVERY_REQUIRED > 0
                ? "PayPal hasn't confirmed whether a refund went through. Check its status before doing anything else."
                : "PayPal turned a refund down. No money was returned."}{" "}
              <Link
                href={`/cases?view=${counts.RECOVERY_REQUIRED > 0 ? "RECOVERY_REQUIRED" : "REFUND_FAILED"}`}
                className="font-medium underline underline-offset-4"
              >
                Show {problems === 1 ? "it" : "them"}
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Where your requests are</CardTitle>
          <CardDescription>
            {plural(data.totalCases, "request", "requests")} in total. Choose a
            stage to see them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RefundLine counts={counts} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 @4xl/main:grid-cols-3">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>Waiting on someone</CardTitle>
            <CardDescription>
              The most recent requests that need a person or a follow-up.
            </CardDescription>
            <CardAction>
              <Link
                href="/cases?view=attention"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View all
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.attention.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon />
                  </EmptyMedia>
                  <EmptyTitle>You&apos;re all caught up</EmptyTitle>
                  <EmptyDescription>
                    New requests show up here when they need you.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {data.attention.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/cases/${item.id}`}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 @xl/main:grid-cols-[2.5rem_minmax(0,1fr)_auto_6rem_6.5rem]"
                    >
                      <span
                        aria-hidden
                        className="row-span-2 flex size-10 items-center justify-center self-start rounded-full bg-field text-sm font-semibold text-accent-foreground @xl/main:row-span-1 @xl/main:self-center"
                      >
                        {initials(item.customer_display_name)}
                      </span>
                      <span className="col-start-2 row-start-1 flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-base font-semibold">
                            {item.customer_display_name}
                          </span>
                          <OriginBadge origin={item.origin} />
                        </span>
                        <span className="truncate text-sm text-muted-foreground">
                          {item.claimed_issue}
                        </span>
                      </span>
                      <span className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-1.5 @xl/main:col-span-1 @xl/main:col-start-3 @xl/main:row-start-1">
                        <CaseStatusBadge status={item.status} />
                      </span>
                      <span className="col-start-3 row-start-1 text-right text-base font-semibold @xl/main:col-start-4">
                        {item.requested_amount_minor !== null
                          ? formatMoney(
                              item.requested_amount_minor,
                              item.currency_code,
                            )
                          : "—"}
                      </span>
                      <span className="hidden text-right text-sm text-muted-foreground @xl/main:col-start-5 @xl/main:row-start-1 @xl/main:block">
                        {formatAge(item.updated_at, now)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Money refunded</CardTitle>
            <CardDescription>
              Returned to customers through PayPal
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-4xl font-bold tracking-tight">
              {formatMoney(data.confirmedRefundedMinor, data.currency)}
            </p>
            <RefundsChart days={data.refundsByDay} currency={data.currency} />
            <p className="text-sm text-muted-foreground">
              {data.demoCompletedCount > 0
                ? data.demoCompletedCount === 1
                  ? "1 demo refund isn't counted: it never went through PayPal."
                  : `${data.demoCompletedCount} demo refunds aren't counted: they never went through PayPal.`
                : "Only refunds PayPal confirmed as completed count here."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 @4xl/main:grid-cols-3">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>Recent refunds</CardTitle>
            <CardDescription>
              The latest refunds you approved and what PayPal said.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentRefunds.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptTextIcon />
                  </EmptyMedia>
                  <EmptyTitle>No refunds yet</EmptyTitle>
                  <EmptyDescription>
                    When you approve a refund, it shows up here with
                    PayPal&apos;s answer.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {data.recentRefunds.map((refund) => (
                  <li key={refund.id}>
                    <Link
                      href={`/receipts/${refund.case.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-xl px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 @xl/main:grid-cols-[minmax(0,1fr)_auto_6rem_7rem]"
                    >
                      <span className="col-start-1 row-start-1 flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-base font-semibold">
                            {refund.case.customer_display_name}
                          </span>
                          <OriginBadge origin={refund.origin} />
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Request {refund.case.case_number}
                        </span>
                      </span>
                      <span className="col-start-1 row-start-2 flex flex-wrap items-center gap-1.5 @xl/main:col-start-2 @xl/main:row-start-1">
                        <RefundStatusBadge status={refund.status} />
                      </span>
                      <span className="col-start-2 row-start-1 text-right text-base font-semibold @xl/main:col-start-3">
                        {formatMoney(
                          refund.approved_amount_minor,
                          refund.currency_code,
                        )}
                      </span>
                      <span className="hidden text-right text-sm text-muted-foreground @xl/main:col-start-4 @xl/main:row-start-1 @xl/main:block">
                        {formatDate(refund.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>
              Checked just now. Keys are never shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4">
              {connections.map((connection) => (
                <li
                  key={connection.name}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="flex flex-col">
                    <span className="text-base font-semibold">
                      {connection.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {connection.detail}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-2 text-sm font-medium",
                      connection.ok
                        ? "text-success"
                        : "text-warning-foreground dark:text-warning",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        connection.ok ? "bg-success" : "bg-warning",
                      )}
                    />
                    {connection.label}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-6 w-96 max-w-full" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid gap-6 @4xl/main:grid-cols-3">
        <Skeleton className="h-96 rounded-xl @4xl/main:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </>
  )
}
