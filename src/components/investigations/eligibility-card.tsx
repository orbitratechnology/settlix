import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  CircleXIcon,
  ScaleIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { FactList } from "@/components/fact-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { eligibilityOutcomeMeta } from "@/lib/domain/labels"
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
}: {
  result: EligibilityResult | null
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
          <EligibilityDetails result={result} />
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

function EligibilityDetails({ result }: { result: EligibilityResult }) {
  const outcome = eligibilityOutcomeMeta[result.outcome]
  const { amounts } = result
  const money = (minor: number) => formatMoney(minor, amounts.currencyCode)
  const eligible = result.outcome === "eligible_for_approval"
  const flagged = result.checks.filter(
    (check) => check.status === "fail" || check.status === "warning",
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Badge variant={outcome.tone}>{outcome.label}</Badge>
        <p className="text-sm">{result.summary}</p>
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
          {
            label: "Refund amount (server-checked)",
            value:
              amounts.proposedMinor === null ? (
                <span className="text-muted-foreground">None proposed</span>
              ) : (
                money(amounts.proposedMinor)
              ),
          },
        ]}
      />

      <Separator />

      {flagged.length > 0 ? (
        <CheckList checks={flagged} />
      ) : (
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

      {eligible ? (
        <div className="flex flex-col gap-2">
          <Button disabled>Approve and issue refund</Button>
          <p className="text-xs text-muted-foreground">
            Refund approval and PayPal execution are enabled in the next build
            phase. Nothing has been refunded.
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
