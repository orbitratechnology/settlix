import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, BadgeCheckIcon, CircleAlertIcon } from "lucide-react"

import { Disclosure } from "@/components/cases/case-facts"
import { CaseTimeline } from "@/components/cases/case-timeline"
import { CopyButton } from "@/components/copy-button"
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
  title: "Receipt",
}

function Reference({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-sm break-all">{children}</span>
}

/** A receipt's torn bottom edge. */
const tornBottom = (() => {
  const teeth = 40
  const points = ["0 0", "100% 0"]
  for (let i = teeth; i >= 0; i--) {
    points.push(
      `${(i / teeth) * 100}% ${i % 2 === 0 ? "100%" : "calc(100% - 10px)"}`,
    )
  }
  return `polygon(${points.join(", ")})`
})()

const stateText: Record<ReturnType<typeof receiptState>["tone"], string> = {
  default: "text-foreground",
  secondary: "text-foreground",
  outline: "text-foreground",
  info: "text-accent-foreground dark:text-primary",
  success: "text-success",
  warning: "text-warning-foreground dark:text-warning",
  destructive: "text-destructive",
}

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase()
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
        title={`Receipt for ${receipt.customerName}`}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Badge variant={state.tone}>{state.label}</Badge>
            <OriginBadge origin={receipt.origin} />
            <span>
              Request {receipt.caseNumber}.{" "}
              {receipt.merchantName.replace(/\.$/, "")}.
            </span>
          </span>
        }
        actions={
          <>
            <Link
              href={`/cases/${receipt.caseId}`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Back to the request
            </Link>
            <CopyButton
              value={receiptSummaryText(receipt)}
              label="Copy summary"
            />
          </>
        }
      />

      <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ReceiptSheet receipt={receipt} state={state} />
        <div className="flex min-w-0 flex-col gap-6">
          {reply ? (
            <Card>
              <CardHeader>
                <CardTitle>Reply to the customer</CardTitle>
                <CardDescription>
                  {receipt.attempt?.origin === "app" &&
                  (receipt.attempt.status === "COMPLETED" ||
                    receipt.attempt.status === "PENDING")
                    ? "Written from PayPal's answer. It promises no dates."
                    : "Claude's draft. Edit it, then copy it into your email."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReplyDraft key={reply} initial={reply} />
              </CardContent>
            </Card>
          ) : null}
          <ReasonsCard receipt={receipt} />
        </div>
      </div>

      <CaseTimeline events={events} />
    </PageContainer>
  )
}

function Row({
  label,
  children,
  strong,
}: {
  label: string
  children: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          strong
            ? "min-w-0 text-right text-lg font-bold"
            : "min-w-0 text-right font-medium"
        }
      >
        {children}
      </dd>
    </div>
  )
}

