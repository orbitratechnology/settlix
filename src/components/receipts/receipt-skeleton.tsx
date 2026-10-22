import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Receipt page layout while it loads: the receipt beside the reply. */
export function ReceiptSkeleton() {
  return (
    <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 rounded-xl bg-card px-6 py-7 ring-1 ring-foreground/10 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72 max-w-full" />
        <Skeleton className="h-10 w-32" />
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton
            key={index}
            className={index % 2 ? "h-5 w-3/4" : "h-5 w-full"}
          />
        ))}
      </div>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Reply to the customer</CardTitle>
            <CardDescription>A draft you can edit and copy.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Why</CardTitle>
            <CardDescription>
              Claude&apos;s suggestion and the rules it quoted.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
