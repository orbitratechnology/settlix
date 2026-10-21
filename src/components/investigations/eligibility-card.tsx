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

import { FactList } from "@/components/fact-list"
import {
  ApproveRefundDialog,
  type ApprovalDetails,
} from "@/components/refunds/approve-refund-dialog"
import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
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
    label: "Blocks approval",
    className: "text-destructive",
  },
  warning: {
    icon: TriangleAlertIcon,
    label: "Note",
    className: "text-warning",
  },
  not_applicable: {
    icon: CircleMinusIcon,
    label: "Not applicable",
    className: "text-muted-foreground",
  },
}

/**
 * Deterministic eligibility (FR-08) for the latest recommendation, re-checked
 * against the current records on every page load.
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
        <CardTitle>Checks &amp; action</CardTitle>
        <CardDescription>
          Rules applied by Settlix, independent of the AI. The AI can&apos;t
          override a failed check.
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
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScaleIcon />
              </EmptyMedia>
              <EmptyTitle>No checks run</EmptyTitle>
              <EmptyDescription>
                Eligibility is checked after an investigation. No refund action
                is available.
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
  const decision = decided ? caseStatusMeta[decided.status] : null
  const { amounts } = result
  const money = (minor: number) => formatMoney(minor, amounts.currencyCode)
  const eligible = result.outcome === "eligible_for_approval"
  // After a decision every check that fails only blocks a repeat refund, so
  // listing them as problems would misread a resolved case.
  const flagged = decided
    ? []
    : result.checks.filter(
        (check) => check.status === "fail" || check.status === "warning",
      )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {decision ? (
          <>
            <Badge variant={decision.tone}>{decision.label}</Badge>
            <p className="text-sm">
              {decision.description} Settlix blocks any further refund for this
              case.
            </p>
          </>
        ) : (
          <>
            <Badge variant={outcome.tone}>{outcome.label}</Badge>
            <p className="text-sm">{result.summary}</p>
          </>
        )}
      </div>

      <FactList
        facts={[
          { label: "Captured", value: money(amounts.capturedMinor) },
          {
            label: "Refunded (confirmed)",
            value: money(amounts.confirmedRefundedMinor),
          },
          ...(amounts.unresolvedMinor > 0
            ? [
                {
                  label: "Refunds in progress",
                  value: money(amounts.unresolvedMinor),
                },
              ]
            : []),
          { label: "Refundable now", value: money(amounts.remainingMinor) },
          {
            label: "Requested",
            value:
              amounts.requestedMinor === null
                ? "Not stated"
                : money(amounts.requestedMinor),
          },
          ...(decided
            ? []
            : [
                {
                  label: "Refund amount (server-checked)",
                  value:
                    amounts.proposedMinor === null ? (
                      <span className="text-muted-foreground">
                        None proposed
                      </span>
                    ) : (
                      money(amounts.proposedMinor)
                    ),
                },
              ]),
        ]}
      />

      <Separator />

      {flagged.length > 0 ? (
        <CheckList checks={flagged} />
      ) : decided ? null : (
        <p className="text-sm text-muted-foreground">Every check passed.</p>
      )}

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button variant="ghost" size="sm" className="group -ml-2 w-fit" />
          }
        >
          All {result.checks.length} checks
          <ChevronDownIcon
            data-icon="inline-end"
            className="transition-transform group-data-[panel-open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <CheckList checks={result.checks} />
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {decided ? (
        <Link
          href={`/receipts/${decided.caseId}`}
          className={buttonVariants({
            variant: "outline",
            className: "w-full",
          })}
        >
          <ReceiptTextIcon data-icon="inline-start" />
          Open receipt
        </Link>
      ) : eligible && approval ? (
        <div className="flex flex-col gap-2">
          <ApproveRefundDialog details={approval} />
          <p className="text-xs text-muted-foreground">
            Your approval is recorded with the amount before PayPal is called.
            Nothing is refunded until you confirm.
          </p>
        </div>
      ) : eligible ? (
        <div className="flex flex-col gap-2">
          <Button disabled>Approve and issue refund</Button>
          <p className="text-xs text-muted-foreground">
            {approvalUnavailable ?? "Approval isn't available right now."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No refund action is available for this case.
        </p>
      )}
    </div>
  )
}

function CheckList({ checks }: { checks: EligibilityCheck[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {checks.map((check) => {
        const display = statusDisplay[check.status]
        const Icon = display.icon
        return (
          <li key={check.key} className="flex gap-2.5 text-sm">
            <Icon
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0", display.className)}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{check.label}</span>
                <span className={cn("text-xs", display.className)}>
                  {display.label}
                </span>
              </span>
              <span className="text-muted-foreground">{check.detail}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
