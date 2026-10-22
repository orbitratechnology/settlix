import { CheckIcon, MinusIcon, XIcon } from "lucide-react"

import type { CaseStatus } from "@/lib/domain/labels"
import { cn } from "@/lib/utils"

type StepState =
  "done" | "current" | "attention" | "failed" | "skipped" | "todo"

type Step = { label: string; state: StepState; note?: string }

/** The four steps every request goes through, and where this one is. */
export function progressSteps(status: CaseStatus): Step[] {
  const received: Step = { label: "Request received", state: "done" }
  const steps = (checked: Step, decision: Step, refund: Step): Step[] => [
    received,
    checked,
    decision,
    refund,
  ]
  const todo = (label: string): Step => ({ label, state: "todo" })

  switch (status) {
    case "NEW":
      return steps(
        { label: "Checked", state: "current", note: "Not checked yet" },
        todo("Your decision"),
        todo("Refunded"),
      )
    case "INVESTIGATING":
      return steps(
        { label: "Checked", state: "current", note: "Claude is checking" },
        todo("Your decision"),
        todo("Refunded"),
      )
    case "NEEDS_EVIDENCE":
      return steps(
        { label: "Checked", state: "attention", note: "Waiting on customer" },
        todo("Your decision"),
        todo("Refunded"),
      )
    case "NEEDS_REVIEW":
      return steps(
        { label: "Checked", state: "done" },
        {
          label: "Your decision",
          state: "attention",
          note: "Needs your review",
        },
        todo("Refunded"),
      )
    case "READY_FOR_APPROVAL":
      return steps(
        { label: "Checked", state: "done" },
        { label: "Your decision", state: "current", note: "Ready to approve" },
        todo("Refunded"),
      )
    case "REFUND_PENDING":
      return steps(
        { label: "Checked", state: "done" },
        { label: "Your decision", state: "done", note: "Approved" },
        {
          label: "Refunded",
          state: "current",
          note: "PayPal is working on it",
        },
      )
    case "REFUNDED":
      return steps(
        { label: "Checked", state: "done" },
        { label: "Your decision", state: "done", note: "Approved" },
        { label: "Refunded", state: "done", note: "PayPal confirmed it" },
      )
    case "NOT_ELIGIBLE":
      return steps(
        { label: "Checked", state: "done" },
        { label: "Your decision", state: "done", note: "Closed, no refund" },
        { label: "Refunded", state: "skipped", note: "No refund" },
      )
    case "REFUND_FAILED":
      return steps(
        { label: "Checked", state: "done" },
        { label: "Your decision", state: "done", note: "Approved" },
        { label: "Refunded", state: "failed", note: "PayPal turned it down" },
      )
    case "RECOVERY_REQUIRED":
      return steps(
        { label: "Checked", state: "done" },
        { label: "Your decision", state: "done", note: "Approved" },
        { label: "Refunded", state: "attention", note: "Status unknown" },
      )
  }
}

const markers: Record<StepState, string> = {
  done: "border-success bg-success text-success-foreground",
  current: "border-primary bg-primary text-primary-foreground",
  attention: "border-warning bg-warning text-warning-foreground",
  failed: "border-destructive bg-destructive text-white dark:text-background",
  skipped: "border-border bg-muted text-muted-foreground",
  todo: "border-border bg-background text-muted-foreground",
}

const stateWords: Record<StepState, string> = {
  done: "done",
  current: "current step",
  attention: "needs attention",
  failed: "failed",
  skipped: "skipped",
  todo: "not started",
}

/** A four-step tracker: received, checked, your decision, refunded. */
export function CaseProgress({ status }: { status: CaseStatus }) {
  const steps = progressSteps(status)
  return (
    <ol
      aria-label="Progress"
      className="grid grid-cols-4 gap-2 rounded-2xl bg-muted/60 p-4 sm:gap-4 sm:p-5"
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        return (
          <li key={step.label} className="relative flex flex-col gap-2.5">
            {last ? null : (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 left-9 h-0.5 w-[calc(100%-2.25rem+0.5rem)] rounded-full sm:w-[calc(100%-2.25rem+1rem)]",
                  step.state === "done" ? "bg-success" : "bg-border",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                markers[step.state],
              )}
            >
              {step.state === "done" ? (
                <CheckIcon className="size-4" strokeWidth={3} />
              ) : step.state === "failed" ? (
                <XIcon className="size-4" strokeWidth={3} />
              ) : step.state === "skipped" ? (
                <MinusIcon className="size-4" strokeWidth={3} />
              ) : (
                index + 1
              )}
            </span>
            <span className="flex flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm leading-tight font-semibold sm:text-base",
                  step.state === "todo" && "text-muted-foreground",
                )}
              >
                {step.label}
                <span className="sr-only">, {stateWords[step.state]}</span>
              </span>
              {step.note ? (
                <span className="hidden text-sm text-muted-foreground sm:block">
                  {step.note}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
