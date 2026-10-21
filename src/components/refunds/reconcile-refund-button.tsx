"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { RefundResult } from "@/lib/refunds/service"

/**
 * Reconciles an unresolved refund with PayPal using the stored request ID.
 * It never creates a new refund.
 */
export function ReconcileRefundButton({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const response = await fetch(
                `/api/cases/${caseId}/reconcile-refund`,
                { method: "POST" },
              )
              const body = (await response.json().catch(() => null)) as
                RefundResult | { message?: string } | null
              setMessage(
                body?.message ?? "PayPal's answer couldn't be read. Try again.",
              )
            } catch {
              setMessage("Settlix couldn't be reached. Try again.")
            }
            router.refresh()
          })
        }
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <RefreshCwIcon data-icon="inline-start" />
        )}
        Check with PayPal
      </Button>
      {message && !pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  )
}
