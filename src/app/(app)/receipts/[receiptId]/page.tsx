import type { Metadata } from "next"
import { CopyIcon, InfoIcon } from "lucide-react"

import { ReceiptSkeleton } from "@/components/receipts/receipt-skeleton"
import { PageContainer, PageHeader } from "@/components/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Resolution Receipt",
}

export default async function ReceiptPage({
  params,
}: PageProps<"/receipts/[receiptId]">) {
  const { receiptId } = await params

  return (
    <PageContainer>
      <PageHeader
        title="Resolution Receipt"
        description={`Receipt ${receiptId}`}
        actions={
          <Button variant="outline" disabled>
            <CopyIcon data-icon="inline-start" />
            Copy summary
          </Button>
        }
      />
      <Alert>
        <InfoIcon />
        <AlertTitle>Receipt preview</AlertTitle>
        <AlertDescription>
          Receipts are built only from persisted records. None exist yet, so
          nothing here represents a real refund.
        </AlertDescription>
      </Alert>
      <ReceiptSkeleton />
    </PageContainer>
  )
}
