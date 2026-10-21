"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircleIcon, RotateCwIcon, SparklesIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * The AI investigation card: starts a run, shows progress while Claude works,
 * reports failures without touching the case, and refreshes the server view
 * when a run completes.
 */
export function InvestigationRunner({
  caseId,
  hasInvestigation,
  blockedReason,
  className,
  children,
}: {
  caseId: string
  hasInvestigation: boolean
  /** Why a run can't start; null when it can. */
  blockedReason: string | null
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)

  function run() {
    setFailure(null)
    startTransition(async () => {
      let message: string | null = null
      try {
        const response = await fetch(`/api/cases/${caseId}/investigate`, {
          method: "POST",
        })
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null)
          message =
            body && typeof body === "object" && "message" in body
              ? String(body.message)
              : "The investigation failed. The case is unchanged; try again."
        }
      } catch {
        message =
          "Settlix couldn't be reached. Check your connection and try again."
      }
      if (message) setFailure(message)
      router.refresh()
    })
  }

  const label = hasInvestigation
    ? "Re-run investigation"
    : "Start investigation"

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>AI investigation</CardTitle>
        <CardDescription>
          Claude&apos;s reading of the request, with cited policy evidence. It
          is advisory: checks and a merchant decide.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant={hasInvestigation ? "outline" : "default"}
            onClick={run}
            disabled={pending || blockedReason !== null}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : hasInvestigation ? (
              <RotateCwIcon data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            {pending ? "Investigating…" : label}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {blockedReason ? (
          <p className="text-sm text-muted-foreground">{blockedReason}</p>
        ) : null}
        {pending ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border bg-muted/50 p-3 text-sm"
          >
            <Spinner className="mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Claude is investigating</span>
              <span className="text-muted-foreground">
                Reading the request, order, refund history, and active policy.
                This usually takes under a minute. Nothing is refunded.
              </span>
            </div>
          </div>
        ) : null}
        {failure && !pending ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Investigation failed</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
        <div
          aria-busy={pending}
          className={cn("flex flex-col gap-4", pending && "opacity-60")}
        >
          {children}
        </div>
      </CardContent>
    </Card>
  )
}
