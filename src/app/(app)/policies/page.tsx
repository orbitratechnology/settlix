import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import {
  ChevronRightIcon,
  ScrollTextIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { NewPolicyDialog } from "@/components/policies/policy-forms"
import { PageContainer, PageHeader } from "@/components/page-header"
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
import { Skeleton } from "@/components/ui/skeleton"
import { listPolicies, type PolicyWithClauses } from "@/lib/data/policies"
import { formatDate } from "@/lib/format"
import { activePolicyWarnings } from "@/lib/policy/warnings"
import { can, requireMember } from "@/lib/security/auth"

export const metadata: Metadata = {
  title: "Policies",
}

export default function PoliciesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Return policies"
        description="The rules Claude checks every request against. A published version never changes; make a new version to update it."
        actions={
          <Suspense fallback={null}>
            <NewPolicyAction />
          </Suspense>
        }
      />
      <Suspense fallback={<PoliciesSkeleton />}>
        <PolicyList />
      </Suspense>
    </PageContainer>
  )
}

async function NewPolicyAction() {
  const member = await requireMember()
  if (!can.managePolicies(member.role)) return null
  return <NewPolicyDialog today={new Date().toISOString().slice(0, 10)} />
}

async function PolicyList() {
  const policies = await listPolicies()

  if (policies.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollTextIcon />
          </EmptyMedia>
          <EmptyTitle>No policies yet</EmptyTitle>
          <EmptyDescription>
            Add your return policy and its rules so Claude can check requests
            against them. Until then, a person reviews every request.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const groups = Map.groupBy(policies, (policy) => policy.name)
  const warnings = activePolicyWarnings(
    policies
      .filter((policy) => policy.is_active)
      .map((policy) => ({
        name: policy.name,
        returnWindowDays: policy.return_window_days,
      })),
  )

  return (
    <div className="flex flex-col gap-4">
      {warnings.map((warning) => (
        <Alert key={warning}>
          <TriangleAlertIcon />
          <AlertTitle>Check your active policies</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}
      {[...groups.entries()].map(([name, versions]) => (
        <PolicyGroupCard key={name} name={name} versions={versions} />
      ))}
    </div>
  )
}

function PolicyGroupCard({
  name,
  versions,
}: {
  name: string
  versions: PolicyWithClauses[]
}) {
  const active = versions.find((version) => version.is_active)
  const summary = active ?? versions[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        {summary.description ? (
          <CardDescription>{summary.description}</CardDescription>
        ) : null}
        <CardAction>
          {active ? (
            <Badge variant="success">Active: v{active.version}</Badge>
          ) : (
            <Badge variant="secondary">No active version</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-lg border">
          {versions.map((version) => (
            <li key={version.id}>
              <Link
                href={`/policies/${version.id}`}
                className="flex items-center gap-3 p-3 text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      Version {version.version}
                    </span>
                    <PolicyStatusBadge
                      isActive={version.is_active}
                      publishedAt={version.published_at}
                    />
                  </span>
                  <span className="text-muted-foreground">
                    {version.clauses.length} clause
                    {version.clauses.length === 1 ? "" : "s"}
                    {" · "}
                    {version.return_window_days === null
                      ? "no return window"
                      : `${version.return_window_days}-day window`}
                    {" · effective "}
                    {formatDate(version.effective_from)}
                    {version.effective_until
                      ? ` to ${formatDate(version.effective_until)}`
                      : ""}
                  </span>
                </div>
                <ChevronRightIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function PoliciesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}
