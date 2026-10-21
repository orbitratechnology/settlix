"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  INSTANCE_LOADING_STATE,
  PayPalOneTimePaymentButton,
  PayPalProvider,
  usePayPal,
} from "@paypal/react-paypal-js/sdk-v6"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  InfoIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import type { CheckoutOutcome } from "@/lib/payments/checkout"
import { formatMoney } from "@/lib/money/amounts"

export type CheckoutItem = {
  id: string
  name: string
  description: string
  amountMinor: number
  currency: string
}

type Notice = {
  tone: "success" | "info" | "error" | "pending"
  title: string
  body: string
} | null

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string
  }
  if (!response.ok && response.status !== 202 && response.status !== 422) {
    throw new Error(data.message ?? "Request failed")
  }
  return data
}

function PayPalButtonArea({
  itemId,
  onNotice,
}: {
  itemId: string
  onNotice: (notice: Notice) => void
}) {
  const router = useRouter()
  const { loadingStatus, error } = usePayPal()

  if (loadingStatus === INSTANCE_LOADING_STATE.REJECTED || error) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>PayPal checkout couldn&apos;t load</AlertTitle>
        <AlertDescription>
          Refresh the page to try again. No payment was started.
        </AlertDescription>
      </Alert>
    )
  }
  if (loadingStatus === INSTANCE_LOADING_STATE.PENDING) {
    return <Skeleton className="h-11 w-full rounded-full" />
  }

  return (
    <PayPalOneTimePaymentButton
      type="pay"
      createOrder={async () => {
        onNotice(null)
        // The browser sends only the catalog item ID; the server sets the price.
        const { orderId } = await postJson<{ orderId: string }>(
          "/api/paypal/orders",
          { itemId },
        )
        return { orderId }
      }}
      onApprove={async ({ orderId }) => {
        onNotice({
          tone: "pending",
          title: "Capturing payment…",
          body: "Confirming the result with PayPal.",
        })
        const outcome = await postJson<CheckoutOutcome>(
          `/api/paypal/orders/${encodeURIComponent(orderId)}/capture`,
        )
        if (outcome.status === "captured") {
          onNotice({
            tone: "success",
            title: "Payment captured",
            body: `PayPal Sandbox capture ${outcome.captureId} completed. Open a refund case for it below.`,
          })
        } else if (outcome.status === "pending") {
          onNotice({
            tone: "info",
            title: "Payment pending",
            body: `PayPal reports capture ${outcome.captureId} as pending. It isn't paid yet.`,
          })
        } else {
          onNotice({
            tone: outcome.status === "unknown" ? "info" : "error",
            title:
              outcome.status === "unknown"
                ? "Payment not confirmed yet"
                : "Payment not completed",
            body: outcome.message,
          })
        }
        router.refresh()
      }}
      onCancel={() => {
        onNotice({
          tone: "info",
          title: "Checkout cancelled",
          body: "The PayPal window was closed. Nothing was charged.",
        })
        router.refresh()
      }}
      onError={() => {
        onNotice({
          tone: "error",
          title: "Checkout failed",
          body: "PayPal reported an error. Nothing was charged.",
        })
      }}
    />
  )
}

const noticeIcons = {
  success: CheckCircle2Icon,
  info: InfoIcon,
  pending: ClockIcon,
  error: AlertCircleIcon,
}

export function SandboxCheckout({
  clientId,
  items,
}: {
  clientId: string
  items: CheckoutItem[]
}) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "")
  const [notice, setNotice] = useState<Notice>(null)
  const Icon = notice ? noticeIcons[notice.tone] : null

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={itemId}
        onValueChange={(value) => setItemId(String(value))}
        aria-label="Sandbox test item"
      >
        {items.map((item) => (
          <FieldLabel key={item.id} htmlFor={`item-${item.id}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{item.name}</FieldTitle>
                <FieldDescription>{item.description}</FieldDescription>
              </FieldContent>
              <span className="text-sm font-medium tabular-nums">
                {formatMoney(item.amountMinor, item.currency)}
              </span>
              <RadioGroupItem value={item.id} id={`item-${item.id}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>

      <PayPalProvider
        clientId={clientId}
        environment="sandbox"
        components={["paypal-payments"]}
        pageType="checkout"
      >
        <PayPalButtonArea itemId={itemId} onNotice={setNotice} />
      </PayPalProvider>

      {notice && Icon ? (
        <Alert variant={notice.tone === "error" ? "destructive" : "default"}>
          <Icon />
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.body}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
