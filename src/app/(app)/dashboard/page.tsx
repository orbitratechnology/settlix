import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, InboxIcon, PlugZapIcon } from "lucide-react"

import { MetricCards, type Metric } from "@/components/dashboard/metric-cards"
import { PageContainer, PageHeader } from "@/components/page-header"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata: Metadata = {
  title: "Dashboard",
}

// Metrics are computed from persisted case and refund records once the
// database is connected. Until then every value renders an explicit "no data".
const metrics: Metric[] = [
  { label: "Open cases", value: null, note: "No case records yet" },
  { label: "Awaiting review", value: null, note: "Needs evidence or review" },
  {
    label: "Awaiting approval",
    value: null,
    note: "Eligible, not yet approved",
  },
  {
    label: "Refunds pending",
    value: null,
    note: "Sent to PayPal, not completed",
  },
  {
    label: "Completed refunds",
    value: null,
    note: "Verified COMPLETED by PayPal",
  },
  { label: "Failed or recovery", value: null, note: "Needs reconciliation" },
  {
    label: "Confirmed refunded (USD)",
    value: null,
    note: "Completed refunds only",
  },
]

const integrations = [
  { name: "PayPal Sandbox", detail: "Orders v2 · Payments v2" },
  { name: "Supabase", detail: "Postgres · Auth" },
  { name: "Claude", detail: "Vercel AI SDK" },
]

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

      <MetricCards metrics={metrics} />

      <div className="grid gap-4 @4xl/main:grid-cols-3">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>Cases needing attention</CardTitle>
            <CardDescription>
              Review, approval, pending, and recovery cases surface here first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing needs attention</EmptyTitle>
                <EmptyDescription>
                  There are no refund cases in this workspace yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integration health</CardTitle>
            <CardDescription>
              Connection checks run on the server. No secrets are shown.
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
                      <Badge variant="outline">
                        <PlugZapIcon data-icon="inline-start" />
                        Not checked
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
