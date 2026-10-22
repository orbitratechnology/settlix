import { cn } from "@/lib/utils"

import { featured, usd } from "./examples"
import { CheckGlyph } from "./request-check"

function MiniButton({
  children,
  primary,
}: {
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium whitespace-nowrap",
        primary
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-background",
      )}
    >
      {children}
    </span>
  )
}

const cells: {
  title: string
  text: string
  fragment: React.ReactNode
}[] = [
  {
    title: "You approve every refund",
    text: "No money moves until someone on your team approves the exact amount for that one request.",
    fragment: (
      <div className="flex flex-col gap-4 p-5">
        <p className="text-lg font-semibold">
          Refund {featured.amount} to {featured.customer}?
        </p>
        <p className="text-sm text-muted-foreground">
          PayPal sends it back to the account Maya paid with.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <MiniButton>Cancel</MiniButton>
          <MiniButton primary>Approve and issue refund</MiniButton>
        </div>
      </div>
    ),
  },
  {
    title: "Claude advises. It can’t pay.",
    text: "Claude reads the request and suggests what to do. It has no way to send, approve, or change a refund.",
    fragment: (
      <div className="flex flex-col gap-2 p-5">
        <p className="text-sm text-muted-foreground">Claude suggests</p>
        <p className="text-2xl font-bold tracking-tight">
          Full refund, {featured.amount}
        </p>
        <p className="text-sm">
          The carafe arrived cracked and the customer sent two photos, which
          rule {featured.quote.key} asks for.
        </p>
      </div>
    ),
  },
  {
    title: "Reasons come from your policy",
    text: "Each suggestion quotes your return policy, and Settlix checks every quote against the real text.",
    fragment: (
      <div className="flex flex-col gap-3 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckGlyph ok className="size-4" />
          Quote matches rule {featured.quote.key} word for word
        </p>
        <blockquote className="text-[0.9375rem] leading-relaxed">
          “{featured.quote.text}”
        </blockquote>
      </div>
    ),
  },
  {
    title: "Never more than was paid",
    text: "At the moment you approve, Settlix checks the payment again, so a refund can’t go over what’s left.",
    fragment: (
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm font-semibold">Walnut desk organizer</p>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${usd(6000)} refunded of ${usd(24000)} paid`}
        >
          <span className="w-1/4 bg-primary" />
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="font-semibold">{usd(24000)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Refunded</dt>
            <dd className="font-semibold">{usd(6000)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Left</dt>
            <dd className="font-semibold">{usd(18000)}</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    title: "One refund per request",
    text: "A request can only have one refund on its way. Approving twice shows the first refund instead of sending a second.",
    fragment: (
      <div className="flex flex-col gap-3 p-5">
        <span className="inline-flex h-6 w-fit items-center rounded-full bg-success/12 px-2.5 text-xs font-semibold text-success">
          Already refunded
        </span>
        <p className="text-[0.9375rem]">
          This request was refunded on Tuesday. Here is that refund; nothing new
          was sent.
        </p>
        <MiniButton>Open the receipt</MiniButton>
      </div>
    ),
  },
  {
    title: "Lost answers get checked",
    text: "If PayPal’s reply gets lost, Settlix asks PayPal about the same refund rather than sending a new one.",
    fragment: (
      <div className="flex flex-col gap-3 p-5">
        <span className="inline-flex h-6 w-fit items-center rounded-full bg-destructive/10 px-2.5 text-xs font-semibold text-destructive">
          Status unknown
        </span>
        <p className="text-[0.9375rem]">
          PayPal didn’t answer in time. Check before doing anything else.
        </p>
        <MiniButton primary>Check with PayPal</MiniButton>
      </div>
    ),
  },
]

/**
 * Safeguards as six filled cells. Text and a real piece of the interface
 * trade places across the grid, so the fragments form a checkerboard.
 */
export function Safeguards() {
  return (
    <section
      id="safeguards"
      aria-labelledby="safeguards-title"
      className="mt-32 scroll-mt-8 px-2 sm:px-3 lg:px-10"
    >
      <h2
        id="safeguards-title"
        data-reveal
        className="mb-12 px-2 text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.05] font-extrabold tracking-[-0.03em] sm:px-3 lg:mb-14 lg:px-0"
      >
        Safe by default
      </h2>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-3 lg:gap-2">
        {cells.map((cell, index) => {
          // Row one runs text, fragment, text at the top; row two the reverse.
          const row = Math.floor(index / 3)
          const fragmentFirst = (index % 3 === 1) !== (row === 1)
          return (
            <article
              key={cell.title}
              data-reveal
              className={cn(
                "flex min-h-[22rem] flex-col justify-between gap-8 overflow-hidden rounded-2xl bg-muted lg:min-h-[27rem]",
                fragmentFirst && "lg:flex-col-reverse",
              )}
            >
              <div className="flex flex-col gap-2 p-6">
                <h3 className="text-lg font-semibold tracking-tight">
                  {cell.title}
                </h3>
                <p className="max-w-[38ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                  {cell.text}
                </p>
              </div>
              <div
                data-ui
                className={cn(
                  "mx-6 w-[min(22rem,calc(100%-3rem))] rounded-t-2xl bg-card text-card-foreground ring-1 ring-foreground/10",
                  index % 2 === 0 ? "self-start" : "self-end",
                  // Docked to the cell's top edge on wide screens.
                  fragmentFirst && "lg:rounded-t-none lg:rounded-b-2xl",
                )}
              >
                {cell.fragment}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
