import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function SkeletonLines({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className={index % 3 === 2 ? "h-4 w-2/3" : "h-4 w-full"}
        />
      ))}
    </div>
  )
}

/**
 * Request page layout while it loads: the progress tracker, then the decision
 * and Claude's check beside what the customer asked and the payment.
 */
export function CaseWorkspaceSkeleton() {
  return (
    <>
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Your decision</CardTitle>
              <CardDescription>
                Settlix&apos;s own safety checks and what you can do.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SkeletonLines rows={6} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Claude&apos;s check</CardTitle>
              <CardDescription>
                What Claude suggests and the rules it quoted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SkeletonLines rows={8} />
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>What the customer asked</CardTitle>
            </CardHeader>
            <CardContent>
              <SkeletonLines rows={5} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Order and payment</CardTitle>
            </CardHeader>
            <CardContent>
              <SkeletonLines rows={4} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
