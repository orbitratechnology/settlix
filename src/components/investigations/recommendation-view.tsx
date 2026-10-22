import Link from "next/link"
import {
  BadgeCheckIcon,
  CircleAlertIcon,
  HistoryIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Disclosure } from "@/components/cases/case-facts"
import { ReplyDraft } from "@/components/investigations/reply-draft"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  eligibilityOutcomeMeta,
  factSourceLabels,
  proposedActionMeta,
  riskFlagLabels,
} from "@/lib/domain/labels"
import { formatDateTime } from "@/lib/format"
import type { InvestigationRecord } from "@/lib/investigations/records"
import { formatMoney } from "@/lib/money/amounts"
import { citationProblemLabels } from "@/lib/policy/citations"

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function TextList({
  items,
  tone = "default",
}: {
  items: string[]
  tone?: "default" | "warning"
}) {
  return (
    <ul className="flex flex-col gap-2 text-[0.9375rem]">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          {tone === "warning" ? (
            <TriangleAlertIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
            />
          ) : (
            <span
              aria-hidden
              className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground"
            />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** The latest Claude suggestion, kept visibly separate from source facts. */
export function RecommendationView({
  record,
  stale,
  decided,
  earlier,
  caseCurrency,
}: {
  record: InvestigationRecord
  stale: boolean
  /** A refund was approved, so a re-run can't change the decision. */
  decided: boolean
  earlier: InvestigationRecord[]
  caseCurrency: string
}) {
  const { recommendation, citations } = record.stored
  const action = proposedActionMeta[recommendation.proposedAction]
  const amount =
    recommendation.proposedAmountMinor !== null &&
    Number.isSafeInteger(recommendation.proposedAmountMinor)
      ? formatMoney(
          recommendation.proposedAmountMinor,
          recommendation.currencyCode ?? caseCurrency,
        )
      : null

  const findings = [
    {
      title: "What supports the request",
      items: recommendation.evidenceFor,
      tone: "default" as const,
    },
    {
      title: "What doesn't add up",
      items: recommendation.contradictions,
      tone: "warning" as const,
    },
  ].filter((finding) => finding.items.length > 0)

  return (
    <div className="flex flex-col gap-6">
      {stale && decided ? (
        <p className="flex gap-2 text-[0.9375rem] text-muted-foreground">
          <HistoryIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          Kept as the record behind the refund decision. The payment has changed
          since Claude checked it.
        </p>
      ) : stale ? (
        <Alert>
          <HistoryIcon />
          <AlertTitle>Something changed since Claude checked</AlertTitle>
          <AlertDescription>
            The request, the payment, earlier refunds, or your return policy are
            different now. Check again before deciding.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">Claude suggests</span>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-bold tracking-tight">
            {action.label}
          </span>
          {amount ? (
            <span className="text-2xl font-bold tracking-tight text-primary">
              {amount}
            </span>
          ) : null}
        </p>
        <p className="text-base">{recommendation.summary}</p>
      </div>

      {recommendation.evidenceMissing.length > 0 ? (
        <Section title="Missing information">
          <TextList items={recommendation.evidenceMissing} tone="warning" />
        </Section>
      ) : null}

      <Section title="From your return policy">
        {citations.length === 0 ? (
          <p className="text-[0.9375rem] text-muted-foreground">
            Claude didn&apos;t quote a rule.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {citations.map((citation, index) => (
              <li
                key={`${citation.policyId}-${citation.clauseKey}-${index}`}
                className="flex flex-col gap-2.5 rounded-xl bg-muted px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.9375rem] font-semibold">
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
                </div>
                <blockquote className="text-base leading-relaxed">
                  “{citation.supportingQuote}”
                </blockquote>
                <p className="text-[0.9375rem] text-muted-foreground">
                  {citation.explanation}
                </p>
                {citation.valid ? (
                  <Link
                    href={`/policies/${citation.policyId}#clause-${citation.clauseKey}`}
                    className="w-fit text-[0.9375rem] font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Read the rule in {citation.policyName ?? "the policy"}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Reply to the customer">
        <div className="rounded-xl bg-muted p-4">
          <ReplyDraft
            key={record.id}
            initial={recommendation.suggestedCustomerReply}
          />
        </div>
      </Section>

      <Disclosure label="Claude's full reasoning">
        <div className="flex flex-col gap-6">
          <Section title="Why">
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              {recommendation.explanation}
            </p>
          </Section>
          {findings.length > 0 ? (
            <div className="grid gap-6 @3xl/card:grid-cols-2">
              {findings.map((finding) => (
                <Section key={finding.title} title={finding.title}>
                  <TextList items={finding.items} tone={finding.tone} />
                </Section>
              ))}
            </div>
          ) : null}

          {recommendation.riskFlags.length > 0 ? (
            <Section title="Warning signs">
              <ul className="flex flex-col gap-3 text-[0.9375rem]">
                {recommendation.riskFlags.map((flag, index) => (
                  <li
                    key={`${flag.code}-${index}`}
                    className="flex flex-col items-start gap-1"
                  >
                    <Badge variant="warning">{riskFlagLabels[flag.code]}</Badge>
                    <span className="text-muted-foreground">{flag.detail}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </Disclosure>

      <Disclosure label="Details for the record">
        <div className="flex flex-col gap-5 text-[0.9375rem]">
          {recommendation.extractedFacts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="font-semibold">Facts Claude relied on</span>
              <ul className="flex flex-col gap-2">
                {recommendation.extractedFacts.map((fact, index) => (
                  <li
                    key={`${fact.fact}-${index}`}
                    className="flex flex-col gap-1"
                  >
                    <span>{fact.fact}</span>
                    <span className="text-sm text-muted-foreground">
                      From {factSourceLabels[fact.source].toLowerCase()},{" "}
                      {fact.confidence} confidence
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <dl className="grid gap-1.5 text-sm text-muted-foreground">
            <div className="flex flex-wrap gap-x-2">
              <dt>Checked</dt>
              <dd>
                <time dateTime={record.createdAt}>
                  {formatDateTime(record.createdAt)}
                </time>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt>Model</dt>
              <dd>{record.modelId}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt>Prompt version</dt>
              <dd>{record.promptVersion}</dd>
            </div>
          </dl>
          {earlier.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold">Earlier checks</span>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {earlier.map((run) => (
                  <li key={run.id}>
                    <time dateTime={run.createdAt}>
                      {formatDateTime(run.createdAt)}
                    </time>
                    {": "}
                    {
                      proposedActionMeta[
                        run.stored.recommendation.proposedAction
                      ].label
                    }
                    , {eligibilityOutcomeMeta[run.eligibility.outcome].label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Disclosure>
    </div>
  )
}
