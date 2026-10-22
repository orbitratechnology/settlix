import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"

import { BrandLockup } from "@/components/brand"
import { ReceiptSheet } from "@/components/landing/paperwork"
import { LoginForm, LoginFormWithRedirect } from "@/components/login-form"

export const metadata: Metadata = {
  title: "Sign in",
}

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <Link href="/" aria-label="Settlix home" className="w-fit rounded-lg">
          <BrandLockup />
        </Link>
        <main className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-sm flex-col gap-6">
            {/* The redirect target is request-time; the static shell renders the plain form. */}
            <Suspense fallback={<LoginForm next={null} />}>
              <LoginFormWithRedirect />
            </Suspense>
          </div>
        </main>
      </div>

      {/* The product's own artefact: an example receipt on the brand stage. */}
      <aside
        aria-label="Example receipt"
        className="relative hidden flex-col items-center justify-center gap-6 overflow-hidden bg-stage p-10 text-stage-foreground lg:flex"
      >
        <div data-ui className="w-full max-w-sm -rotate-2">
          <ReceiptSheet />
        </div>
        <p className="max-w-sm text-center text-base text-stage-foreground/85">
          Every request ends with a receipt like this one: what was asked, what
          your policy says, who approved it, and what PayPal did.
        </p>
      </aside>
    </div>
  )
}
