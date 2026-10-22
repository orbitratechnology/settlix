import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import {
  DownloadIcon,
  ExternalLinkIcon,
  InboxIcon,
  PrinterIcon,
} from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import { PageContainer, PageHeader } from "@/components/page-header"
import { GmailCard } from "@/components/request-form/gmail-card"
import { QrCode } from "@/components/request-form/qr-code"
import { SettingSwitch } from "@/components/request-form/setting-switch"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { getRequestFormOverview } from "@/lib/data/request-form"
import { integrationConfig } from "@/lib/env/server"
import { requestFormUrl } from "@/lib/intake/messages"
import { qrSvgFile } from "@/lib/qr"
import { can } from "@/lib/security/auth"
import { siteOrigin } from "@/lib/site"

export const metadata: Metadata = {
  title: "Request form",
}

// "Check Gmail" may acknowledge and check new requests right after (after()).
export const maxDuration = 90

export default function RequestFormPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Request form"
        description="Customers ask for a refund here, from wherever they bought. Settlix matches the order, Claude checks the request, and you decide."
      />
      <Suspense fallback={<RequestFormSkeleton />}>
        <RequestFormContent />
      </Suspense>
    </PageContainer>
  )
}

function RequestFormSkeleton() {
  return (
    <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}

async function RequestFormContent() {
  const [overview, origin] = await Promise.all([
    getRequestFormOverview(),
    siteOrigin(),
  ])
  const { member, formEnabled, autoCheck, sources, sourceDays } = overview
  const slug = member.workspace.slug
  const link = (via?: string) => requestFormUrl(origin, slug, { via })
  const formLink = link()
  const qrLink = link("qr")
  const disabledReason = !can.manageStore(member.role)
    ? "Only owners and admins can change this."
    : member.workspace.isDemo
      ? "The shared demo store keeps this on so every visitor can try it."
      : null
  const claudeReady = integrationConfig().anthropic

  const snippets = [
    {
      label: "Email signature",
      text: `Need a refund or a return? Ask here: ${link("email")}`,
    },
    {
      label: "Order confirmation or packing slip",
      text: `Something wrong with your order? Ask for a refund at ${link("receipt")}. Have your order number ready.`,
    },
    {
      label: "Website button (HTML)",
      text: `<a href="${link("site")}">Ask for a refund</a>`,
    },
    {
      label: "Chat and social replies",
      text: `You can ask for a refund here, it takes a minute: ${link("chat")}`,
    },
  ]

  return (
    <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="@container/card">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Your form link
              {formEnabled ? (
                <Badge variant="success">On</Badge>
              ) : (
                <Badge variant="outline">Paused</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Customers enter their order number and the email they paid with.
              Requests appear in Refund requests right away.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <p
                data-testid="form-link"
                className="rounded-xl bg-muted px-4 py-3 font-mono text-[0.9375rem] break-all"
              >
                {formLink}
              </p>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={formLink} label="Copy link" />
                <Link
                  href={formLink}
                  target="_blank"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  Open the form
                </Link>
              </div>
            </div>
            <FieldGroup>
              <SettingSwitch
                setting="formEnabled"
                checked={formEnabled}
                label="Take requests through the form"
                description="When paused, the link says the store isn't taking requests there."
                disabledReason={disabledReason}
              />
              <FieldSeparator />
              <SettingSwitch
                setting="autoCheck"
                checked={autoCheck}
                label="Have Claude check new requests right away"
                description={
                  claudeReady
                    ? "About $0.002 a check, up to 20 an hour. Claude only suggests; nothing is refunded or sent to the customer until you decide."
                    : "Claude isn't set up on the server yet, so new requests wait for you."
                }
                disabledReason={disabledReason}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Share it</CardTitle>
            <CardDescription>
              Ready-made text with the link. Each one is tagged, so you can see
              below which ones customers use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4">
              {snippets.map((snippet) => (
                <li key={snippet.label} className="flex flex-col gap-2">
                  <span className="text-[0.9375rem] font-semibold">
                    {snippet.label}
                  </span>
                  <p className="rounded-xl bg-muted px-4 py-3 text-[0.9375rem] break-words">
                    {snippet.text}
                  </p>
                  <div>
                    <CopyButton value={snippet.text} label="Copy" />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <GmailCard />
        </Suspense>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>QR code</CardTitle>
            <CardDescription>
              For packaging, receipts, and the counter. Scanning opens the form
              on the customer&apos;s phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5">
            <QrCode
              value={qrLink}
              label={`QR code that opens ${member.workspace.name}'s refund request form`}
              className="w-full max-w-64 border p-1"
            />
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgFile(qrLink))}`}
                download={`${slug}-refund-qr.svg`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <DownloadIcon data-icon="inline-start" />
                Download
              </a>
              <Link
                href="/request-form/card"
                target="_blank"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <PrinterIcon data-icon="inline-start" />
                Print a card
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where requests came from</CardTitle>
            <CardDescription>Last {sourceDays} days.</CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="flex items-center gap-2 text-[0.9375rem] text-muted-foreground">
                <InboxIcon aria-hidden className="size-4" />
                No requests from the form or Gmail yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-[0.9375rem]">
                {sources.map((source) => (
                  <li
                    key={source.label}
                    className="flex items-center justify-between gap-4"
                  >
                    <span>{source.label}</span>
                    <span className="font-semibold tabular-nums">
                      {source.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
