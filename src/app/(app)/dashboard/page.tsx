import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, InboxIcon } from "lucide-react"

import { MetricCards, type Metric } from "@/components/dashboard/metric-cards"
import { PageContainer, PageHeader } from "@/components/page-header"
import { CaseStatusBadge, OriginBadge } from "@/components/status-badges"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDashboardData } from "@/lib/data/dashboard"
import { integrationConfig } from "@/lib/env/server"
import { formatDateTime } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Refund operations across your workspace."
        actions={
          <Link href="/cases" className={buttonVariants()}>
            Open Resolution Inbox
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </PageContainer>
  )
}

async function DashboardContent() {
  const data = await getDashboardData()
  const config = integrationConfig()
  const { counts } = data

  const metrics: Metric[] = [
    {
      label: "Open cases",
      value: String(data.openCount),
      note: `${data.totalCases} case${data.totalCases === 1 ? "" : "s"} in total`,
    },
    {
      label: "Awaiting review",
      value: String(counts.NEEDS_REVIEW + counts.NEEDS_EVIDENCE),
      note: `${counts.NEEDS_EVIDENCE} need evidence, ${counts.NEEDS_REVIEW} need review`,
    },
    {
      label: "Awaiting approval",
      value: String(counts.READY_FOR_APPROVAL),
      note: "Passed checks, not yet approved",
    },
    {
      label: "Refunds pending",
      value: String(counts.REFUND_PENDING),
      note: "Sent to PayPal, not completed",
    },
    {
      label: "Completed refunds",
      value: String(counts.REFUNDED),
      note:
        data.demoCompletedCount > 0
          ? `Includes ${data.demoCompletedCount} demo record${data.demoCompletedCount === 1 ? "" : "s"} (no PayPal refund)`
          : "Verified COMPLETED by PayPal",
    },
    {
      label: "Failed or recovery",
      value: String(counts.REFUND_FAILED + counts.RECOVERY_REQUIRED),
      note: "Needs follow-up or reconciliation",
    },
    {
      label: `Confirmed refunded (${data.currency})`,
      value: formatMoney(data.confirmedRefundedMinor, data.currency),
      note: "PayPal-completed refunds only; excludes demo records",
    },
  ]

  const integrations = [
    {
      name: "Supabase",
      detail: "Postgres · Auth",
      status: { label: "Connected", tone: "success" as const },
    },
    {
      name: "PayPal Sandbox",
      detail: "Orders v2 · Payments v2",
      status: config.paypal
        ? { label: "Configured", tone: "outline" as const }
        : { label: "Not configured", tone: "warning" as const },
    },
    {
      name: "Claude",
      detail: "Vercel AI SDK",
      status: config.anthropic
        ? { label: "Configured", tone: "outline" as const }
        : { label: "Not configured", tone: "warning" as const },
    },
  ]

  return (
    <>
      <MetricCards metrics={metrics} />

      <div className="grid gap-4 @4xl/main:grid-cols-3">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>Cases needing attention</CardTitle>
            <CardDescription>
              Evidence, review, approval, pending, failed, and recovery cases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.attention.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon />
                  </EmptyMedia>
                  <EmptyTitle>Nothing needs attention</EmptyTitle>
                  <EmptyDescription>
                    Every open case is new or being investigated.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead className="hidden @xl/main:table-cell">
                      Issue
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden text-right @3xl/main:table-cell">
                      Updated
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attention.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/cases/${item.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {item.case_number}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {item.customer_display_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-64 truncate @xl/main:table-cell">
                        {item.claimed_issue}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <CaseStatusBadge status={item.status} />
                          <OriginBadge origin={item.origin} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground @3xl/main:table-cell">
                        {formatDateTime(item.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integration health</CardTitle>
            <CardDescription>
              Checked on the server. No secrets are shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((integration) => (
                  <TableRow key={integration.name}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{integration.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {integration.detail}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={integration.status.tone}>
                        {integration.status.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 @4xl/main:grid-cols-3">
        <Skeleton className="h-72 rounded-xl @4xl/main:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </>
  )
}
