import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"

import { BrandMark } from "@/components/brand"
import { LoginForm, LoginFormWithRedirect } from "@/components/login-form"

export const metadata: Metadata = {
  title: "Sign in",
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium"
        >
          <BrandMark className="size-6 rounded-md" />
          Settlix
        </Link>
        {/* The redirect target is request-time; the static shell renders the plain form. */}
        <Suspense fallback={<LoginForm next={null} />}>
          <LoginFormWithRedirect />
        </Suspense>
      </div>
    </div>
  )
}
