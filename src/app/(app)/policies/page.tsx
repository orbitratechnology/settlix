import type { Metadata } from "next"
import { PlusIcon, ScrollTextIcon } from "lucide-react"

import { PageContainer, PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export const metadata: Metadata = {
  title: "Policies",
}

export default function PoliciesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Return policies"
        description="Versioned policies with stable clause IDs that investigations cite as evidence."
        actions={
          <Button disabled>
            <PlusIcon data-icon="inline-start" />
            New policy
          </Button>
        }
      />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScrollTextIcon />
          </EmptyMedia>
          <EmptyTitle>No policies yet</EmptyTitle>
          <EmptyDescription>
            Add a return policy with its clauses (return window, full and
            partial refund conditions, exclusions, evidence requirements) so
            investigations can cite it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </PageContainer>
  )
}
