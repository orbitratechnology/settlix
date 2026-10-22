import Link from "next/link"
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  CircleXIcon,
  ReceiptTextIcon,
  ScaleIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  ApproveRefundDialog,
  type ApprovalDetails,
} from "@/components/refunds/approve-refund-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  caseStatusMeta,
  eligibilityOutcomeMeta,
  type CaseStatus,
} from "@/lib/domain/labels"
import { formatMoney } from "@/lib/money/amounts"
import type {
  CheckStatus,
  EligibilityCheck,
  EligibilityResult,
} from "@/lib/policy/eligibility"
import { cn } from "@/lib/utils"

const statusDisplay: Record<
  CheckStatus,
  { icon: typeof CircleCheckIcon; label: string; className: string }
> = {
  pass: { icon: CircleCheckIcon, label: "Passed", className: "text-success" },
  fail: {
    icon: CircleXIcon,
    label: "Stops the refund",
    className: "text-destructive",
  },
  warning: {
    icon: TriangleAlertIcon,
    label: "Worth a look",
    className: "text-warning-foreground dark:text-warning",
  },
  not_applicable: {
    icon: CircleMinusIcon,
    label: "Not applicable",
    className: "text-muted-foreground",
  },
}

const outcomeTone: Record<
  EligibilityResult["outcome"],
  { panel: string; text: string }
> = {
  eligible_for_approval: {
    panel: "bg-success/10",
    text: "text-success",
  },
  requires_evidence: {
    panel: "bg-warning/20",
    text: "text-warning-foreground dark:text-warning",
  },
  requires_review: {
    panel: "bg-warning/20",
    text: "text-warning-foreground dark:text-warning",
  },
  not_eligible: { panel: "bg-muted", text: "text-foreground" },
  blocked_by_payment_state: {
    panel: "bg-destructive/10",
    text: "text-destructive",
  },
}

/**
 * "Your decision": the deterministic checks (FR-08) for the latest
 * suggestion, re-run against current records on every load, and the one
 * action they allow. Claude can't override a failed check.
 */
export function EligibilityCard({
  result,
  approval,
  approvalUnavailable,
  decided,
}: {
  result: EligibilityResult | null
  /** Present only when the signed-in member can approve this case now. */
  approval: ApprovalDetails | null
  /** Why an eligible case can't be approved by this member right now. */
  approvalUnavailable: string | null
  /** Set once a refund was approved: the checks then only block repeats. */
  decided: { caseId: string; status: CaseStatus } | null
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-xl">Your decision</CardTitle>
        <CardDescription>
          Settlix&apos;s own safety checks. Claude can&apos;t override them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result ? (
          <EligibilityDetails
            result={result}
            approval={approval}
            approvalUnavailable={approvalUnavailable}
            decided={decided}
          />
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScaleIcon />
              </EmptyMedia>
              <EmptyTitle>Not checked yet</EmptyTitle>
              <EmptyDescription>
                Use “Check this request” below. Once Claude has read it, Settlix
                runs its safety checks and shows what you can do.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

function EligibilityDetails({
  result,
  approval,
  approvalUnavailable,
  decided,
}: {
  result: EligibilityResult
  approval: ApprovalDetails | null
  approvalUnavailable: string | null
  decided: { caseId: string; status: CaseStatus } | null
}) {
  const outcome = eligibilityOutcomeMeta[result.outcome]
  const tone = outcomeTone[result.outcome]
  const decision = decided ? caseStatusMeta[decided.status] : null
  const { amounts } = result
  const money = (minor: number) => formatMoney(minor, amounts.currencyCode)
  const eligible = result.outcome === "eligible_for_approval"
  const passed = result.checks.filter((check) => check.status === "pass")
  // After a decision every check that fails only blocks a repeat refund, so
  // listing them as problems would misread a resolved case.
  const flagged = decided
    ? []
    : result.checks.filter(
        (check) => check.status === "fail" || check.status === "warning",
      )

  return (
    <div className="flex flex-col gap-5">
      {decision ? (
        <div className="flex flex-col gap-1.5 rounded-xl bg-muted px-4 py-4">
          <span className="text-lg font-semibold">{decision.label}</span>
          <p className="text-[0.9375rem]">
            {decision.description} Settlix won&apos;t send another refund for
            this request.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rounded-xl px-4 py-4",
            tone.panel,
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className={cn("text-lg font-semibold", tone.text)}>
              {outcome.label}
            </span>
            <p className="max-w-[48ch] text-[0.9375rem]">{result.summary}</p>
          </div>
          {eligible && amounts.proposedMinor !== null ? (
            <div className="flex flex-col items-start @md/card:items-end">
              <span className="text-3xl font-bold tracking-tight">
                {money(amounts.proposedMinor)}
              </span>
              <span className="text-sm text-muted-foreground">
                of {money(amounts.remainingMinor)} left to refund
              </span>
            </div>
          ) : null}
        </div>
      )}

      {decided ? (
        <Link
          href={`/receipts/${decided.caseId}`}
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          <ReceiptTextIcon data-icon="inline-start" />
          Open receipt
        </Link>
      ) : eligible && approval ? (
        <div className="flex flex-col gap-2">
          <ApproveRefundDialog details={approval} />
          <p className="text-sm text-muted-foreground">
            Nothing is sent to PayPal until you confirm in the next step.
          </p>
        </div>
      ) : eligible ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" disabled>
            Approve and issue refund
          </Button>
          <p className="text-sm text-muted-foreground">
            {approvalUnavailable ?? "Approval isn't available right now."}
          </p>
        </div>
      ) : (
        <p className="text-[0.9375rem] text-muted-foreground">
          There is no refund to approve. Use “More actions” at the top to ask
          the customer for information, send it for review, or decline it.
        </p>
      )}

      {flagged.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">What needs attention</h3>
          <CheckList checks={flagged} />
        </div>
      ) : null}

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="group -ml-3 h-auto w-fit justify-start gap-3 py-2"
            />
          }
        >
          <span className="flex -space-x-1" aria-hidden>
            {passed.slice(0, 4).map((check) => (
              <CircleCheckIcon
                key={check.key}
                className="size-5 rounded-full bg-card text-success"
              />
            ))}
          </span>
          <span className="text-[0.9375rem] font-medium">
            {passed.length} of {result.checks.length} checks passed
          </span>
          <ChevronDownIcon
            data-icon="inline-end"
            className="transition-transform group-data-[panel-open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <CheckList checks={result.checks} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function CheckList({ checks }: { checks: EligibilityCheck[] }) {
  return (
    <ul className="flex flex-col gap-3.5">
      {checks.map((check) => {
        const display = statusDisplay[check.status]
        const Icon = display.icon
        return (
          <li key={check.key} className="flex gap-3">
            <Icon
              aria-hidden
              className={cn("mt-0.5 size-5 shrink-0", display.className)}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[0.9375rem] font-semibold">
                  {check.label}
                </span>
                <span className={cn("text-sm", display.className)}>
                  {display.label}
                </span>
              </span>
              <span className="text-[0.9375rem] text-muted-foreground">
                {check.detail}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
