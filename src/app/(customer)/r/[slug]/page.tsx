import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StoreIcon } from "lucide-react"

import { RequestForm } from "@/components/customer/request-form"
import { StoreHeader } from "@/components/customer/store-header"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { DEMO_FORM_ORDERS } from "@/lib/demo"
import { cleanVia } from "@/lib/intake/form"
import { findPublicStore } from "@/lib/intake/service"

export const metadata: Metadata = {
  title: "Ask for a refund",
  robots: { index: false, follow: false },
}

// Settlix may email a confirmation and check the request with Claude right
// after the form is sent (after()), within this function's time.
export const maxDuration = 120

function currencySymbol(currency: string) {
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency
  )
}

export default async function RequestPage({
  params,
  searchParams,
}: PageProps<"/r/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const store = await findPublicStore(slug)
  if (!store) notFound()

  const single = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined

  if (!store.formEnabled) {
    return (
      <>
        <StoreHeader storeName={store.name} title="Ask for a refund" />
        <Empty className="border border-dashed bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StoreIcon />
            </EmptyMedia>
            <EmptyTitle>Not taking requests here right now</EmptyTitle>
            <EmptyDescription>
              {store.name} has paused this form. Contact the store directly
              about your order.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    )
  }

  return (
    <>
      <StoreHeader
        storeName={store.name}
        title="Ask for a refund"
        description="Tell us what happened. No account needed: you'll get a private page to follow your request and reply to the store."
      />
      <Card>
        <CardContent>
          <RequestForm
            slug={store.slug}
            storeName={store.name}
            initialOrder={single(query.order)?.slice(0, 80) ?? ""}
            via={cleanVia(single(query.via))}
            currencySymbol={currencySymbol(store.currency)}
            demoOrders={
              store.isDemo
                ? DEMO_FORM_ORDERS.map((order) => ({
                    reference: order.reference,
                    email: order.email,
                    item: order.description.split(",")[0],
                  }))
                : []
            }
          />
        </CardContent>
      </Card>
    </>
  )
}
