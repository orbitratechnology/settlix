import { PageContainer } from "@/components/page-header"
import { ReceiptSkeleton } from "@/components/receipts/receipt-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

export default function ReceiptLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <ReceiptSkeleton />
    </PageContainer>
  )
}
