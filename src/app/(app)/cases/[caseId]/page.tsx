import type { Metadata } from "next"
import { InfoIcon } from "lucide-react"

import { CaseWorkspaceSkeleton } from "@/components/cases/case-workspace-skeleton"
import { PageContainer, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Case",
}

export default async function CasePage({
  params,
}: PageProps<"/cases/[caseId]">) {
  const { caseId } = await params

  return (
    <PageContainer>
      <PageHeader
        title={`Case ${caseId}`}
        description="Investigate the request against order and policy evidence."
        actions={
          <>
            <Button variant="outline" disabled>
              Request evidence
            </Button>
            <Button disabled>Start investigation</Button>
          </>
        }
      />
      <Alert>
        <InfoIcon />
        <AlertTitle>Workspace preview</AlertTitle>
        <AlertDescription>
          Case records are not connected yet, so no case data, recommendation,
          or refund action is available.
        </AlertDescription>
      </Alert>
      <CaseWorkspaceSkeleton />
    </PageContainer>
  )
}
