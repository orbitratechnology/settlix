import { Suspense } from "react"
import type { Metadata } from "next"
import { PlusIcon, ScrollTextIcon } from "lucide-react"

import { FactList } from "@/components/fact-list"
import { PageContainer, PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { clauseTypeLabels } from "@/lib/domain/labels"
import { formatDate } from "@/lib/format"

export const metadata: Metadata = {
  title: "Policies",
}

export default function PoliciesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Return policies"
        description="Versioned policies with stable clause IDs that investigations cite as evidence."
        actions={
          <Button disabled>
            <PlusIcon data-icon="inline-start" />
            New policy version
          </Button>
        }
      />
      <Suspense fallback={<PoliciesSkeleton />}>
        <PolicyList />
      </Suspense>
    </PageContainer>
  )
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
            Add a return policy with its clauses so investigations can cite it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {policies.map((policy) => (
        <PolicyCard key={policy.id} policy={policy} />
      ))}
    </div>
  )
}

function PolicyCard({ policy }: { policy: PolicyWithClauses }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {policy.name}
          <Badge variant="outline">Version {policy.version}</Badge>
        </CardTitle>
        {policy.description ? (
          <CardDescription>{policy.description}</CardDescription>
        ) : null}
        <CardAction>
          {policy.is_active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FactList
          className="@3xl/card:grid-cols-3"
          facts={[
            {
              label: "Return window",
              value:
                policy.return_window_days === null
                  ? "Not set"
                  : `${policy.return_window_days} days`,
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
          ]}
        />
        <ol className="flex flex-col divide-y rounded-lg border">
          {policy.clauses.map((clause) => (
            <li
              key={clause.id}
              id={`clause-${policy.id}-${clause.clause_key}`}
              className="flex flex-col gap-1.5 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  {clause.clause_key}
                </Badge>
                <span className="text-sm font-medium">{clause.title}</span>
                <span className="text-xs text-muted-foreground">
                  {clauseTypeLabels[clause.clause_type]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{clause.content}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function PoliciesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}
