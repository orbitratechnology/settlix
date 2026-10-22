import { Suspense } from "react"
import type { Metadata } from "next"

import { PrintButton } from "@/components/request-form/print-button"
import { QrCode } from "@/components/request-form/qr-code"
import { Skeleton } from "@/components/ui/skeleton"
import { requestFormUrl } from "@/lib/intake/messages"
import { requireMember } from "@/lib/security/auth"
import { siteOrigin } from "@/lib/site"

export const metadata: Metadata = {
  title: "Printable request card",
}

/**
 * A card to print and put in parcels or at the counter: the store's name, the
 * QR code, and the link written out for anyone who can't scan.
 */
export default function RequestCardPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/50 p-6 print:bg-white print:p-0">
      <Suspense
        fallback={
          <Skeleton className="h-[34rem] w-full max-w-sm rounded-2xl" />
        }
      >
        <RequestCard />
      </Suspense>
    </main>
  )
}

async function RequestCard() {
  const [member, origin] = await Promise.all([requireMember(), siteOrigin()])
  const link = requestFormUrl(origin, member.workspace.slug, { via: "print" })
  const shown = link.replace(/^https?:\/\//, "").replace(/\?.*$/, "")

  return (
    <>
      <article className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border bg-white p-8 text-center text-black print:max-w-none print:border-2">
        <p className="text-lg font-semibold">{member.workspace.name}</p>
        <h1 className="text-3xl leading-tight font-extrabold tracking-tight">
          Something wrong with your order?
        </h1>
        <QrCode
          value={link}
          label="QR code that opens the refund request form"
          className="w-56"
        />
        <p className="text-lg">
          Scan to ask for a refund. Have your order number ready.
        </p>
        <p className="font-mono text-sm break-all">{shown}</p>
      </article>
      <PrintButton />
    </>
  )
}
