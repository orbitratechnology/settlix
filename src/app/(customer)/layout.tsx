import Link from "next/link"

import { BrandMark } from "@/components/brand"

/**
 * Pages customers open from a store's link: the refund request form and the
 * request's status page. A quiet single column that leads with the store's
 * name; Settlix only signs the footer.
 */
export default function CustomerLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/50">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 px-4 pb-8 text-sm text-muted-foreground sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <BrandMark className="size-6" />
          Refund requests handled with Settlix
        </Link>
        <span>Payments in this demo use the PayPal Sandbox.</span>
      </footer>
    </div>
  )
}
