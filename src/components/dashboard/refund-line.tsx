import Link from "next/link"

import type { CaseStatus } from "@/lib/domain/labels"
import { cn } from "@/lib/utils"

type Station = {
  label: string
  statuses: CaseStatus[]
  /** Stations where a person has to act carry the data hue. */
  needsYou?: boolean
  href: string
  hint: (counts: Record<CaseStatus, number>) => string
}

const stations: Station[] = [
  {
    label: "New",
    statuses: ["NEW", "INVESTIGATING"],
    href: "/cases?view=NEW",
    hint: (c) =>
      c.INVESTIGATING > 0
        ? `${c.INVESTIGATING} being checked`
        : "Not checked yet",
  },
  {
    label: "Waiting on customer",
    statuses: ["NEEDS_EVIDENCE"],
    href: "/cases?view=NEEDS_EVIDENCE",
    hint: () => "Asked for a photo or details",
  },
  {
    label: "Needs your review",
    statuses: ["NEEDS_REVIEW"],
    needsYou: true,
    href: "/cases?view=NEEDS_REVIEW",
    hint: () => "A person has to decide",
  },
  {
    label: "Ready to approve",
    statuses: ["READY_FOR_APPROVAL"],
    needsYou: true,
    href: "/cases?view=READY_FOR_APPROVAL",
    hint: () => "Every check passed",
  },
  {
    label: "Refund in progress",
    statuses: ["REFUND_PENDING"],
    href: "/cases?view=REFUND_PENDING",
    hint: () => "PayPal is working on it",
  },
  {
    label: "Done",
    statuses: ["REFUNDED", "NOT_ELIGIBLE"],
    href: "/cases?view=REFUNDED",
    hint: (c) => `${c.REFUNDED} refunded, ${c.NOT_ELIGIBLE} closed without one`,
  },
]

/**
 * Where every request is right now, as stations on one line from "New" to
 * "Done". Each station opens the inbox filtered to it.
 */
export function RefundLine({ counts }: { counts: Record<CaseStatus, number> }) {
  return (
    <nav aria-label="Requests by stage" className="relative">
      {/* The line the requests travel along (wide screens). */}
      <div
        aria-hidden
        className="absolute top-[1.375rem] right-[8%] left-[8%] hidden h-0.5 rounded-full bg-border @5xl/main:block"
      />
      <ol className="relative grid grid-cols-1 gap-y-1 @2xl/main:grid-cols-3 @2xl/main:gap-x-4 @2xl/main:gap-y-6 @5xl/main:grid-cols-6 @5xl/main:gap-x-2">
        {stations.map((station) => {
          const count = station.statuses.reduce((sum, s) => sum + counts[s], 0)
          const hot = station.needsYou && count > 0
          return (
            <li key={station.label}>
              <Link
                href={station.href}
                className="group flex items-center gap-4 rounded-xl p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 @2xl/main:flex-col @2xl/main:items-start @2xl/main:gap-3 @5xl/main:items-center @5xl/main:text-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full border-2 bg-background text-lg font-bold transition-transform group-hover:-translate-y-0.5",
                    hot
                      ? "border-primary bg-primary text-primary-foreground"
                      : count > 0
                        ? "border-foreground/70 text-foreground"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {count}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold underline-offset-4 group-hover:underline">
                    {station.label}
                    <span className="sr-only">: {count}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {station.hint(counts)}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
