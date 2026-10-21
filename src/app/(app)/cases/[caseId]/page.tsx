import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SparklesIcon } from "lucide-react"

import {
  PaymentFactsCard,
  RefundHistoryCard,
  RequestFactsCard,
} from "@/components/cases/case-facts"
import { CaseTimeline } from "@/components/cases/case-timeline"
import { EligibilityCard } from "@/components/investigations/eligibility-card"
import { InvestigationRunner } from "@/components/investigations/investigation-runner"
import { RecommendationView } from "@/components/investigations/recommendation-view"
import { PageContainer, PageHeader } from "@/components/page-header"
import { CaseStatusBadge, OriginBadge } from "@/components/status-badges"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getCaseDetail } from "@/lib/data/cases"
import { getInvestigationView } from "@/lib/data/investigations"
import { caseStatusMeta } from "@/lib/domain/labels"
import { integrationConfig } from "@/lib/env/server"
import { investigationUnavailableReason } from "@/lib/investigations/service"
import { can, requireMember } from "@/lib/security/auth"

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

  const [member, view] = await Promise.all([
    requireMember(),
    getInvestigationView(detail),
  ])

  const blockedReason = !can.investigate(member.role)
    ? "Your role can't run investigations."
    : !integrationConfig().anthropic
      ? "Claude isn't configured on the server yet, so investigations can't run."
      : investigationUnavailableReason(detail)

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
      />

      <div className="grid gap-4 @2xl/main:grid-cols-2 @5xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <RequestFactsCard detail={detail} />
          <PaymentFactsCard detail={detail} />
        </div>

        <InvestigationRunner
          caseId={detail.id}
          hasInvestigation={view.latest !== null}
          blockedReason={blockedReason}
          className="@container/card min-w-0 @2xl/main:order-last @2xl/main:col-span-2 @5xl/main:order-none @5xl/main:col-span-1"
        >
          {view.latest ? (
            <RecommendationView
              record={view.latest}
              stale={view.stale}
              earlier={view.earlier}
              caseCurrency={detail.currency_code}
            />
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SparklesIcon />
                </EmptyMedia>
                <EmptyTitle>No investigation yet</EmptyTitle>
                <EmptyDescription>
                  Claude reads the request, order, refund history, and active
                  policy, then recommends an action with cited clauses. Nothing
                  is refunded automatically.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {view.unreadable > 0 ? (
            <p className="text-xs text-muted-foreground">
              {view.unreadable} earlier investigation
              {view.unreadable === 1 ? " uses" : "s use"} an older format and
              {view.unreadable === 1 ? " is" : " are"} not shown.
            </p>
          ) : null}
        </InvestigationRunner>

        <div className="flex min-w-0 flex-col gap-4">
          <EligibilityCard result={view.current} />
          <RefundHistoryCard detail={detail} />
        </div>
      </div>

      <CaseTimeline events={detail.audit_events} />
    </PageContainer>
  )
}
