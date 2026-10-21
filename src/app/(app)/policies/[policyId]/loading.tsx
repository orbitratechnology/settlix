import { PageContainer } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function PolicyVersionLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </PageContainer>
  )
}
