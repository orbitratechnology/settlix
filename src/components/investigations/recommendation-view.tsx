import Link from "next/link"
import {
  TriangleAlertIcon,
  BadgeCheckIcon,
  BotIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  HistoryIcon,
} from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

function TextList({
  items,
  empty,
  tone = "default",
}: {
  items: string[]
  empty: string
  tone?: "default" | "warning"
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          {tone === "warning" ? (
            <TriangleAlertIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-warning"
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

/** The latest Claude recommendation, kept visibly separate from source facts. */
export function RecommendationView({
  record,
  stale,
  earlier,
  caseCurrency,
}: {
  record: InvestigationRecord
  stale: boolean
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

  return (
    <div className="flex flex-col gap-5">
      {stale ? (
        <Alert>
          <HistoryIcon />
          <AlertTitle>Records changed since this investigation</AlertTitle>
          <AlertDescription>
            The case, payment, refund history, or active policy is different
            now. Re-run the investigation before deciding.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <BotIcon data-icon="inline-start" />
            AI recommendation
          </Badge>
          <Badge variant={action.tone}>{action.label}</Badge>
          {amount ? (
            <span className="text-sm font-medium tabular-nums">{amount}</span>
          ) : null}
        </div>
        <p className="text-sm">{recommendation.summary}</p>
      </div>

      <Section title="Reasoning">
        <p className="text-sm text-muted-foreground">
          {recommendation.explanation}
        </p>
      </Section>

      <Section title="Policy evidence">
        {citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No policy clause was cited.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {citations.map((citation, index) => (
              <li
                key={`${citation.policyId}-${citation.clauseKey}-${index}`}
                className="flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="font-mono">
                    {citation.clauseKey}
                  </Badge>
                  <span className="font-medium">
                    {citation.clauseTitle ?? "Unknown clause"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {citation.policyName ?? "Unknown policy"} · v
                    {citation.policyVersion}
                  </span>
                </div>
                <blockquote className="border-l-2 pl-3 text-sm italic">
                  {citation.supportingQuote}
                </blockquote>
                <p className="text-sm text-muted-foreground">
                  {citation.explanation}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {citation.valid ? (
                    <Badge variant="success">
                      <BadgeCheckIcon data-icon="inline-start" />
                      Quote matches stored clause
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
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Open clause
                      <ExternalLinkIcon aria-hidden className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-5 @3xl/card:grid-cols-2">
        <Section title="Supports the request">
          <TextList
            items={recommendation.evidenceFor}
            empty="None identified."
          />
        </Section>
        <Section title="Missing evidence">
          <TextList
            items={recommendation.evidenceMissing}
            empty="Nothing required is missing."
            tone="warning"
          />
        </Section>
        <Section title="Contradictions">
          <TextList
            items={recommendation.contradictions}
            empty="None found."
            tone="warning"
          />
        </Section>
        <Section title="Risk flags">
          {recommendation.riskFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recommendation.riskFlags.map((flag, index) => (
                <li
                  key={`${flag.code}-${index}`}
                  className="flex flex-col gap-1"
                >
                  <Badge variant="warning">{riskFlagLabels[flag.code]}</Badge>
                  <span className="text-muted-foreground">{flag.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {recommendation.extractedFacts.length > 0 ? (
        <Section title="Facts Claude relied on">
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {recommendation.extractedFacts.map((fact, index) => (
              <li
                key={`${fact.fact}-${index}`}
                className="flex flex-col gap-1 p-3 @md/card:flex-row @md/card:items-start @md/card:justify-between @md/card:gap-4"
              >
                <span>{fact.fact}</span>
                <span className="flex shrink-0 flex-wrap gap-1">
                  <Badge variant="outline">
                    {factSourceLabels[fact.source]}
                  </Badge>
                  <Badge variant="secondary">
                    {fact.confidence} confidence
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Suggested customer reply">
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
          <p className="text-sm whitespace-pre-line">
            {recommendation.suggestedCustomerReply}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Draft only. Settlix never sends messages to customers.
            </span>
            <CopyButton
              value={recommendation.suggestedCustomerReply}
              label="Copy reply"
            />
          </div>
        </div>
      </Section>

      <Separator />

      <div className="flex flex-col gap-3 text-xs text-muted-foreground">
        <p>
          Investigated{" "}
          <time dateTime={record.createdAt}>
            {formatDateTime(record.createdAt)}
          </time>{" "}
          · {record.modelId} · prompt {record.promptVersion}
        </p>
        {earlier.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-foreground">Earlier runs</span>
            <ul className="flex flex-col gap-1">
              {earlier.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <time dateTime={run.createdAt}>
                    {formatDateTime(run.createdAt)}
                  </time>
                  <span aria-hidden>·</span>
                  <span>
                    {
                      proposedActionMeta[
                        run.stored.recommendation.proposedAction
                      ].label
                    }
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {eligibilityOutcomeMeta[run.eligibility.outcome].label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
