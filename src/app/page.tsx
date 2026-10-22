import Link from "next/link"
import {
  ArrowRightIcon,
  ReceiptTextIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react"

import { BrandLockup } from "@/components/brand"
import { ModeToggle } from "@/components/mode-toggle"
import { SandboxBadge } from "@/components/sandbox-badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const pillars = [
  {
    icon: SparklesIcon,
    title: "Evidence-backed investigation",
    description:
      "Claude reads the request, order facts, and your return policy, then cites the exact clauses behind its recommendation.",
  },
  {
    icon: ScaleIcon,
    title: "Deterministic safeguards",
    description:
      "Server-side rules re-check ownership, refundable balance, currency, and duplicate attempts. AI can't override them.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Merchant approval",
    description:
      "No money moves until an authorized merchant explicitly approves the specific amount for the specific case.",
  },
  {
    icon: ReceiptTextIcon,
    title: "Traceable outcome",
    description:
      "Every case ends in a Resolution Receipt with the PayPal refund ID, the returned status, and a full audit trail.",
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
          <Link href="/">
            <BrandLockup />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline" })}
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 md:px-6 md:py-24">
          <SandboxBadge />
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Resolve payments intelligently.
          </h1>
          <p className="max-w-2xl text-lg text-balance text-muted-foreground">
            Settlix investigates customer refund requests against order and
            policy evidence, validates every proposed action, and executes
            merchant-approved refunds through PayPal with a traceable outcome.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
              Open the dashboard
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
            <Link
              href="/login"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Sign in
            </Link>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((pillar) => (
              <Card key={pillar.title}>
                <CardHeader>
                  <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <pillar.icon className="size-4" />
                  </div>
                  <CardTitle>{pillar.title}</CardTitle>
                  <CardDescription>{pillar.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <span>Settlix · PayPal AI Hackathon 2026</span>
          <span>Sandbox demonstration. No real payments are processed.</span>
        </div>
      </footer>
    </div>
  )
}
