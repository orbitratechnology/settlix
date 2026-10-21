"use client"

import { useState, useTransition } from "react"
import { RefreshCwIcon } from "lucide-react"

import { checkPaymentStatus } from "@/app/(app)/payments/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Re-reads the payment from PayPal and finishes an approved, uncaptured order. */
export function CheckStatusButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await checkPaymentStatus(orderId)
            setMessage(
              outcome.status === "captured"
                ? "Captured."
                : outcome.status === "pending"
                  ? "Still pending at PayPal."
                  : outcome.message,
            )
          })
        }
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <RefreshCwIcon data-icon="inline-start" />
        )}
        Check status
      </Button>
      {message ? (
        <span
          role="status"
          className="max-w-40 text-right text-xs whitespace-normal text-muted-foreground"
        >
          {message}
        </span>
      ) : null}
    </div>
  )
}
