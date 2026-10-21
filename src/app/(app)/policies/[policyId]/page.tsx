import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { LockIcon, ScrollTextIcon, TriangleAlertIcon } from "lucide-react"

import { FactList } from "@/components/fact-list"
import { PageContainer, PageHeader } from "@/components/page-header"
import {
  DeleteClauseButton,
  PolicyVersionActions,
} from "@/components/policies/policy-actions"
import {
  ClauseDialog,
  PolicyDetailsForm,
} from "@/components/policies/policy-forms"
import { PolicyStatusBadge } from "@/components/status-badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getPolicyDetail } from "@/lib/data/policies"
import { clauseTypeLabels } from "@/lib/domain/labels"
import { formatDate, formatDateTime } from "@/lib/format"
import {
  formatMoney,
  toDecimalString,
  currencyExponent,
} from "@/lib/money/amounts"
import { policyWarnings } from "@/lib/policy/warnings"
import { can, requireMember } from "@/lib/security/auth"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Policy version",
}

export default async function PolicyVersionPage({
  params,
}: PageProps<"/policies/[policyId]">) {
  const { policyId } = await params
  const [detail, member] = await Promise.all([
    getPolicyDetail(policyId),
    requireMember(),
  ])
  if (!detail) notFound()

  const { policy, versions } = detail
  const isDraft = policy.published_at === null
  const canManage = can.managePolicies(member.role)
  const editable = isDraft && canManage
  const currency = member.workspace.defaultCurrency
  const label = `${policy.name} v${policy.version}`
  const warnings = policyWarnings({
    returnWindowDays: policy.return_window_days,
    manualReviewAboveMinor: policy.manual_review_above_minor,
    clauses: policy.clauses.map((clause) => ({
      clauseType: clause.clause_type,
      title: clause.title,
    })),
  })

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {policy.name}
            <Badge variant="outline">Version {policy.version}</Badge>
            <PolicyStatusBadge
              isActive={policy.is_active}
              publishedAt={policy.published_at}
            />
          </span>
        }
        description={
          policy.description ??
          (isDraft ? "Draft version." : "Published version.")
        }
        actions={
          canManage ? (
            <PolicyVersionActions
              policyId={policy.id}
              label={label}
              isDraft={isDraft}
              isActive={policy.is_active}
            />
          ) : null
        }
      />

      {isDraft ? null : (
        <Alert>
          <LockIcon />
          <AlertTitle>Published versions are read-only</AlertTitle>
          <AlertDescription>
            Investigations quote these clauses word for word, so the text never
            changes after publishing. Create a new version to make changes.
          </AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Gaps in this version</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="min-w-0 @4xl/main:self-start">
          <CardHeader>
            <CardTitle>Clauses</CardTitle>
            <CardDescription>
              Stable IDs that recommendations cite. Order is the order they were
              added.
            </CardDescription>
            {editable ? (
              <CardAction>
                <ClauseDialog policyId={policy.id} />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {policy.clauses.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ScrollTextIcon />
                  </EmptyMedia>
                  <EmptyTitle>No clauses yet</EmptyTitle>
                  <EmptyDescription>
                    Add the return window, refund conditions, exclusions,
                    evidence requirements, and review conditions.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ol className="flex flex-col divide-y rounded-lg border">
                {policy.clauses.map((clause) => (
                  <li
                    key={clause.id}
                    id={`clause-${clause.clause_key}`}
                    className="flex scroll-mt-24 flex-col gap-1.5 p-3 target:bg-info/10 target:ring-2 target:ring-ring target:ring-inset"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {clause.clause_key}
                      </Badge>
                      <span className="text-sm font-medium">
                        {clause.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {clauseTypeLabels[clause.clause_type]}
                      </span>
                      {editable ? (
                        <span className="ml-auto flex gap-1">
                          <ClauseDialog
                            policyId={policy.id}
                            clause={{
                              id: clause.id,
                              clauseKey: clause.clause_key,
                              title: clause.title,
                              clauseType: clause.clause_type,
                              content: clause.content,
                            }}
                          />
                          <DeleteClauseButton
                            policyId={policy.id}
                            clauseId={clause.id}
                            clauseKey={clause.clause_key}
                          />
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm whitespace-pre-line text-muted-foreground">
                      {clause.content}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="@container/card">
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>
                Structured rules the eligibility engine applies directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {editable ? (
                <PolicyDetailsForm
                  policyId={policy.id}
                  defaults={{
                    description: policy.description ?? "",
                    returnWindowDays:
                      policy.return_window_days === null
                        ? ""
                        : String(policy.return_window_days),
                    manualReviewAbove:
                      policy.manual_review_above_minor === null
                        ? ""
                        : toDecimalString(
                            policy.manual_review_above_minor,
                            currencyExponent(currency),
                          ),
                    effectiveFrom: policy.effective_from,
                    effectiveUntil: policy.effective_until ?? "",
                  }}
                />
              ) : (
                <FactList
                  facts={[
                    {
                      label: "Return window",
                      value:
                        policy.return_window_days === null
                          ? "Not set"
                          : `${policy.return_window_days} days`,
                    },
                    {
                      label: "Manual review above",
                      value:
                        policy.manual_review_above_minor === null
                          ? "Not set"
                          : formatMoney(
                              policy.manual_review_above_minor,
                              currency,
                            ),
                    },
                    {
                      label: "Effective from",
                      value: formatDate(policy.effective_from),
                    },
                    {
                      label: "Effective until",
                      value: policy.effective_until
                        ? formatDate(policy.effective_until)
                        : "No end date",
                    },
                    {
                      label: "Published",
                      value: policy.published_at
                        ? formatDateTime(policy.published_at)
                        : "Not yet",
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
              <CardDescription>
                Every published version is kept for the audit trail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1">
                {versions.map((version) => {
                  const current = version.id === policy.id
                  return (
                    <li key={version.id}>
                      <Link
                        href={`/policies/${version.id}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                          current && "bg-muted font-medium",
                        )}
                      >
                        Version {version.version}
                        <PolicyStatusBadge
                          isActive={version.is_active}
                          publishedAt={version.published_at}
                        />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
