import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { MailCheckIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react"

import { Disclosure } from "@/components/cases/case-facts"
import { EmailSortForm } from "@/components/cases/email-sort-form"
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listEmailsToSort } from "@/lib/data/inbound-emails"
import { formatDateTime } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"

export const metadata: Metadata = {
  title: "Emails to sort",
}

export const maxDuration = 90

export default function EmailsToSortPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Emails to sort"
        description="Refund emails from Gmail that Settlix couldn't match to an order by itself. Pick the order to open a request."
      />
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
        <EmailList />
      </Suspense>
    </PageContainer>
  )
}

async function EmailList() {
  const { emails, orders } = await listEmailsToSort()
  const choices = orders.map((order) => ({
    value: order.id,
    label: `${order.external_order_reference}: ${order.description} (${formatMoney(order.original_amount_minor, order.currency_code)})${order.customer_email ? `, ${order.customer_email}` : ""}`,
  }))

  if (emails.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing to sort</EmptyTitle>
          <EmptyDescription>
            Emails Settlix can match to an order become requests on their own.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/cases"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to refund requests
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col gap-4">
      {emails.map((email) => {
        const long = email.body_text.length > 400
        return (
          <li key={email.id}>
            <Card className="@container/card">
              <CardHeader>
                <CardTitle className="break-words">
                  {email.subject || "(No subject)"}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="break-all">
                    {email.from_name
                      ? `${email.from_name} <${email.from_email}>`
                      : email.from_email}
                  </span>
                  <span>{formatDateTime(email.received_at)}</span>
                  {email.sender_authenticated ? (
                    <Badge variant="success">
                      <ShieldCheckIcon data-icon="inline-start" />
                      Sender verified by Gmail
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <ShieldAlertIcon data-icon="inline-start" />
                      Sender not verified
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 @3xl/card:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                  <blockquote className="rounded-xl bg-muted px-4 py-3 text-[0.9375rem] leading-relaxed break-words whitespace-pre-line">
                    {long
                      ? `${email.body_text.slice(0, 400)}…`
                      : email.body_text}
                  </blockquote>
                  {long ? (
                    <Disclosure label="Show the whole email">
                      <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-line">
                        {email.body_text}
                      </p>
                    </Disclosure>
                  ) : null}
                </div>
                <EmailSortForm
                  emailId={email.id}
                  orders={choices}
                  suggestedOrderId={email.suggested_order_id}
                />
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
