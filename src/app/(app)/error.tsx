"use client"

import { ErrorState } from "@/components/error-state"
import { PageContainer } from "@/components/page-header"

/** Keeps the sidebar shell when a dashboard page fails to render. */
export default function AppError({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  return (
    <PageContainer>
      <ErrorState error={error} retry={retry} />
    </PageContainer>
  )
}
