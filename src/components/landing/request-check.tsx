"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

import { exampleRequests, usd, type ExampleRequest } from "./examples"

/** A tick or a cross that draws itself; replays whenever its row remounts. */
export function CheckGlyph({
  ok,
  delay = 0,
  className,
}: {
  ok: boolean
  delay?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={cn(
        "size-5 shrink-0",
        ok ? "text-success" : "text-warning-foreground dark:text-warning",
        className,
      )}
    >
      <circle
        cx="10"
        cy="10"
        r="9"
        className={ok ? "fill-success/12" : "fill-warning/25"}
      />
      <path
        d={ok ? "m6 10.5 2.6 2.6L14 7.5" : "M10 5.75v5.5m0 3v.01"}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={24}
        className="motion-safe:animate-draw"
        style={{ animationDelay: `${delay}ms` }}
      />
    </svg>
  )
}

function Decision({ request }: { request: ExampleRequest }) {
  const ready = request.decision.tone === "ready"
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl px-4 py-3 motion-safe:animate-rise",
        ready ? "bg-success/10" : "bg-warning/20",
      )}
      style={{ animationDelay: "80ms" }}
    >
      <div className="flex flex-col">
        <span
          className={cn(
            "text-sm font-semibold",
            ready
              ? "text-success"
              : "text-warning-foreground dark:text-warning",
          )}
        >
          {request.decision.label}
        </span>
        <span className="text-base font-medium">{request.decision.action}</span>
      </div>
      {request.decision.amountMinor !== null ? (
        <span className="text-2xl font-bold tracking-tight">
          {usd(request.decision.amountMinor)}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">
          No refund until you decide
        </span>
      )}
    </div>
  )
}

/**
 * The hero's working fragment: three example requests from the demo store,
 * each shown the way the case screen shows it. Choosing one replays the checks.
 */
export function RequestCheck({ className }: { className?: string }) {
  const [selectedId, setSelectedId] = useState(exampleRequests[0].id)
  const request =
    exampleRequests.find((r) => r.id === selectedId) ?? exampleRequests[0]

  return (
    <div
      data-ui
      className={cn(
        "flex flex-col gap-5 rounded-2xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-base font-semibold">Refund requests</p>
        <p className="text-sm text-muted-foreground">
          Examples from the demo store
        </p>
      </div>

      <div
        role="group"
        aria-label="Choose an example request"
        className="-mt-1 flex gap-2 overflow-x-auto pb-1"
      >
        {exampleRequests.map((item) => {
          const active = item.id === request.id
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(item.id)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full border pr-4 pl-1.5 text-sm font-medium transition-[background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:border-foreground/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                  active
                    ? "bg-background/15"
                    : "bg-field text-accent-foreground",
                )}
              >
                {item.initials}
              </span>
              {item.customer.split(" ")[0]}
            </button>
          )
        })}
      </div>

      <div key={request.id} className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 motion-safe:animate-rise">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-lg leading-snug font-semibold">
              {request.customer}
            </p>
            <p className="text-sm text-muted-foreground">
              {request.item}, paid {usd(request.paidMinor)}
            </p>
            <p className="mt-1 text-base">“{request.issue}”</p>
          </div>
        </div>

        <Decision request={request} />

        <ul className="flex flex-col gap-2.5" aria-label="What Settlix checked">
          {request.checks.map((check, index) => (
            <li
              key={check.label}
              className="flex items-start gap-3 text-[0.9375rem] leading-snug motion-safe:animate-rise"
              style={{ animationDelay: `${180 + index * 110}ms` }}
            >
              <CheckGlyph ok={check.ok} delay={260 + index * 110} />
              <span>{check.label}</span>
            </li>
          ))}
        </ul>

        <figure
          className="flex flex-col gap-2 rounded-xl bg-muted px-4 py-3.5 motion-safe:animate-rise"
          style={{ animationDelay: "520ms" }}
        >
          <figcaption className="text-sm text-muted-foreground">
            From the return policy, rule {request.quote.key}:{" "}
            {request.quote.title}
          </figcaption>
          <blockquote className="text-[0.9375rem] leading-relaxed">
            “{request.quote.text}”
          </blockquote>
        </figure>
      </div>
    </div>
  )
}
