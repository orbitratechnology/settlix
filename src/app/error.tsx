"use client"

import { ErrorState } from "@/components/error-state"

/** Landing and sign-in pages. */
export default function RootError({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <ErrorState error={error} retry={retry} />
    </div>
  )
}
