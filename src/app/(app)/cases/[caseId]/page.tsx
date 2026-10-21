import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ScaleIcon, SparklesIcon } from "lucide-react"

import {
  PaymentFactsCard,
  RefundHistoryCard,
  RequestFactsCard,
} from "@/components/cases/case-facts"
import { CaseTimeline } from "@/components/cases/case-timeline"
import { PageContainer, PageHeader } from "@/components/page-header"
import { CaseStatusBadge, OriginBadge } from "@/components/status-badges"
import { Button } from "@/components/ui/button"
import {
  Card,
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
import { getCaseDetail } from "@/lib/data/cases"
import { caseStatusMeta } from "@/lib/domain/labels"

export const metadata: Metadata = {
  title: "Case",
}

export default async function CasePage({
  params,
}: PageProps<"/cases/[caseId]">) {
  const { caseId } = await params
  const detail = await getCaseDetail(caseId)
  // Unknown IDs and other merchants' cases look identical: not found.
  if (!detail) notFound()

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {detail.case_number}
            <CaseStatusBadge status={detail.status} />
            <OriginBadge origin={detail.origin} />
          </span>
        }
        description={caseStatusMeta[detail.status].description}
        actions={
          <>
            <Button variant="outline" disabled>
              Request evidence
            </Button>
            <Button disabled>
              <SparklesIcon data-icon="inline-start" />
              Start investigation
            </Button>
          </>
        }
      />

      <div className="grid gap-4 @2xl/main:grid-cols-2 @5xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <RequestFactsCard detail={detail} />
          <PaymentFactsCard detail={detail} />
        </div>

        <Card className="@2xl/main:order-last @2xl/main:col-span-2 @5xl/main:order-none @5xl/main:col-span-1">
          <CardHeader>
            <CardTitle>AI investigation</CardTitle>
            <CardDescription>
              Summary, cited policy clauses, evidence, and the proposed
              resolution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SparklesIcon />
                </EmptyMedia>
                <EmptyTitle>No investigation yet</EmptyTitle>
                <EmptyDescription>
                  Claude investigations are added in the next build phase. No
                  recommendation has been generated for this case.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Checks &amp; action</CardTitle>
              <CardDescription>
                Deterministic eligibility, refundable balance, and approval.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ScaleIcon />
                  </EmptyMedia>
                  <EmptyTitle>No checks run</EmptyTitle>
                  <EmptyDescription>
                    Eligibility checks run after an investigation. No refund
                    action is available.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
          <RefundHistoryCard detail={detail} />
        </div>
      </div>

      <CaseTimeline events={detail.audit_events} />
    </PageContainer>
  )
}
