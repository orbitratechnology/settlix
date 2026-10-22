import Link from "next/link"
import { ExternalLinkIcon } from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import {
  MessageComposer,
  type Delivery,
} from "@/components/cases/message-composer"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CaseDetail } from "@/lib/data/cases"
import { formatDateTime } from "@/lib/format"
import { firstName } from "@/lib/intake/messages"
import { messageOrigin } from "@/lib/intake/sources"
import { cn } from "@/lib/utils"

/**
 * The conversation with the customer about this request, and the composer.
 * The customer sees the same messages on their request page.
 */
export function CustomerMessagesCard({
  detail,
  statusUrl,
  composer,
}: {
  detail: CaseDetail
  statusUrl: string | null
  composer: {
    draft: string
    draftSource: string | null
    delivery: Delivery
  } | null
}) {
  const name = firstName(detail.customer_display_name)
  return (
    <Card id="messages" className="@container/card scroll-mt-24">
      <CardHeader>
        <CardTitle>
          Messages with {name === "there" ? "the customer" : name}
        </CardTitle>
        <CardDescription>
          The customer sees these on their request page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {statusUrl ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-4 py-3">
            <span className="mr-auto text-[0.9375rem] font-medium">
              Their request page
            </span>
            <CopyButton value={statusUrl} label="Copy link" />
            <Link
              href={statusUrl}
              target="_blank"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              Open
            </Link>
          </div>
        ) : null}

        {detail.messages.length === 0 ? (
          <p className="text-[0.9375rem] text-muted-foreground">
            No messages yet. This request was added in Settlix, so the
            customer&apos;s own words are in “What the customer asked”.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {detail.messages.map((message) => {
              const fromStore = message.sender !== "customer"
              return (
                <li
                  key={message.id}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl px-4 py-3",
                    fromStore
                      ? "ml-6 bg-primary/8 @md/card:ml-12"
                      : "mr-6 bg-muted @md/card:mr-12",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {messageOrigin(message.sender, message.channel)}
                    </span>
                    <time dateTime={message.created_at}>
                      {formatDateTime(message.created_at)}
                    </time>
                  </span>
                  <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-line">
                    {message.body}
                  </p>
                </li>
              )
            })}
          </ol>
        )}

        {composer ? (
          <MessageComposer
            caseId={detail.id}
            draft={composer.draft}
            draftSource={composer.draftSource}
            delivery={composer.delivery}
            statusUrl={statusUrl}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
