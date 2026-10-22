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
import { parseInboxView } from "@/lib/cases/inbox"
import { listCases } from "@/lib/data/cases"

export const metadata: Metadata = {
  title: "Refund requests",
}

export default function CasesPage({ searchParams }: PageProps<"/cases">) {
  return (
    <PageContainer>
      <PageHeader
        title="Refund requests"
        description="Every refund a customer asked for. Open one to see what Claude found and decide."
        actions={
          <Link href="/payments" className={buttonVariants({ size: "lg" })}>
            <PlusIcon data-icon="inline-start" />
            Add a request
          </Link>
        }
      />
      <Suspense fallback={<CasesListSkeleton />}>
        <CasesList searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  )
}

async function CasesList({
  searchParams,
}: {
  searchParams: PageProps<"/cases">["searchParams"]
}) {
  const [cases, params] = await Promise.all([listCases(), searchParams])

  if (cases.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>No refund requests yet</EmptyTitle>
          <EmptyDescription>
            Add one from a PayPal Sandbox payment, or sign in to the demo store
            to see example requests.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/payments"
            className={buttonVariants({ variant: "outline" })}
          >
            <CreditCardIcon data-icon="inline-start" />
            Go to payments
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return <CaseInbox rows={cases} initialView={parseInboxView(params.view)} />
}

function CasesListSkeleton() {
  return (
    <>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-32 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Card className="py-2">
        <CardContent className="flex flex-col gap-3 px-4 sm:px-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    </>
  )
}
