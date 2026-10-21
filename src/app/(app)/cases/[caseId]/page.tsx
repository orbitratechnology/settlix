import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ReceiptTextIcon, SparklesIcon } from "lucide-react"

import { CaseActions } from "@/components/cases/case-actions"
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
import type { ApprovalDetails } from "@/components/refunds/approve-refund-dialog"
import { CaseStatusBadge, OriginBadge } from "@/components/status-badges"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { caseActionAllowed } from "@/lib/cases/actions"
import { getCaseDetail, type CaseDetail } from "@/lib/data/cases"
import {
  getInvestigationView,
  type InvestigationView,
} from "@/lib/data/investigations"
import { caseStatusMeta } from "@/lib/domain/labels"
import { integrationConfig } from "@/lib/env/server"
import { LOCKED_CASE_STATUSES } from "@/lib/investigations/context"
import { investigationUnavailableReason } from "@/lib/investigations/service"
import { formatMoney } from "@/lib/money/amounts"
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

  const decided = LOCKED_CASE_STATUSES.has(detail.status)
  const { approval, approvalUnavailable } = approvalFor(
    detail,
    view,
    can.approveRefunds(member.role),
  )
  const allowed = {
    note: caseActionAllowed("note", detail.status, member.role),
    requestEvidence: caseActionAllowed(
      "requestEvidence",
      detail.status,
      member.role,
    ),
    sendToReview: caseActionAllowed("sendToReview", detail.status, member.role),
    decline: caseActionAllowed("decline", detail.status, member.role),
  }

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
            <CaseActions
              caseId={detail.id}
              allowed={allowed}
              missingEvidence={
                view.latest?.stored.recommendation.evidenceMissing ?? []
              }
            />
            <Link
              href={`/receipts/${detail.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <ReceiptTextIcon data-icon="inline-start" />
              Receipt
            </Link>
          </>
        }
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
              decided={decided}
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
          <EligibilityCard
            result={view.current}
            approval={approval}
            approvalUnavailable={approvalUnavailable}
            decided={
              decided ? { caseId: detail.id, status: detail.status } : null
            }
          />
          <RefundHistoryCard
            detail={detail}
            canReconcile={can.approveRefunds(member.role)}
          />
        </div>
      </div>

      <CaseTimeline events={detail.audit_events} />
    </PageContainer>
  )
}

/** Approval details for the confirmation dialog, computed from server records. */
function approvalFor(
  detail: CaseDetail,
  view: InvestigationView,
  canApprove: boolean,
): {
  approval: ApprovalDetails | null
  approvalUnavailable: string | null
} {
  const current = view.current
  if (
    !view.latest ||
    !current ||
    current.outcome !== "eligible_for_approval" ||
    current.approvableAmountMinor === null
  ) {
    return { approval: null, approvalUnavailable: null }
  }
  if (!canApprove) {
    return {
      approval: null,
      approvalUnavailable:
        "Only reviewers, admins, and owners can approve refunds.",
    }
  }
  if (
    detail.status !== "READY_FOR_APPROVAL" ||
    !detail.order.paypal_capture_id
  ) {
    return {
      approval: null,
      approvalUnavailable: `The case is "${caseStatusMeta[detail.status].label}". Re-run the investigation to make it ready for approval.`,
    }
  }

  const { amounts } = current
  const amountMinor = current.approvableAmountMinor
  const money = (minor: number) => formatMoney(minor, amounts.currencyCode)
  return {
    approvalUnavailable: null,
    approval: {
      caseId: detail.id,
      caseNumber: detail.case_number,
      orderReference: detail.order.external_order_reference,
      captureId: detail.order.paypal_capture_id,
      investigationId: view.latest.id,
      amountMinor,
      currencyCode: amounts.currencyCode,
      amount: money(amountMinor),
      captured: money(amounts.capturedMinor),
      refundedBefore: money(amounts.confirmedRefundedMinor),
      remainingAfter: money(amounts.remainingMinor - amountMinor),
      citations: [
        ...new Set(
          view.latest.stored.citations
            .filter((citation) => citation.valid)
            .map((citation) => citation.clauseKey),
        ),
      ],
      explanation: view.latest.stored.recommendation.explanation,
    },
  }
}
