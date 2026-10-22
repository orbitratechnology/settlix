"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BadgeCheckIcon,
  CircleAlertIcon,
  ClockIcon,
  ReceiptTextIcon,
  ShieldAlertIcon,
} from "lucide-react"

import { FactList } from "@/components/fact-list"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { RefundResult } from "@/lib/refunds/service"

export type ApprovalDetails = {
  caseId: string
  caseNumber: string
  orderReference: string
  captureId: string
  investigationId: string
  amountMinor: number
  currencyCode: string
  /** Pre-formatted on the server so the dialog shows the exact same values. */
  amount: string
  captured: string
  refundedBefore: string
  remainingAfter: string
  citations: string[]
  explanation: string
}

type ResultDisplay = {
  title: string
  icon: typeof BadgeCheckIcon
  destructive: boolean
}

const resultDisplay: Record<
  Exclude<RefundResult["status"], "blocked">,
  ResultDisplay
> = {
  completed: {
    title: "Refund completed",
    icon: BadgeCheckIcon,
    destructive: false,
  },
  pending: {
    title: "Refund in progress at PayPal",
    icon: ClockIcon,
    destructive: false,
  },
  failed: { title: "Refund failed", icon: CircleAlertIcon, destructive: true },
  recovery_required: {
    title: "Status unknown: check with PayPal",
    icon: ShieldAlertIcon,
    destructive: true,
  },
}

function displayFor(result: RefundResult): ResultDisplay {
  if (result.status !== "blocked") return resultDisplay[result.status]
  // A duplicate request reports the refund that already exists.
  if (result.code === "already_refunded") {
    return {
      title: "Already refunded",
      icon: BadgeCheckIcon,
      destructive: false,
    }
  }
  if (result.code === "in_progress") {
    return {
      title: "Refund already in progress",
      icon: ClockIcon,
      destructive: false,
    }
  }
  return {
    title: "Refund not issued",
    icon: CircleAlertIcon,
    destructive: true,
  }
}

/**
 * FR-09 explicit approval. Shows what will happen to the money, sends only a
 * confirmation the server re-checks, and reports PayPal's actual result.
 */
export function ApproveRefundDialog({ details }: { details: ApprovalDetails }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<RefundResult | null>(null)
  // Blocks a second submit before the disabled state renders (double click).
  const inFlight = useRef(false)

  function approve() {
    if (inFlight.current) return
    inFlight.current = true
    startTransition(async () => {
      let next: RefundResult
      try {
        const response = await fetch(
          `/api/cases/${details.caseId}/approve-and-refund`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              investigationId: details.investigationId,
              amountMinor: details.amountMinor,
              currencyCode: details.currencyCode,
            }),
          },
        )
        const body: unknown = await response.json().catch(() => null)
        next =
          body && typeof body === "object" && "status" in body
            ? (body as RefundResult)
            : {
                status: "blocked",
                code: "unavailable",
                message:
                  "Settlix couldn't confirm what happened. Refresh the case before trying again.",
              }
      } catch {
        next = {
          status: "blocked",
          code: "unavailable",
          message:
            "Settlix couldn't be reached. Refresh the case to see whether the refund started before trying again.",
        }
      }
      // The page refreshes when the dialog closes: refreshing now would
      // unmount this dialog (the case is no longer approvable) and hide the
      // result.
      setResult(next)
      inFlight.current = false
    })
  }

  const display = result ? displayFor(result) : null
  const Icon = display?.icon

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next && result) {
          setResult(null)
          router.refresh()
        }
      }}
    >
      <AlertDialogTrigger render={<Button size="lg" className="w-full" />}>
        Approve and issue refund
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">
            Refund {details.amount} to the customer?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Settlix checks everything once more, saves your approval, and then
            asks PayPal to send the money back. A completed refund can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="@container/card flex flex-col gap-4">
          <FactList
            facts={[
              { label: "Request", value: details.caseNumber },
              { label: "Order", value: details.orderReference },
              { label: "Customer paid", value: details.captured },
              { label: "Already refunded", value: details.refundedBefore },
              {
                label: "This refund",
                value: (
                  <span className="text-lg font-bold">
                    {details.amount} {details.currencyCode}
                  </span>
                ),
              },
              { label: "Left after this", value: details.remainingAfter },
            ]}
          />
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Why</span>
            <span className="flex flex-wrap gap-1">
              {details.citations.map((key) => (
                <Badge key={key} variant="outline">
                  Rule {key}
                </Badge>
              ))}
              <Badge variant="success">Every check passed</Badge>
            </span>
            <p className="line-clamp-4 text-muted-foreground">
              {details.explanation}
            </p>
          </div>
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            This is the PayPal Sandbox: a real request with test money. You see
            exactly what PayPal answers.
          </p>
          {result && display && Icon ? (
            <Alert variant={display.destructive ? "destructive" : "default"}>
              <Icon />
              <AlertTitle>{display.title}</AlertTitle>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <AlertDialogFooter>
          {result ? (
            <>
              <AlertDialogCancel>Close</AlertDialogCancel>
              {result.status !== "blocked" || result.existing ? (
                <Link
                  href={`/receipts/${details.caseId}`}
                  className={buttonVariants()}
                >
                  <ReceiptTextIcon data-icon="inline-start" />
                  Open receipt
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button onClick={approve} disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                {pending ? "Sending to PayPal…" : "Approve and issue refund"}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
