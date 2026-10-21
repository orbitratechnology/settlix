import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
} from "lucide-react"

import { CaseTimeline } from "@/components/cases/case-timeline"
import { CopyButton } from "@/components/copy-button"
import { FactList } from "@/components/fact-list"
import { ReplyDraft } from "@/components/investigations/reply-draft"
import { PageContainer, PageHeader } from "@/components/page-header"
import { OriginBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { getReceipt } from "@/lib/data/receipts"
import {
  eligibilityOutcomeMeta,
  paymentStateLabels,
  proposedActionMeta,
  refundAttemptStatusMeta,
  requestCategoryLabels,
  riskFlagLabels,
} from "@/lib/domain/labels"
import { formatDateTime } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"
import { citationProblemLabels } from "@/lib/policy/citations"
import {
  receiptReply,
  receiptState,
  receiptSummaryText,
  type Receipt,
} from "@/lib/receipts/receipt"
import { refundIssueMessages } from "@/lib/refunds/outcome"

export const metadata: Metadata = {
  title: "Resolution Receipt",
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs break-all">{children}</span>
}

export default async function ReceiptPage({
  params,
}: PageProps<"/receipts/[receiptId]">) {
  const { receiptId } = await params
  const loaded = await getReceipt(receiptId)
  if (!loaded) notFound()
  const { receipt, events } = loaded
  const state = receiptState(receipt)
  const reply = receiptReply(receipt)

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Receipt {receipt.caseNumber}
            <Badge variant={state.tone}>{state.label}</Badge>
            <OriginBadge origin={receipt.origin} />
          </span>
        }
        description={`${receipt.merchantName} · PayPal Sandbox · built from stored records`}
        actions={
          <>
            <Link
              href={`/cases/${receipt.caseId}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Case
            </Link>
            <CopyButton
              value={receiptSummaryText(receipt)}
              label="Copy summary"
            />
          </>
        }
      />

      <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <OutcomeCard receipt={receipt} state={state} />
          <DecisionCard receipt={receipt} />
          <PolicyEvidenceCard receipt={receipt} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <IdentifiersCard receipt={receipt} />
          {reply ? (
            <Card>
              <CardHeader>
                <CardTitle>Customer response</CardTitle>
                <CardDescription>
                  {receipt.attempt?.origin === "app" &&
                  (receipt.attempt.status === "COMPLETED" ||
                    receipt.attempt.status === "PENDING")
                    ? "Written from the PayPal result, with no promised dates."
                    : "Claude's draft from the investigation."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReplyDraft key={reply} initial={reply} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <CaseTimeline events={events} />
    </PageContainer>
  )
}

function OutcomeCard({
  receipt,
  state,
}: {
  receipt: Receipt
  state: ReturnType<typeof receiptState>
}) {
  const { attempt, investigation } = receipt
  const rec = investigation?.stored.recommendation
  const recommended = rec
    ? `${proposedActionMeta[rec.proposedAction].label}${
        rec.proposedAmountMinor !== null && rec.currencyCode
          ? ` ${formatMoney(rec.proposedAmountMinor, rec.currencyCode)}`
          : ""
      }`
    : "No recommendation"

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Outcome</CardTitle>
        <CardDescription>{state.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 @md/card:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-lg border p-3">
            <span className="text-xs text-muted-foreground">
              Recommended (AI, advisory)
            </span>
            <span className="text-sm font-medium">{recommended}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border p-3">
            <span className="text-xs text-muted-foreground">
              Actual result (PayPal)
            </span>
            <span className="text-sm font-medium">
              {attempt?.origin === "app"
                ? `${attempt.paypalStatus ?? "No answer yet"}${
                    attempt.paypalAmount
                      ? ` · ${attempt.paypalAmount.value} ${attempt.paypalAmount.currency_code}`
                      : ""
                  }`
                : attempt?.origin === "seed"
                  ? "None (demo record)"
                  : "No refund issued"}
            </span>
          </div>
        </div>

        {attempt?.origin === "app" ? (
          <FactList
            facts={[
              {
                label: "Approved amount",
                value: formatMoney(attempt.approvedMinor, attempt.currency),
              },
              { label: "Approved by", value: attempt.approvedBy ?? "Unknown" },
              {
                label: "Approved at",
                value: formatDateTime(attempt.approvedAt),
              },
              {
                label: "Checks at approval",
                value: attempt.approvalOutcome
                  ? eligibilityOutcomeMeta[attempt.approvalOutcome].label
                  : "Not recorded",
              },
              {
                label: "Refund attempt",
                value: (
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    <Mono>{attempt.id}</Mono>
                    <Badge
                      variant={refundAttemptStatusMeta[attempt.status].tone}
                    >
                      {refundAttemptStatusMeta[attempt.status].label}
                    </Badge>
                  </span>
                ),
              },
              {
                label: "PayPal refund ID",
                value: attempt.paypalRefundId ? (
                  <Mono>{attempt.paypalRefundId}</Mono>
                ) : (
                  <span className="text-muted-foreground">Not returned</span>
                ),
              },
              ...(attempt.responseCode
                ? [{ label: "PayPal HTTP status", value: attempt.responseCode }]
                : []),
              ...(attempt.errorCode
                ? [
                    {
                      label: "PayPal issue",
                      value: (
                        <span className="text-destructive">
                          {refundIssueMessages[attempt.errorCode] ??
                            attempt.errorCode}
                        </span>
                      ),
                    },
                  ]
                : []),
              ...(attempt.debugId
                ? [
                    {
                      label: "PayPal debug ID",
                      value: <Mono>{attempt.debugId}</Mono>,
                    },
                  ]
                : []),
            ]}
          />
        ) : attempt?.origin === "seed" ? (
          <p className="text-sm text-muted-foreground">
            This refund record was seeded for the demo. No PayPal call was made.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No refund has been approved or issued for this case.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DecisionCard({ receipt }: { receipt: Receipt }) {
  const investigation = receipt.investigation
  if (!investigation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
          <CardDescription>
            No investigation has been run for this case.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const rec = investigation.stored.recommendation
  const checks = eligibilityOutcomeMeta[investigation.eligibility.outcome]
  const flags = [
    ...rec.evidenceMissing.map((item) => `Missing: ${item}`),
    ...rec.contradictions.map((item) => `Contradiction: ${item}`),
    ...rec.riskFlags.map(
      (flag) => `${riskFlagLabels[flag.code]}: ${flag.detail}`,
    ),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision basis</CardTitle>
        <CardDescription>
          Claude&apos;s recommendation and the deterministic checks it was held
          to.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={proposedActionMeta[rec.proposedAction].tone}>
              {proposedActionMeta[rec.proposedAction].label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {investigation.modelId} · prompt {investigation.promptVersion} ·{" "}
              {formatDateTime(investigation.createdAt)}
            </span>
          </span>
          <p>{rec.summary}</p>
          <p className="text-muted-foreground">{rec.explanation}</p>
        </div>
        <Separator />
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Evidence and uncertainty</span>
          {flags.length === 0 ? (
            <p className="text-muted-foreground">
              No missing evidence, contradictions, or risk flags.
            </p>
          ) : (
            <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
              {flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}
        </div>
        <Separator />
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Deterministic checks</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={checks.tone}>{checks.label}</Badge>
            <span className="text-muted-foreground">
              {investigation.eligibility.summary}
            </span>
          </span>
          {investigation.eligibility.reasonCodes.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {investigation.eligibility.reasonCodes.map((code) => (
                <Badge key={code} variant="outline" className="font-mono">
                  {code}
                </Badge>
              ))}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function PolicyEvidenceCard({ receipt }: { receipt: Receipt }) {
  const citations = receipt.investigation?.stored.citations ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Policy evidence</CardTitle>
        <CardDescription>
          Clauses quoted by the recommendation, checked against the published
          policy version.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clauses cited.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {citations.map((citation, index) => (
              <li
                key={`${citation.clauseKey}-${index}`}
                className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {citation.clauseKey}
                  </Badge>
                  <span className="font-medium">
                    {citation.clauseTitle ?? "Unknown clause"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {citation.policyName ?? "Unknown policy"} v
                    {citation.policyVersion}
                  </span>
                </span>
                <blockquote className="border-l-2 pl-3 italic">
                  {citation.supportingQuote}
                </blockquote>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  {citation.valid ? (
                    <Badge variant="success">
                      <BadgeCheckIcon data-icon="inline-start" />
                      Matches stored clause
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <CircleAlertIcon data-icon="inline-start" />
                      {citation.problem
                        ? citationProblemLabels[citation.problem]
                        : "Not verified"}
                    </Badge>
                  )}
                  {citation.valid ? (
                    <Link
                      href={`/policies/${citation.policyId}#clause-${citation.clauseKey}`}
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Open clause
                      <ExternalLinkIcon aria-hidden className="size-3.5" />
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function IdentifiersCard({ receipt }: { receipt: Receipt }) {
  const { order } = receipt
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Case &amp; payment</CardTitle>
        <CardDescription>
          {order.origin === "seed"
            ? "Seeded demo order, not linked to PayPal."
            : "Mapped PayPal Sandbox order and capture."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FactList
          facts={[
            { label: "Case", value: receipt.caseNumber },
            { label: "Customer", value: receipt.customerName },
            {
              label: "Category",
              value: requestCategoryLabels[receipt.category],
            },
            { label: "Claimed issue", value: receipt.claimedIssue },
            {
              label: "Requested",
              value:
                receipt.requestedMinor === null
                  ? "Not stated"
                  : formatMoney(receipt.requestedMinor, receipt.currency),
            },
            { label: "Opened", value: formatDateTime(receipt.openedAt) },
            { label: "Order", value: order.reference },
            { label: "Item", value: order.description },
            {
              label: "Captured",
              value: formatMoney(order.capturedMinor, order.currency),
            },
            {
              label: "Payment state",
              value: paymentStateLabels[order.paymentState],
            },
            {
              label: "PayPal order ID",
              value: order.paypalOrderId ? (
                <Mono>{order.paypalOrderId}</Mono>
              ) : (
                "None"
              ),
            },
            {
              label: "PayPal capture ID",
              value: order.paypalCaptureId ? (
                <Mono>{order.paypalCaptureId}</Mono>
              ) : (
                "Not linked"
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  )
}
