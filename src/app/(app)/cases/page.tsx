import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { CreditCardIcon, InboxIcon, PlusIcon } from "lucide-react"

import { PageContainer, PageHeader } from "@/components/page-header"
import { CaseStatusBadge, OriginBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
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
import { listCases } from "@/lib/data/cases"
import { requestCategoryLabels } from "@/lib/domain/labels"
import { formatDate } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"

export const metadata: Metadata = {
  title: "Resolution Inbox",
}

export default function CasesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Resolution Inbox"
        description="Prioritize, investigate, and resolve customer refund requests."
        actions={
          <Button disabled>
            <PlusIcon data-icon="inline-start" />
            New case
          </Button>
        }
      />
      <Suspense fallback={<CasesTableSkeleton />}>
        <CasesTable />
      </Suspense>
    </PageContainer>
  )
}

async function CasesTable() {
  const cases = await listCases()

  if (cases.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>No refund cases yet</EmptyTitle>
          <EmptyDescription>
            Cases appear here once they are created from a mapped PayPal Sandbox
            payment or loaded as labeled demo data.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/payments"
            className={buttonVariants({ variant: "outline" })}
          >
            <CreditCardIcon data-icon="inline-start" />
            Go to Payments
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <Card className="py-0">
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Case</TableHead>
              <TableHead className="hidden @3xl/main:table-cell">
                Order
              </TableHead>
              <TableHead className="hidden @xl/main:table-cell">
                Category
              </TableHead>
              <TableHead className="text-right">Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden pr-4 text-right @4xl/main:table-cell">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="pl-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/cases/${item.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.case_number}
                      </Link>
                      {item.priority === "high" ||
                      item.priority === "urgent" ? (
                        <Badge variant="warning">
                          {item.priority === "urgent" ? "Urgent" : "High"}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.customer_display_name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden @3xl/main:table-cell">
                  {item.order.external_order_reference}
                </TableCell>
                <TableCell className="hidden @xl/main:table-cell">
                  {requestCategoryLabels[item.request_category]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.requested_amount_minor === null ? (
                    <span className="text-muted-foreground">Not stated</span>
                  ) : (
                    formatMoney(item.requested_amount_minor, item.currency_code)
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <CaseStatusBadge status={item.status} />
                    <OriginBadge origin={item.origin} />
                  </div>
                </TableCell>
                <TableCell className="hidden pr-4 text-right text-muted-foreground @4xl/main:table-cell">
                  {formatDate(item.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function CasesTableSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}
