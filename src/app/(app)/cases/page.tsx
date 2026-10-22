import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import {
  CreditCardIcon,
  InboxIcon,
  MailIcon,
  PlusIcon,
  QrCodeIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { CaseInbox } from "@/components/cases/case-inbox"
import { GmailAutoSync } from "@/components/cases/gmail-auto-sync"
import { PageContainer, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { getGmailConnection } from "@/lib/gmail/client"
import { requireMember } from "@/lib/security/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

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
          <>
            <Link
              href="/request-form"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <QrCodeIcon data-icon="inline-start" />
              Your request form
            </Link>
            <Link href="/payments" className={buttonVariants({ size: "lg" })}>
              <PlusIcon data-icon="inline-start" />
              Add a request
            </Link>
          </>
        }
      />
      <Suspense fallback={null}>
        <IntakeNotices />
      </Suspense>
      <Suspense fallback={<CasesListSkeleton />}>
        <CasesList searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  )
}

/** Gmail needing attention, emails waiting for an order, and the background Gmail check. */
async function IntakeNotices() {
  const member = await requireMember()
  const [connection, toSort] = await Promise.all([
    getGmailConnection(createAdminClient(), member.workspace.id),
    (await createClient())
      .from("inbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", member.workspace.id)
      .eq("status", "to_sort"),
  ])
  const waiting = toSort.count ?? 0
  if (!connection && waiting === 0) return null

  return (
    <>
      {connection?.status === "needs_reconnect" ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Gmail needs reconnecting</AlertTitle>
          <AlertDescription>
            Google ended Settlix&apos;s access, so new emails aren&apos;t coming
            in.{" "}
            <Link href="/request-form#gmail" className="font-medium underline">
              Reconnect Gmail
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {waiting > 0 ? (
        <Alert>
          <MailIcon />
          <AlertTitle>
            {waiting} email{waiting === 1 ? "" : "s"} from Gmail need
            {waiting === 1 ? "s" : ""} an order
          </AlertTitle>
          <AlertDescription>
            Settlix couldn&apos;t tell which order {waiting === 1 ? "it is" : "they are"}{" "}
            about.{" "}
            <Link href="/cases/emails" className="font-medium underline">
              Sort {waiting === 1 ? "it" : "them"}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {connection?.canRead && connection.status === "active" ? (
        <GmailAutoSync lastSyncedAt={connection.lastSyncedAt} />
      ) : null}
    </>
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
