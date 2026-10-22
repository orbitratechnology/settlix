import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { DEMO_ACCOUNT } from "@/lib/demo"

const footerLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#paperwork", label: "Receipts" },
  { href: "#safeguards", label: "Safeguards" },
  { href: "/login", label: "Sign in" },
]

export function Closing() {
  return (
    <section
      aria-labelledby="closing-title"
      className="mt-32 grid grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:gap-x-6 lg:px-10"
    >
      <h2
        id="closing-title"
        data-reveal
        className="text-[clamp(2.25rem,6vw,5.5rem)] leading-[0.95] font-extrabold tracking-[-0.045em] lg:col-span-7"
      >
        See it settle a real sandbox refund.
      </h2>
      <div
        data-reveal
        className="flex flex-col items-start gap-5 lg:col-span-4 lg:col-start-9 lg:self-end"
      >
        <p className="text-lg leading-relaxed text-pretty">
          Sign in to the demo store as{" "}
          <strong className="font-semibold">{DEMO_ACCOUNT.email}</strong> with
          the password{" "}
          <strong className="font-semibold">{DEMO_ACCOUNT.password}</strong>.
          Every payment there is PayPal Sandbox money.
        </p>
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Open the demo store
        </Link>
      </div>
    </section>
  )
}

/** The footer is the last two rows of a board of filled tiles. */
export function LandingFooter() {
  return (
    <footer className="mt-32 grid grid-cols-2 gap-1.5 p-1.5 lg:grid-cols-12 lg:gap-2 lg:p-2.5">
      <Link
        href="/login"
        className="group order-2 col-span-2 flex min-h-40 flex-col justify-between rounded-2xl bg-primary p-6 text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:order-none lg:col-span-4 lg:col-start-9 lg:row-start-2 lg:min-h-80"
      >
        <span className="text-[1.75rem] leading-tight font-bold tracking-tight">
          Open the demo store
        </span>
        <svg
          aria-hidden
          viewBox="0 0 48 48"
          className="size-12 self-end transition-transform duration-200 group-hover:translate-x-1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 24h32M28 12l12 12-12 12" />
        </svg>
      </Link>

      <div className="order-1 col-span-2 flex min-h-40 items-center justify-center rounded-2xl bg-foreground text-background lg:order-none lg:col-span-8 lg:row-start-2 lg:min-h-80">
        <p
          aria-hidden
          className="text-[clamp(4rem,9vw,9rem)] leading-none font-extrabold tracking-[-0.06em]"
        >
          Settlix
        </p>
      </div>

      <nav
        aria-label="Footer"
        className="order-3 col-span-1 rounded-2xl bg-muted p-5 lg:order-none lg:col-span-3 lg:col-start-5 lg:row-start-1 lg:min-h-56 lg:p-6"
      >
        <ul className="flex flex-col gap-2 text-base">
          {footerLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="underline-offset-4 hover:underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="order-4 col-span-1 flex flex-col justify-between gap-4 rounded-2xl bg-muted p-5 lg:order-none lg:col-span-2 lg:row-start-1 lg:min-h-56 lg:p-6">
        <p className="text-sm text-muted-foreground">Runs on</p>
        <ul className="flex flex-col gap-1 text-base">
          <li>PayPal Sandbox</li>
          <li>Claude</li>
          <li>Supabase</li>
        </ul>
      </div>

      <div className="order-5 col-span-2 flex flex-col justify-between gap-6 rounded-2xl bg-muted p-5 lg:order-none lg:col-span-4 lg:col-start-1 lg:row-start-1 lg:min-h-56 lg:p-6">
        <p className="max-w-[30ch] text-xl leading-snug font-medium tracking-tight">
          Built for the PayPal AI Hackathon 2026.
        </p>
        <p className="text-sm text-muted-foreground">
          A sandbox demonstration. No real payments are processed.
        </p>
      </div>

      <div className="order-6 col-span-2 flex flex-col justify-between gap-4 rounded-2xl bg-muted p-5 lg:order-none lg:col-span-3 lg:row-start-1 lg:min-h-56 lg:p-6">
        <p className="text-sm text-muted-foreground">Demo account</p>
        <p className="text-xl font-medium break-all">{DEMO_ACCOUNT.email}</p>
      </div>
    </footer>
  )
}