/** The receipt itself: outcome, money, approval, and PayPal's references. */
function ReceiptSheet({
  receipt,
  state,
}: {
  receipt: Receipt
  state: ReturnType<typeof receiptState>
}) {
  const { attempt, order } = receipt
  const live = attempt?.origin === "app"
  const money = (minor: number, currency = receipt.currency) =>
    formatMoney(minor, currency)

  return (
    <article
      aria-label="Receipt"
      className="flex min-w-0 flex-col gap-6 bg-card px-6 pt-7 pb-12 text-[0.9375rem] text-card-foreground ring-1 ring-foreground/10 sm:px-8"
      style={{ clipPath: tornBottom }}
    >
      <header className="flex flex-col gap-2">
        <p
          className={`text-2xl font-bold tracking-tight ${stateText[state.tone]}`}
        >
          {state.label}
        </p>
        <p className="text-base text-muted-foreground">{state.description}</p>
        {live ? (
          <p className="pt-2 text-4xl font-bold tracking-tight">
            {money(attempt.approvedMinor, attempt.currency)}
          </p>
        ) : null}
      </header>

      <dl className="flex flex-col border-t border-dashed pt-4">
        <Row label="Customer">{receipt.customerName}</Row>
        <Row label="Order">{order.reference}</Row>
        <Row label="Item">{order.description}</Row>
        <Row label="Reason">{requestCategoryLabels[receipt.category]}</Row>
        <Row label="Problem">{receipt.claimedIssue}</Row>
      </dl>

      <dl className="flex flex-col border-t border-dashed pt-4">
        <Row label="Customer paid">
          {money(order.capturedMinor, order.currency)}
        </Row>
        <Row label="Customer asked for">
          {receipt.requestedMinor === null
            ? "No amount given"
            : money(receipt.requestedMinor)}
        </Row>
        <Row label="Payment now">{paymentStateLabels[order.paymentState]}</Row>
        {live ? (
          <>
            <Row label="Approved refund" strong>
              {money(attempt.approvedMinor, attempt.currency)}
            </Row>
            <Row label="PayPal says">
              {attempt.paypalStatus
                ? `${titleCase(attempt.paypalStatus)}${
                    attempt.paypalAmount
                      ? `, ${attempt.paypalAmount.value} ${attempt.paypalAmount.currency_code}`
                      : ""
                  }`
                : "No answer yet"}
            </Row>
            {attempt.errorCode ? (
              <Row label="PayPal's reason">
                <span className="text-destructive">
                  {refundIssueMessages[attempt.errorCode] ?? attempt.errorCode}
                </span>
              </Row>
            ) : null}
          </>
        ) : (
          <Row label="Refund">
            {attempt?.origin === "seed"
              ? "Demo record, no PayPal refund"
              : "None issued"}
          </Row>
        )}
      </dl>

      {live ? (
        <dl className="flex flex-col border-t border-dashed pt-4">
          <Row label="Approved by">{attempt.approvedBy ?? "Unknown"}</Row>
          <Row label="Approved on">{formatDateTime(attempt.approvedAt)}</Row>
          <Row label="Checks when approved">
            {attempt.approvalOutcome
              ? eligibilityOutcomeMeta[attempt.approvalOutcome].label
              : "Not recorded"}
          </Row>
        </dl>
      ) : null}

      <section className="flex flex-col gap-1 border-t border-dashed pt-4">
        <h2 className="text-base font-semibold">PayPal references</h2>
        <p className="text-sm text-muted-foreground">
          Use these to find this payment and refund in PayPal.
        </p>
        <dl className="flex flex-col">
          <Row label="Refund">
            {live && attempt.paypalRefundId ? (
              <Reference>{attempt.paypalRefundId}</Reference>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Row>
          <Row label="Payment">
            {order.paypalCaptureId ? (
              <Reference>{order.paypalCaptureId}</Reference>
            ) : (
              <span className="text-muted-foreground">Not linked</span>
            )}
          </Row>
          <Row label="Order">
            {order.paypalOrderId ? (
              <Reference>{order.paypalOrderId}</Reference>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Row>
        </dl>
      </section>

      {live ? (
        <Disclosure label="Technical details">
          <dl className="flex flex-col text-sm">
            <Row label="Refund attempt">
              <Reference>{attempt.id}</Reference>
            </Row>
            <Row label="Attempt status">
              {refundAttemptStatusMeta[attempt.status].label}
            </Row>
            {attempt.responseCode ? (
              <Row label="PayPal HTTP status">{attempt.responseCode}</Row>
            ) : null}
            {attempt.debugId ? (
              <Row label="PayPal debug ID">
                <Reference>{attempt.debugId}</Reference>
              </Row>
            ) : null}
          </dl>
        </Disclosure>
      ) : null}
    </article>
  )
}

/** Why the request was decided this way: Claude's suggestion and the rules. */
function ReasonsCard({ receipt }: { receipt: Receipt }) {
  const investigation = receipt.investigation
  if (!investigation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Why</CardTitle>
          <CardDescription>
            Claude hasn&apos;t checked this request yet.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const rec = investigation.stored.recommendation
  const checks = eligibilityOutcomeMeta[investigation.eligibility.outcome]
  const issues = [
    ...rec.evidenceMissing.map((item) => `Missing: ${item}`),
    ...rec.contradictions.map((item) => `Doesn't add up: ${item}`),
    ...rec.riskFlags.map(
      (flag) => `${riskFlagLabels[flag.code]}: ${flag.detail}`,
    ),
  ]
  const citations = investigation.stored.citations

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Why</CardTitle>
        <CardDescription>
          Claude&apos;s suggestion, the rules it quoted, and Settlix&apos;s
          checks.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-[0.9375rem]">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">
            Claude suggested
          </span>
          <span className="text-lg font-semibold">
            {proposedActionMeta[rec.proposedAction].label}
            {rec.proposedAmountMinor !== null && rec.currencyCode
              ? `, ${formatMoney(rec.proposedAmountMinor, rec.currencyCode)}`
              : ""}
          </span>
          <p>{rec.summary}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">
            Settlix&apos;s checks
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={checks.tone}>{checks.label}</Badge>
          </span>
          <p className="text-muted-foreground">
            {investigation.eligibility.summary}
          </p>
        </div>

        {citations.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            <span className="text-sm text-muted-foreground">
              Rules quoted from the return policy
            </span>
            <ul className="flex flex-col gap-3">
              {citations.map((citation, index) => (
                <li
                  key={`${citation.clauseKey}-${index}`}
                  className="flex flex-col gap-2 rounded-xl bg-muted px-4 py-3"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      Rule {citation.clauseKey}:{" "}
                      {citation.clauseTitle ?? "Unknown rule"}
                    </span>
                    {citation.valid ? (
                      <Badge variant="success">
                        <BadgeCheckIcon data-icon="inline-start" />
                        Quote checked
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <CircleAlertIcon data-icon="inline-start" />
                        {citation.problem
                          ? citationProblemLabels[citation.problem]
                          : "Not verified"}
                      </Badge>
                    )}
                  </span>
                  <blockquote>“{citation.supportingQuote}”</blockquote>
                  {citation.valid ? (
                    <Link
                      href={`/policies/${citation.policyId}#clause-${citation.clauseKey}`}
                      className="w-fit font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Read the rule in {citation.policyName ?? "the policy"},
                      version {citation.policyVersion}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {issues.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">
              Open questions at the time
            </span>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Disclosure label="Details for the record">
          <dl className="grid gap-1.5 text-sm text-muted-foreground">
            <div className="flex flex-wrap gap-x-2">
              <dt>Checked</dt>
              <dd>{formatDateTime(investigation.createdAt)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt>Model</dt>
              <dd>{investigation.modelId}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt>Prompt version</dt>
              <dd>{investigation.promptVersion}</dd>
            </div>
            {investigation.eligibility.reasonCodes.length > 0 ? (
              <div className="flex flex-wrap gap-x-2">
                <dt>Reason codes</dt>
                <dd className="font-mono">
                  {investigation.eligibility.reasonCodes.join(", ")}
                </dd>
              </div>
            ) : null}
          </dl>
        </Disclosure>
      </CardContent>
    </Card>
  )
}
