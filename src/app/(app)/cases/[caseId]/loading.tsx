import { CaseWorkspaceSkeleton } from "@/components/cases/case-workspace-skeleton"
import { PageContainer } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function CaseLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <CaseWorkspaceSkeleton />
    </PageContainer>
  )
}
