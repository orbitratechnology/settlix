import { cn } from "@/lib/utils"

import { featured } from "./examples"
import { CheckGlyph } from "./request-check"

type Stage = {
  clause: string
  field: string
  status: { label: string; className: string }
  body: React.ReactNode
}

function Pill({ className, children }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  )
}

function Line({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(strong && "text-base font-bold")}>{value}</span>
    </div>
  )
}

const stages: Stage[] = [
  {
    clause: "First, a customer asks for their money back.",
    field: "bg-field text-foreground",
    status: { label: "New", className: "bg-secondary text-foreground" },
    body: (
      <>
        <p className="text-[0.9375rem]">“{featured.issue}”</p>
        <Line label="Asks for" value={featured.amount} strong />
      </>
    ),
  },
  {
    clause: "Then Claude checks it against your policy.",
    field: "bg-field-2 text-field-2-foreground",
    status: {
      label: "Ready to approve",
      className: "bg-primary/10 text-accent-foreground dark:text-primary",
    },
    body: (
      <>
        <ul className="flex flex-col gap-1.5 text-sm">
          {["Paid with PayPal", "Within 30 days", "Photos of the crack"].map(
            (item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckGlyph ok className="size-4" />
                {item}
              </li>
            ),
          )}
        </ul>
        <p className="text-sm text-muted-foreground">
          Suggests a full refund, quoting rule{" "}
          <span className="whitespace-nowrap">{featured.quote.key}</span>
        </p>
      </>
    ),
  },
  {
    clause: "Then you approve the amount. Nothing moves before that.",
    field: "bg-field-3 text-field-3-foreground",
    status: {
      label: "Refund in progress",
      className: "bg-primary/10 text-accent-foreground dark:text-primary",
    },
    body: (
      <>
        <Line label="Approved by" value="You" />
        <Line label="Refund" value={featured.amount} strong />
        <p className="text-sm text-muted-foreground">Sent to PayPal</p>
      </>
    ),
  },
  {
    clause: "Finally, PayPal pays it back and you get a receipt.",
    field: "bg-stage text-stage-foreground",
    status: { label: "Refunded", className: "bg-success/12 text-success" },
    body: (
      <>
        <Line label="Back to Maya" value={featured.amount} strong />
        <Line label="PayPal says" value="Completed" />
        <p className="text-sm text-muted-foreground">Receipt ready to share</p>
      </>
    ),
  },
]

/**
 * "How it works": the same request card in four colour fields, one step
 * further along in each. On wide screens a route runs through the fields at
 * the cards' header line and draws itself as the section scrolls past.
 */
export function Lifecycle() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      data-lifecycle
      className="mt-24 grid scroll-mt-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
    >
      {stages.map((stage, index) => (
        <div
          key={stage.clause}
          className={cn(
            "relative flex min-h-[30rem] flex-col justify-between gap-10 px-5 py-8 sm:px-8 xl:block xl:min-h-[max(84svh,40rem)] xl:p-0",
            stage.field,
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 top-[calc(38%+1.4rem)] hidden h-1 w-full origin-left opacity-60 xl:block"
            data-route
          >
            <line
              x1="0"
              y1="2"
              x2="100"
              y2="2"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="6 6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {index === 0 ? (
            <h2
              id="how-title"
              data-reveal
              className="text-[clamp(1.75rem,2.4vw,2.25rem)] leading-[1.05] font-extrabold tracking-[-0.03em] xl:absolute xl:top-9 xl:right-7 xl:left-7"
            >
              How a refund gets settled
            </h2>
          ) : null}

          <div className="w-full max-w-[19rem] xl:absolute xl:top-[38%] xl:left-1/2 xl:w-[calc(100%-3.5rem)] xl:-translate-x-1/2">
            <div
              data-ui
              data-reveal
              className="flex flex-col gap-3 rounded-2xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 transition-transform duration-150 hover:-translate-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {featured.customer}
                </span>
                <Pill className={stage.status.className}>
                  {stage.status.label}
                </Pill>
              </div>
              <p className="-mt-2 text-sm text-muted-foreground">
                {featured.item}
              </p>
              {stage.body}
            </div>
          </div>

          <p
            data-reveal
            className="max-w-[18ch] text-[clamp(1.375rem,1.9vw,1.875rem)] leading-[1.12] font-semibold tracking-[-0.02em] text-balance xl:absolute xl:right-7 xl:bottom-9 xl:left-7"
          >
            {stage.clause}
          </p>
        </div>
      ))}
    </section>
  )
}
