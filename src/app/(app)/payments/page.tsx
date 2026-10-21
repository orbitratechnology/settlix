import type { Metadata } from "next"
import { FlaskConicalIcon, ShoppingCartIcon } from "lucide-react"

import { PageContainer, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"

export const metadata: Metadata = {
  title: "Payments",
}

const environment = [
  { label: "Environment", value: "PayPal Sandbox" },
  { label: "REST API host", value: "api-m.sandbox.paypal.com" },
  { label: "APIs", value: "Orders v2 · Payments v2 (captures, refunds)" },
  { label: "Last sandbox operation", value: "None recorded" },
]

export default function PaymentsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Payments"
        description="PayPal Sandbox connection, test checkout, and captured payments."
      />

      <Alert>
        <FlaskConicalIcon />
        <AlertTitle>Sandbox only</AlertTitle>
        <AlertDescription>
          Every checkout, capture, and refund in Settlix uses the PayPal
          Sandbox. No real money moves.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Integration</CardTitle>
            <CardDescription>
              Non-sensitive connection details. Credentials stay on the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Connection</span>
              <Badge variant="outline">Not checked</Badge>
            </div>
            <Separator />
            <dl className="grid gap-3 text-sm">
              {environment.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium sm:text-right">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test checkout</CardTitle>
            <CardDescription>
              Create and capture a sandbox payment to refund through Settlix.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShoppingCartIcon />
                </EmptyMedia>
                <EmptyTitle>Checkout not available yet</EmptyTitle>
                <EmptyDescription>
                  The sandbox checkout is enabled once the PayPal adapter is
                  connected.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
