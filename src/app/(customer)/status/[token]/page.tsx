import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CircleCheckBigIcon, MailIcon } from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import { CustomerTracker } from "@/components/customer/customer-tracker"
import { ReplyForm } from "@/components/customer/reply-form"
import { StoreHeader } from "@/components/customer/store-header"
import { FactList } from "@/components/fact-list"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatDate, formatDateTime } from "@/lib/format"
import { statusUrl } from "@/lib/intake/messages"
import { getStatusPage } from "@/lib/intake/status-page"
import { siteOrigin } from "@/lib/site"
import { cn } from "@/lib/utils"

// The link is the key to this page: never indexed, never sent as a referrer.
export const metadata: Metadata = {
  title: "Your refund request",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

// A reply can have Settlix check the request again right after (after()).
export const maxDuration = 90

export default async function StatusPage({
  params,
  searchParams,
}: PageProps<"/status/[token]">) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const page = await getStatusPage(token)
  if (!page) notFound()
  const link = statusUrl(await siteOrigin(), token)
  const justSent = query.sent === "1"
  const added = query.added === "1"
  const waiting = page.view.tone === "attention"

  return (
    <>
      <StoreHeader
        storeName={page.storeName}
        title={page.view.title}
        description={page.view.detail}
      />

      {justSent || added ? (
        <Alert>
          <CircleCheckBigIcon />
          <AlertTitle>
            {added
              ? `Added to your open request ${page.caseNumber}`
              : `Request ${page.caseNumber} sent`}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              This is your private page for it. Bookmark it or copy the link:
              come back any time to see where it stands or to reply.
            </span>
            <CopyButton value={link} label="Copy link" />
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="@container/card">
        <CardContent className="flex flex-col gap-6">
          <CustomerTracker view={page.view} />
          <FactList
            facts={[
              { label: "Request", value: page.caseNumber },
              { label: "Order", value: page.orderReference },
              { label: "Item", value: page.item },
              { label: "Sent", value: formatDate(page.submittedAt) },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            Between you and {page.storeName} about this request.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ol className="flex flex-col gap-3">
            {page.messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl px-4 py-3",
                  message.fromStore
                    ? "mr-6 bg-primary/8 sm:mr-12"
                    : "ml-6 bg-muted sm:ml-12",
                )}
              >
                <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {message.fromStore ? page.storeName : "You"}
                  </span>
                  <time dateTime={message.createdAt}>
                    {formatDateTime(message.createdAt)}
                  </time>
                  {message.emailed ? (
                    <span className="flex items-center gap-1">
                      <MailIcon className="size-3.5" aria-hidden />
                      also emailed
                    </span>
                  ) : null}
                </span>
                <p className="text-base leading-relaxed break-words whitespace-pre-line">
                  {message.body}
                </p>
              </li>
            ))}
          </ol>
          {page.view.canAddInfo ? (
            <ReplyForm
              token={token}
              storeName={page.storeName}
              prompt={
                waiting ? "Reply to the store" : "Add something to your request"
              }
            />
          ) : null}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Anyone with this page&apos;s link can see it, so only share it with
        people you trust.
      </p>
    </>
  )
}
