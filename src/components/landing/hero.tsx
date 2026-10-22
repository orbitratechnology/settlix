import Link from "next/link"

import { BrandLockup } from "@/components/brand"
import { ModeToggle } from "@/components/mode-toggle"
import { buttonVariants } from "@/components/ui/button"
import { CheckGlyph, RequestCheck } from "./request-check"

const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#paperwork", label: "Receipts" },
  { href: "#safeguards", label: "Safeguards" },
]

/** The stage's top-left corner is torn like the edge of a receipt. */
const tornEdge = (() => {
  const teeth = 16
  const width = 14
  const points: string[] = []
  for (let i = 0; i <= teeth; i++) {
    points.push(`${i * width}px ${i % 2 === 0 ? 44 : 30}px`)
  }
  return `polygon(${[
    ...points,
    `${teeth * width}px 0`,
    "100% 0",
    "100% 100%",
    "0 100%",
  ].join(", ")})`
})()

const promises = [
  "Checks every request against your own return policy",
  "Sends nothing to PayPal until you approve",
  "Ends every case with a receipt you can share",
]

export function LandingNav() {
  return (
    <header className="relative z-10">
      <nav
        aria-label="Main"
        className="flex h-[4.5rem] items-center gap-6 px-4 sm:px-6 lg:px-10"
      >
        <Link href="/" aria-label="Settlix home" className="rounded-lg">
          <BrandLockup />
        </Link>
        <ul className="ml-auto hidden items-center gap-7 text-[0.9375rem] font-medium md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="underline-offset-[6px] transition-colors hover:text-primary hover:underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ModeToggle />
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline" })}
          >
            Sign in
          </Link>
        </div>
      </nav>
    </header>
  )
}

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      data-hero
      className="relative grid grid-cols-1 overflow-hidden px-4 sm:px-6 lg:min-h-[calc(100svh-4.5rem)] lg:grid-cols-12 lg:gap-x-6 lg:px-10"
    >
      <h1
        id="hero-title"
        className="pt-10 text-[clamp(2.75rem,10.5vw,5.25rem)] leading-[0.92] font-extrabold tracking-[-0.045em] lg:col-span-8 lg:pt-[7vh] lg:text-[clamp(3.5rem,5.6vw,5.25rem)]"
      >
        Refunds, settled
        <br className="hidden sm:inline" /> with proof.
      </h1>

      <div className="flex flex-col gap-6 pt-6 lg:col-span-5 lg:row-start-2 lg:pt-8 lg:pb-16">
        <p className="max-w-[40ch] text-lg leading-relaxed text-pretty sm:text-xl">
          Settlix checks each refund request against the order and your return
          policy. You approve it, PayPal pays the customer back, and a receipt
          records every step.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            Try the demo store
          </Link>
          <span className="text-sm text-muted-foreground">
            PayPal Sandbox only. No real money moves.
          </span>
        </div>
        <ul className="mt-6 hidden flex-col gap-3.5 lg:flex">
          {promises.map((promise, index) => (
            <li
              key={promise}
              className="flex items-center gap-3 text-base motion-safe:animate-rise"
              style={{ animationDelay: `${900 + index * 140}ms` }}
            >
              <CheckGlyph ok delay={1000 + index * 140} />
              {promise}
            </li>
          ))}
        </ul>
      </div>

      {/* The stage: a flat PayPal-blue field that opens like a shutter. */}
      <div className="relative -mx-4 mt-12 motion-safe:animate-shutter sm:-mx-6 lg:col-span-7 lg:col-start-6 lg:row-start-2 lg:mt-8 lg:mr-[-2.5rem] lg:ml-0">
        <div
          className="absolute inset-0 bg-stage"
          style={{ clipPath: tornEdge }}
        />
        <div className="relative px-4 pt-16 pb-12 sm:px-10 sm:pt-20 lg:pr-10 lg:pb-16 lg:pl-14">
          <div data-hero-fragment>
            <div className="motion-safe:animate-settle">
              <RequestCheck className="max-w-[40rem]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export { tornEdge }
