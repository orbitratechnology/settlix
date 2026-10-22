"use client"

import { useEffect } from "react"
import Link from "next/link"
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * Fallback for an unexpected error while rendering a page. It doesn't claim
 * whether anything changed: a failed action may have been partly applied, so
 * the merchant is pointed at the record's current state instead.
 */
export function ErrorState({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  // Server errors arrive without their message in production, only a digest
  // that matches the server log.
  const digest =
    error instanceof Error && "digest" in error
      ? String((error as Error & { digest?: string }).digest ?? "")
      : ""

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Empty className="min-h-[60svh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>
          Settlix couldn&apos;t load this page, possibly because a service is
          briefly unavailable. If you were changing a case or a refund, check
          its current state before trying again.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>
            <RotateCcwIcon data-icon="inline-start" />
            Try again
          </Button>
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "outline" })}
          >
            Go to dashboard
          </Link>
        </div>
        {digest ? (
          <p className="text-xs text-muted-foreground">
            Reference <span className="font-mono">{digest}</span>
          </p>
        ) : null}
      </EmptyContent>
    </Empty>
  )
}
