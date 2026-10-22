import { CheckIcon, MinusIcon } from "lucide-react"

import {
  customerStages,
  type CustomerStatus,
} from "@/lib/intake/customer-status"
import { cn } from "@/lib/utils"

type StepState = "done" | "current" | "attention" | "skipped" | "todo"

function stepStates(view: CustomerStatus): StepState[] {
  const index = customerStages.findIndex((step) => step.stage === view.stage)
  return customerStages.map((_, position) => {
    if (view.stage === "refunded") return "done"
    if (view.tone === "closed") return position <= index ? "done" : "skipped"
    if (position < index) return "done"
    if (position === index) return view.tone === "attention" ? "attention" : "current"
    return "todo"
  })
}

const markers: Record<StepState, string> = {
  done: "border-success bg-success text-success-foreground",
  current: "border-primary bg-primary text-primary-foreground",
  attention: "border-warning bg-warning text-warning-foreground",
  skipped: "border-border bg-muted text-muted-foreground",
  todo: "border-border bg-background text-muted-foreground",
}

const words: Record<StepState, string> = {
  done: "done",
  current: "current step",
  attention: "waiting for you",
  skipped: "skipped",
  todo: "not yet",
}

/** Received → being reviewed → decision → refunded, as the customer sees it. */
export function CustomerTracker({ view }: { view: CustomerStatus }) {
  const states = stepStates(view)
  return (
    <ol aria-label="Progress" className="grid grid-cols-4 gap-2">
      {customerStages.map((step, index) => {
        const state = states[index]
        return (
          <li key={step.stage} className="relative flex flex-col gap-2">
            {index < customerStages.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 left-9 h-0.5 w-[calc(100%-2.25rem+0.5rem)] rounded-full",
                  state === "done" ? "bg-success" : "bg-border",
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold",
                markers[state],
              )}
            >
              {state === "done" ? (
                <CheckIcon className="size-4" strokeWidth={3} />
              ) : state === "skipped" ? (
                <MinusIcon className="size-4" strokeWidth={3} />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                "text-sm leading-tight font-semibold sm:text-base",
                (state === "todo" || state === "skipped") &&
                  "text-muted-foreground",
              )}
            >
              {step.label}
              <span className="sr-only">, {words[state]}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
