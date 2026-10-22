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
import { CaseProgress } from "@/components/cases/case-progress"
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
  title: "Refund request",
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
    ? "Your role can't run checks. Ask an owner, admin, or reviewer."
    : !integrationConfig().anthropic
      ? "Claude isn't set up on the server yet, so requests can't be checked."
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

  const amountAsked =
    detail.requested_amount_minor === null
      ? null
      : formatMoney(detail.requested_amount_minor, detail.currency_code)

  const claudeCard = (
    <InvestigationRunner
      caseId={detail.id}
      hasInvestigation={view.latest !== null}
      blockedReason={blockedReason}
      className="@container/card min-w-0"
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
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SparklesIcon />
            </EmptyMedia>
            <EmptyTitle>Not checked yet</EmptyTitle>
            <EmptyDescription>
              Claude reads the request, the order, earlier refunds, and your
              return policy, then suggests what to do and quotes the rules it
              used. Nothing is refunded automatically.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {view.unreadable > 0 ? (
        <p className="text-sm text-muted-foreground">
          {view.unreadable} earlier check
          {view.unreadable === 1 ? " uses" : "s use"} an older format and
          {view.unreadable === 1 ? " is" : " are"} not shown.
        </p>
      ) : null}
    </InvestigationRunner>
  )

  const decisionCard = (
    <EligibilityCard
      result={view.current}
      approval={approval}
      approvalUnavailable={approvalUnavailable}
      decided={decided ? { caseId: detail.id, status: detail.status } : null}
    />
  )

  return (
    <PageContainer>
      <PageHeader
        title={`${detail.customer_display_name} asked for ${amountAsked ?? "a refund"}`}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span data-testid="case-status" className="contents">
              <CaseStatusBadge status={detail.status} />
            </span>
            <OriginBadge origin={detail.origin} />
            <span>
              {detail.order.description}.{" "}
              <span className="whitespace-nowrap">
                Request {detail.case_number}.
              </span>
            </span>
          </span>
        }
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
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <ReceiptTextIcon data-icon="inline-start" />
              Receipt
            </Link>
          </>
        }
      />

      <CaseProgress status={detail.status} />

      <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Before the first check, the check itself is the next step. */}
          {view.latest ? (
            <>
              {decisionCard}
              {claudeCard}
            </>
          ) : (
            <>
              {claudeCard}
              {decisionCard}
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <RequestFactsCard detail={detail} />
          <PaymentFactsCard detail={detail} />
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
        "Only reviewers, admins, and owners can approve refunds. Ask one of them to approve it.",
    }
  }
  if (
    detail.status !== "READY_FOR_APPROVAL" ||
    !detail.order.paypal_capture_id
  ) {
    return {
      approval: null,
      approvalUnavailable: `This request is “${caseStatusMeta[detail.status].label}”. Check it again to make it ready to approve.`,
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
