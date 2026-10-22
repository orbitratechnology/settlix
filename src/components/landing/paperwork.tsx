"use client"

import { useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"

import { cn } from "@/lib/utils"

import { demoStore, featured, usd } from "./examples"

gsap.registerPlugin(useGSAP)

/** A receipt's torn bottom edge. */
const tornBottom = (() => {
  const teeth = 24
  const points = ["0 0", "100% 0"]
  for (let i = teeth; i >= 0; i--) {
    const x = (i / teeth) * 100
    points.push(`${x}% ${i % 2 === 0 ? "100%" : "calc(100% - 10px)"}`)
  }
  return `polygon(${points.join(", ")})`
})()

function Row({
  label,
  value,
  strong,
  money,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
  money?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn("text-right", money && "figures", strong && "font-bold")}
      >
        {value}
      </dd>
    </div>
  )
}

export function ReceiptSheet() {
  return (
    <div
      className="flex w-[min(24rem,100%)] flex-col gap-5 bg-paper px-6 pt-6 pb-10 text-[0.9375rem] text-foreground"
      style={{ clipPath: tornBottom }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold tracking-tight">Resolution receipt</p>
          <p className="text-sm text-muted-foreground">
            Case {featured.caseNumber}, example
          </p>
        </div>
        <span className="inline-flex h-6 items-center rounded-full bg-success/12 px-2.5 text-xs font-semibold text-success">
          Refunded
        </span>
      </div>
      <dl className="flex flex-col gap-2">
        <Row label="Customer" value={featured.customer} />
        <Row label="Order" value={featured.order} />
        <Row label="Item" value={featured.item} />
      </dl>
      <div className="flex flex-col gap-1.5 rounded-lg bg-muted px-3.5 py-3">
        <p className="font-semibold">Full refund</p>
        <p className="text-sm text-muted-foreground">
          Rule {featured.quote.key}: {featured.quote.title}
        </p>
      </div>
      <dl className="flex flex-col gap-2">
        <Row label="Paid" value={featured.amount} money />
        <Row label="Refunded" value={featured.amount} money />
        <Row label="Left to refund" value={usd(0)} strong money />
      </dl>
      <dl className="flex flex-col gap-2 border-t border-dashed pt-4">
        <Row label="Approved by" value="You, the store owner" />
        <Row label="PayPal says" value="Completed" />
      </dl>
    </div>
  )
}

function ReplySheet() {
  return (
    <div className="flex w-[min(28rem,100%)] flex-col gap-4 rounded-sm bg-paper px-6 py-6 text-foreground">
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 text-muted-foreground">To</dt>
          <dd>{featured.customer}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 text-muted-foreground">Subject</dt>
          <dd>Your refund for order {featured.order}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-3 text-base leading-relaxed">
        <p>Hi {featured.firstName},</p>
        <p>
          Thank you for the photos of the cracked carafe. Our return policy
          covers items that arrive damaged, so we have refunded{" "}
          {featured.amount} to the PayPal account you paid with.
        </p>
        <p>
          PayPal usually shows the refund within a few days. You don&apos;t need
          to send the set back.
        </p>
        <p>
          Best wishes,
          <br />
          {demoStore}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Settlix drafts this from the case facts. You edit it and send it
        yourself.
      </p>
    </div>
  )
}

const activity = [
  { time: "09:12", who: "Maya", what: `Asked for ${featured.amount} back` },
  {
    time: "09:13",
    who: "Claude",
    what: `Checked the request and suggested a full refund, quoting rule ${featured.quote.key}`,
  },
  { time: "09:13", who: "Settlix", what: "Every safety check passed" },
  {
    time: "10:02",
    who: "You",
    what: `Approved a refund of ${featured.amount}`,
  },
  { time: "10:02", who: "Settlix", what: "Sent the refund to PayPal" },
  { time: "10:03", who: "PayPal", what: "Confirmed the refund is completed" },
]

function ActivitySheet() {
  return (
    <div className="flex w-[min(32rem,100%)] flex-col gap-4 rounded-sm bg-paper px-6 py-6 text-foreground">
      <div>
        <p className="text-lg font-bold tracking-tight">Case activity</p>
        <p className="text-sm text-muted-foreground">
          Case {featured.caseNumber}, example. Entries can&apos;t be edited or
          deleted.
        </p>
      </div>
      <ol className="flex flex-col">
        {activity.map((entry, index) => (
          <li key={index} className="grid grid-cols-[3.25rem_1fr] gap-3 py-2">
            <span className="figures pt-px text-sm text-muted-foreground">
              {entry.time}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{entry.who}</span>
              <span className="text-[0.9375rem]">{entry.what}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const outputs = [
  { id: "receipt", label: "The receipt", sheet: ReceiptSheet },
  { id: "reply", label: "The reply to Maya", sheet: ReplySheet },
  { id: "activity", label: "The activity log", sheet: ActivitySheet },
] as const

/**
 * What every case leaves behind: pick a document on the left and it lies on
 * the stage at its real size. The swap is a short GSAP crossfade.
 */
export function Paperwork() {
  const [selectedId, setSelectedId] =
    useState<(typeof outputs)[number]["id"]>("receipt")
  const stage = useRef<HTMLDivElement>(null)
  const selected = outputs.find((o) => o.id === selectedId) ?? outputs[0]
  const Sheet = selected.sheet

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-sheet]", {
          autoAlpha: 0,
          y: 24,
          rotate: -1.5,
          duration: 0.45,
          ease: "power3.out",
        })
      })
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.from("[data-sheet]", { autoAlpha: 0, duration: 0.15 })
      })
    },
    { scope: stage, dependencies: [selectedId], revertOnUpdate: true },
  )

  return (
    <section
      id="paperwork"
      aria-labelledby="paperwork-title"
      className="mt-32 grid scroll-mt-8 grid-cols-1 gap-y-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-x-6 lg:px-10"
    >
      <div className="flex flex-col gap-8 lg:col-span-5 lg:pt-16">
        <div data-reveal className="flex flex-col gap-3">
          <h2
            id="paperwork-title"
            className="text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.05] font-extrabold tracking-[-0.03em]"
          >
            Every case ends in writing
          </h2>
          <p className="max-w-[44ch] text-lg leading-relaxed text-pretty">
            When a case closes you have a receipt to keep, a reply ready for the
            customer, and a log of who did what. Choose one to see it.
          </p>
        </div>
        <div
          data-reveal
          role="group"
          aria-label="Choose a document"
          className="-mx-4 flex snap-x scroll-px-4 gap-5 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
        >
          {outputs.map((output) => {
            const active = output.id === selected.id
            return (
              <button
                key={output.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedId(output.id)}
                className={cn(
                  "shrink-0 snap-start rounded-lg text-left text-[clamp(1.375rem,3.4vw,3rem)] leading-[1.15] font-extrabold tracking-[-0.03em] whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {output.label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={stage}
        className="relative -mx-4 flex min-h-[38rem] items-start overflow-hidden bg-field px-4 pt-10 sm:-mx-6 sm:px-10 lg:col-span-7 lg:mx-0 lg:min-h-[44rem] lg:px-16 lg:pt-16"
      >
        <div data-ui data-sheet className="w-full">
          <Sheet />
        </div>
      </div>
    </section>
  )
}
