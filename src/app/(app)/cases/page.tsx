import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { CreditCardIcon, InboxIcon, PlusIcon } from "lucide-react"

import { CaseInbox } from "@/components/cases/case-inbox"
import { PageContainer, PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
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
import { listCases } from "@/lib/data/cases"

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
          <Link href="/payments" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            New case from payment
          </Link>
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

  return <CaseInbox rows={cases} />
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
